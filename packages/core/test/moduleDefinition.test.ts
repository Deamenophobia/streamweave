import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defineModule,
  input,
  inputValue,
  makeNode,
  output,
  parameterMaximum,
  runModule,
  validateParameters,
  WORKBENCH_MODULES,
  type ModuleContext,
} from "../src/index.js";

const context: ModuleContext = {
  node: makeNode("example", "scale", 0, 0, { gain: 3 }),
  datasets: new Map(),
  inputs: [
    {
      edge: {
        id: "input",
        source: "source",
        sourcePort: "series",
        target: "example",
        targetPort: "values",
      },
      data: {
        kind: "series",
        name: "Fixture",
        unit: "units",
        points: [
          { timestampMs: 0, value: 2, status: "valid" },
          { timestampMs: 1, value: null, status: "missing" },
          { timestampMs: 2, value: 4, status: "valid" },
        ],
      },
    },
  ],
};

test("a standalone definition supplies defaults and runs through the shared contract", () => {
  const definition = defineModule({
    title: "Fixture operation",
    category: "Process",
    description: "Independent extension fixture",
    inputs: [input("values", ["series"])],
    outputs: [output("result", "series")],
    parameters: [{ kind: "number", key: "gain", label: "Gain", default: 2, min: 1, max: 5 }],
    evaluate(context) {
      const series = inputValue(context, "values", ["series"]);
      return {
        result: {
          ...series,
          points: series.points.map((point) => ({
            ...point,
            value: point.value === null ? null : point.value * Number(context.node.params.gain),
          })),
        },
      };
    },
  });
  assert.deepEqual(definition.defaults, { gain: 2 });
  const result = runModule(definition, context).result;
  assert.equal(result?.kind, "series");
  if (result?.kind !== "series") throw new Error("Expected a series");
  assert.deepEqual(
    result.points.map((point) => point.value),
    [6, null, 12],
  );
  assert.equal(result.points[1]?.status, "missing");
  assert.throws(
    () => runModule(definition, { ...context, node: { ...context.node, params: { gain: 6 } } }),
    /gain must/,
  );
});

test("contract failures are caught before invalid data can feed another module", () => {
  let calls = 0;
  const definition = defineModule({
    title: "Invalid fixture",
    category: "Process",
    description: "Port checks",
    inputs: [input("values", ["series"])],
    outputs: [output("result", "table")],
    parameters: [],
    evaluate(context) {
      calls++;
      return { result: inputValue(context, "values", ["series"]) };
    },
  });
  assert.throws(() => runModule(definition, { ...context, inputs: [] }), /Connect 1/);
  assert.equal(calls, 0);
  assert.throws(() => runModule(definition, context), /Invalid output contract/);
  assert.throws(
    () =>
      runModule(
        {
          ...definition,
          outputs: [output("result", "series")],
          evaluate: () => ({
            result: {
              kind: "series",
              name: "Invalid",
              unit: "units",
              points: [{ timestampMs: 0, value: Infinity, status: "valid" }],
            },
          }),
        },
        context,
      ),
    /Non-finite/,
  );
});

test("all built-in defaults pass their schemas and dependent limits agree with validation", () => {
  for (const definition of Object.values(WORKBENCH_MODULES)) {
    assert.equal(
      new Set(definition.parameters.map((field) => field.key)).size,
      definition.parameters.length,
    );
    assert.doesNotThrow(() => validateParameters(definition.parameters, definition.defaults));
  }
  const correlation = WORKBENCH_MODULES.correlation;
  const minimum = correlation.parameters.find((field) => field.key === "minimum");
  assert.equal(minimum?.kind, "number");
  if (minimum?.kind !== "number") throw new Error("Expected a numeric minimum");
  assert.equal(parameterMaximum(minimum, { window: 8 }), 8);
  assert.throws(
    () =>
      validateParameters(correlation.parameters, {
        ...correlation.defaults,
        window: 8,
        minimum: 9,
      }),
    /minimum must/,
  );
  assert.throws(
    () => validateParameters(correlation.parameters, { ...correlation.defaults, window: 2 }),
    /window must/,
  );
  assert.throws(
    () => validateParameters(correlation.parameters, { ...correlation.defaults, window: 8.5 }),
    /integer/,
  );
});
