import assert from "node:assert/strict";
import { test } from "node:test";
import { executeWorkbench, multiSourceExample, pressureExample } from "@streamweave/core";
import { decodeProject, encodeProject, projectExport } from "../src/adapters/projectJson";
import { resultsExport } from "../src/adapters/resultFormats";
import { readDatasets } from "../src/platform/browserFiles";

test("portable projects preserve both bundled workflows and reproduce every output", () => {
  for (const project of [multiSourceExample(), pressureExample()]) {
    project.graph.name = "温度 study — local archive";
    const before = executeWorkbench(project.graph, project.datasets);
    const file = projectExport(project);
    assert.equal(typeof file.content, "string");
    const restored = decodeProject(file.content as string);
    assert.deepEqual(restored, JSON.parse(JSON.stringify(project)));
    assert.deepEqual(
      JSON.parse(JSON.stringify(executeWorkbench(restored.graph, restored.datasets))),
      JSON.parse(JSON.stringify(before)),
    );
    assert.notEqual(restored, project);
  }
});

test("export refuses non-finite source values before JSON can silently coerce them", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const project = multiSourceExample();
    const dataset = project.datasets[0]!;
    const column = dataset.columns.find(
      (column) => column.type === "number" && column.key !== "timestampMs",
    )!;
    dataset.rows[0]![column.key] = value;
    assert.throws(() => encodeProject(project), /non-finite|finite|Invalid/i);
  }
});

test("project readers reject unsupported versions and results wrappers without guessing", () => {
  const project = multiSourceExample();
  assert.throws(() => decodeProject(JSON.stringify({ ...project, version: 999 })), /version 2/);
  const report = resultsExport(project, "alignment", []);
  assert.throws(() => decodeProject(report.content as string), /version 2/);
  assert.deepEqual(
    decodeProject(JSON.stringify(JSON.parse(report.content as string).project)),
    JSON.parse(JSON.stringify(project)),
  );
});

test("registered text readers import equivalent datasets and preserve missing values", async () => {
  const rows = [
    { timestampMs: 0, value: 2.5 },
    { timestampMs: 1000, value: null },
  ];
  const files = [
    new File(["timestampMs,value\n0,2.5\n1000,\n"], "sensor.CSV"),
    new File([JSON.stringify(rows)], "sensor.json"),
    new File([rows.map((row) => JSON.stringify(row)).join("\n")], "sensor.jsonl"),
  ];
  const datasets = await readDatasets(files);
  for (const dataset of datasets) assert.deepEqual(structuredClone(dataset.rows), rows);
  assert.equal(new Set(datasets.map((dataset) => dataset.id)).size, 3);
});
