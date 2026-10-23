import assert from "node:assert/strict";
import { test } from "node:test";
import { multiSourceExample, type NodeResult } from "@streamweave/core";
import { parameterOptions } from "../src/parameterOptions";

test("column controls resolve the declared dataset rather than the first dataset", () => {
  const project = multiSourceExample();
  const second = project.datasets[1]!;
  second.columns.push({ key: "extra", label: "Second only", type: "number", unit: "K" });
  const options = parameterOptions(
    {
      kind: "column",
      key: "column",
      label: "Value",
      default: "",
      from: { dataset: "datasetId" },
      numericOnly: true,
    },
    {
      params: { datasetId: second.id },
      datasets: project.datasets,
    },
  );
  assert.deepEqual(
    options.map((option) => option.value),
    ["reading", "extra"],
  );
  assert.equal(options[1]?.label, "Second only (K)");
});

test("column controls use their declared input port and tolerate unavailable data", () => {
  const data = multiSourceExample().datasets[0]!;
  const edge = {
    id: "one",
    source: "source",
    sourcePort: "data",
    target: "filter",
    targetPort: "other",
  };
  const result: NodeResult = {
    state: "ready",
    outputs: {},
    inputs: [
      { edge, data },
      {
        edge: { ...edge, id: "two", targetPort: "data" },
        data: {
          kind: "table",
          columns: [{ key: "wanted", label: "Wanted", type: "string" }],
          rows: [],
        },
      },
    ],
  };
  const field = {
    kind: "column" as const,
    key: "column",
    label: "Column",
    default: "",
    from: { input: "data" },
  };
  assert.deepEqual(parameterOptions(field, { params: {}, datasets: [], result }), [
    { value: "wanted", label: "Wanted" },
  ]);
  assert.deepEqual(parameterOptions(field, { params: {}, datasets: [] }), []);
});
