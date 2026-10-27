import assert from "node:assert/strict";
import { test } from "node:test";
import { executeWorkbench, multiSourceExample } from "@streamweave/core";
import { decodeProgress, decodeRun } from "../src/execution/protocol";
import { resultsExport } from "../src/adapters/resultFormats";

function fixture() {
  const project = multiSourceExample();
  const expected = executeWorkbench(project.graph, project.datasets);
  const wire = {
    nodes: Object.fromEntries(
      Object.entries(expected.nodes).map(([id, { inputs: _, ...node }]) => [id, node]),
    ),
    order: expected.order,
    engine: {
      id: "python",
      version: "0.1.0",
      protocolVersion: 1,
      contractHash: "test",
      libraries: { numpy: "fixture", scipy: "fixture" },
    },
    metrics: { durationMs: 5, cacheHits: 0, nodeCount: expected.order.length },
  };
  return { project, expected, wire };
}

test("engine protocol reconstructs shared wire references and preserves result provenance", () => {
  const { project, expected, wire } = fixture();
  const result = decodeRun(wire, project, "test");
  assert.deepEqual(JSON.parse(JSON.stringify(result.run)), JSON.parse(JSON.stringify(expected)));
  assert.equal(
    result.run.nodes.correlation!.inputs[0]!.data,
    result.run.nodes.alignment!.outputs.frame,
  );
  const exported = JSON.parse(String(resultsExport(project, "fit", [], result.engine).content));
  assert.equal(exported.engine.id, "python");
  assert.equal(exported.engineVersion, "0.1.0");
  assert.deepEqual(exported.project, JSON.parse(JSON.stringify(project)));
});

test("engine protocol rejects stale contracts, wrong graph identities and invalid numbers", () => {
  const { project, wire } = fixture();
  assert.throws(() => decodeRun(wire, project, "different"), /provenance/);
  assert.throws(() => decodeRun({ ...wire, order: ["unknown"] }, project, "test"), /graph/);
  const series = wire.nodes.source_a!.outputs.series;
  assert.equal(series?.kind, "series");
  if (series?.kind === "series") series.points[0]!.value = Infinity;
  assert.throws(() => decodeRun(wire, project, "test"), /point/);
  assert.throws(() => decodeProgress({ completed: 10, total: 9 }, 9), /progress/);
});
