import assert from "node:assert/strict";
import { test } from "node:test";
import { executeWorkbench, multiSourceExample, pressureExample } from "@streamweave/core";
import { calculationKey, calculationRequest } from "../src/execution/calculation";

test("workspace naming and node layout do not invalidate calculations", () => {
  const project = multiSourceExample();
  const originalPosition = { ...project.graph.nodes[0]!.position };
  const edited = structuredClone(project);
  edited.graph.name = "Renamed workspace";
  edited.graph.nodes[0]!.position = { x: 800, y: -500 };
  assert.equal(calculationKey(edited), calculationKey(project));
  for (const name of ["", "Temporary name", "Name".repeat(40)]) {
    edited.graph.name = name;
    const request = calculationRequest(edited);
    assert.deepEqual(
      structuredClone(executeWorkbench(request.graph, request.datasets)),
      structuredClone(executeWorkbench(project.graph, project.datasets)),
    );
  }
  assert.deepEqual(project.graph.nodes[0]!.position, originalPosition);
});

test("parameters and wiring invalidate calculations, and source data stays in each request", () => {
  const project = multiSourceExample();
  const parameters = structuredClone(project);
  parameters.graph.nodes.find((node) => node.type === "align")!.params.maxAgeMs = 999;
  assert.notEqual(calculationKey(parameters), calculationKey(project));
  const wiring = structuredClone(project);
  wiring.graph.edges.pop();
  assert.notEqual(calculationKey(wiring), calculationKey(project));
  const request = calculationRequest(project);
  assert.equal(request.datasets, project.datasets);
});

test("node titles remain dependencies while they label calculated outputs", () => {
  const project = pressureExample();
  const originalKey = calculationKey(project);
  const node = project.graph.nodes.find((node) => node.type === "pressure")!;
  node.title = "Renamed pressure output";
  assert.notEqual(calculationKey(project), originalKey);
  const request = calculationRequest(project);
  const run = executeWorkbench(request.graph, request.datasets);
  const output = run.nodes[node.id]!.outputs.series!;
  assert.equal(output.kind, "series");
  if (output.kind === "series") assert.equal(output.name, node.title);
});
