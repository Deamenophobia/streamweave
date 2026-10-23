import { test } from "node:test";
import assert from "node:assert/strict";
import { alignSeries, arithmeticSeries, dataRows, executeWorkbench, fitLinear, makeNode, multiSourceExample, parseDataset, parseProject, pressureExample, rollingCorrelation, rollingSeries, selectSeries, smoothSeries, toCsv, transformSeries, validateWorkbench, workbenchConnectionError, type Series, type WorkbenchGraph, type WorkbenchEdge } from "../src/index.js";
const series = (values: (number | null)[], times = values.map((_, i) => i * 1000), name = "A", unit = "units"): Series => ({ kind: "series", name, unit, points: values.map((value, i) => ({ timestampMs: times[i]!, value, status: value === null ? "missing" : "valid" })) });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const edge = (id: string, source: string, sourcePort: string, target: string, targetPort: string): WorkbenchEdge => ({ id, source, sourcePort, target, targetPort });

test("generic imports need no direction labels and preserve numeric, text and missing cells", () => {
  const d = parseDataset('timestamp,reading,site\n2026-01-01T00:01:00Z,,north\n2026-01-01T00:00:00Z,2.5,south', "csv", "test", "Test");
  assert.equal(d.rows[0]!.reading, 2.5); assert.equal(d.rows[1]!.reading, null);
  assert.equal(d.rows[0]!.site, "south"); assert.equal(d.columns.find(c => c.key === "reading")!.type, "number");
  assert.throws(() => parseDataset('[{"timestampMs":1,"x":1},{"timestampMs":1,"x":2}]', "json", "x", "X"), /Duplicate timestamps/);
  assert.throws(() => parseDataset('[{"timestampMs":1,"x":1},{"timestampMs":2,"x":"bad"}]', "json", "x", "X"), /mixes/);
  assert.throws(() => parseDataset('[{"timestamp":"2026-01-01T00:00:00","x":1}]', "json", "x", "X"), /timezone/);
});

test("alignment joins timestamps, not row positions, and keeps missing versus stale distinct", () => {
  const a = series([1, 2, 3], [0, 1000, 2000]), b = series([10, 20], [500, 2000]);
  const input = [{ key: "a", series: a }, { key: "b", series: b }];
  assert.deepEqual(alignSeries(input, "intersection", 1000, 1000).rows.map(r => r.timestampMs), [2000]);
  const union = alignSeries(input, "union", 1000, 1000);
  assert.equal(union.rows[1]!.values.a, null); assert.equal(union.rows[1]!.values.b, 10);
  const grid = alignSeries(input, "previous", 1000, 400);
  assert.equal(grid.rows[0]!.statuses.b, "missing"); assert.equal(grid.rows[1]!.statuses.b, "stale");
  assert.equal(grid.rows[1]!.values.b, null); assert.equal(grid.rows[2]!.values.b, 20);
});

test("alignment observes release times even when observations arrive out of order", () => {
  const a = series([1, 2, 3], [0, 1000, 2000]);
  a.points[0]!.availableAtMs = 2500; // Old observation arrives after newer ones.
  a.points[1]!.availableAtMs = 1000;
  const grid = alignSeries([{ key: "a", series: a }, { key: "b", series: series([0, 0, 0, 0], [0, 1000, 2000, 3000]) }], "previous", 1000, 2000);
  assert.equal(grid.rows[0]!.values.a, null); assert.equal(grid.rows[1]!.values.a, 2);
  assert.equal(grid.rows[3]!.values.a, 3); // Late release of old data cannot replace the newer reading.
  assert.equal(alignSeries([{ key: "a", series: a }, { key: "b", series: series([1, 2, 3]) }], "intersection", 1000, 2000).rows[0]!.values.a, null);
});

test("graph execution supports repeated modules, fan-out and actual rewiring", () => {
  const dataset = parseDataset('[{"timestampMs":0,"v":2},{"timestampMs":1000,"v":3}]', "json", "d", "D");
  const graph: WorkbenchGraph = { version: 2, name: "Branching", nodes: [makeNode("src", "source", 0, 0, { datasetId: "d", column: "v" }), makeNode("twice", "scale", 0, 0, { factor: 2 }), makeNode("thrice", "scale", 0, 0, { factor: 3 }), makeNode("view", "chart", 0, 0)], edges: [edge("a", "src", "series", "twice", "series"), edge("b", "src", "series", "thrice", "series"), edge("c", "twice", "series", "view", "in"), edge("d", "thrice", "series", "view", "in")] };
  const run = executeWorkbench(graph, [dataset]);
  assert.deepEqual(run.nodes.view!.inputs.map(i => (i.data as Series).points[1]!.value), [6, 9]);
  graph.edges[1]!.source = "twice";
  const rewired = executeWorkbench(graph, [dataset]);
  assert.deepEqual(rewired.nodes.view!.inputs.map(i => (i.data as Series).points[1]!.value), [6, 18]);
  assert.deepEqual(dataset.rows.map(r => r.v), [2, 3]);
});

test("module errors block only dependent branches", () => {
  const p = multiSourceExample();
  p.graph.nodes.find(n => n.type === "regression")!.params.x = "unknown";
  const run = executeWorkbench(p.graph, p.datasets);
  assert.equal(run.nodes.fit!.state, "error"); assert.equal(run.nodes.fit_table!.state, "blocked");
  assert.equal(run.nodes.correlation_chart!.state, "ready"); assert.equal(run.nodes.aligned_export!.state, "ready");
});

test("typed ports, cardinality, duplicate IDs and cycles are rejected", () => {
  const p = multiSourceExample(), graph = p.graph;
  assert.match(workbenchConnectionError(graph, { source: "source_a", sourcePort: "data", target: "alignment", targetPort: "series" })!, /accepts/);
  assert.match(workbenchConnectionError(graph, { source: "source_a", sourcePort: "series", target: "alignment", targetPort: "series" })!, /already/);
  const cyclic: WorkbenchGraph = { version: 2, name: "Cycle", nodes: [makeNode("a", "smooth", 0, 0), makeNode("b", "smooth", 0, 0)], edges: [edge("one", "a", "series", "b", "series"), edge("two", "b", "series", "a", "series")] };
  assert.match(validateWorkbench(cyclic)[0]!, /cycle/);
  graph.nodes.push(graph.nodes[0]!); assert.match(validateWorkbench(graph)[0]!, /unique/);
});

test("correlation and OLS match analytical examples, reporting constant series as undefined", () => {
  const frame = alignSeries([{ key: "x", series: series([1, 2, 3, 4]) }, { key: "y", series: series([7, 9, 11, 13]) }], "intersection", 1000, 0);
  const corr = rollingCorrelation(frame, "x", "y", 3, 3);
  assert.equal(corr.points[0]!.status, "warming"); near(corr.points.at(-1)!.value!, 1);
  const fit = fitLinear(frame, "x", "y");
  near(Number(fit.model.rows.find(r => r.statistic === "slope")!.value), 2);
  near(Number(fit.model.rows.find(r => r.statistic === "intercept")!.value), 5);
  assert.ok(fit.residuals.points.every(p => p.value === 0 && p.availableAtMs === 3000));
  frame.rows.forEach(r => { r.values.x = 1; });
  assert.equal(rollingCorrelation(frame, "x", "y", 3, 3).points.at(-1)!.status, "undefined");
  assert.throws(() => fitLinear(frame, "x", "y"), /zero variance/);
});

test("rolling statistics, lag and EMA have known values with explicit gaps", () => {
  const source = series([1, 2, 3, null, 5]);
  const rolling = rollingSeries(source, 3, 2, "mean");
  assert.equal(rolling.points[0]!.value, null); near(rolling.points[2]!.value!, 2); near(rolling.points[3]!.value!, 2.5);
  near(rollingSeries(source, 3, 2, "std").points[2]!.value!, 1);
  assert.equal(transformSeries(source, "difference", 1).points[4]!.value, null);
  assert.equal(transformSeries(series([0, 1]), "percent", 1).points[1]!.status, "undefined");
  assert.equal(transformSeries(source, "lag", 2).points[4]!.value, 3);
  const smoothed = smoothSeries(series([0, 10, null, 20], [0, 1000, 1500, 2000]), 1000);
  near(smoothed.points[1]!.value!, 5); near(smoothed.points[3]!.value!, 20);
});

test("pair arithmetic respects units and does not replace missing denominators with zero", () => {
  const frame = alignSeries([{ key: "a", series: series([2, 4, 6]) }, { key: "b", series: series([1, 0, null]) }], "intersection", 1000, 0);
  const ratio = arithmeticSeries(frame, "a", "b", "divide");
  assert.equal(ratio.points[0]!.value, 2); assert.equal(ratio.points[1]!.status, "undefined"); assert.equal(ratio.points[2]!.status, "missing");
  frame.columns[1]!.unit = "seconds"; assert.throws(() => arithmeticSeries(frame, "a", "b", "subtract"), /matching units/);
});

test("projects round-trip with data, parameters and statuses; examples execute every output", () => {
  for (const p of [multiSourceExample(), pressureExample()]) {
    assert.equal(JSON.stringify(parseProject(JSON.stringify(p))), JSON.stringify(p));
    const run = executeWorkbench(p.graph, p.datasets);
    assert.ok(Object.values(run.nodes).every(n => n.state === "ready"), JSON.stringify(run.nodes));
  }
  const rows = dataRows(series([2, null])); assert.equal(rows[1]!.status, "missing"); assert.equal(rows[1]!.value, null);
  assert.match(toCsv([{ "a,b": 2, "=header": "=formula" }]), /^"a,b",'=header\n2,'=formula/);
});

test("timestamp alignment and row limits fail explicitly instead of producing huge grids", () => {
  assert.throws(() => alignSeries([{ key: "a", series: series([1, 2], [0, 1e9]) }, { key: "b", series: series([1, 2], [0, 1e9]) }], "previous", 1, 0), /20,000/);
  const p = multiSourceExample(); p.graph.nodes.find(n => n.type === "correlation")!.params.minimum = 100;
  assert.equal(executeWorkbench(p.graph, p.datasets).nodes.correlation!.state, "error");
});

test("aligned columns can branch into transforms and residual plots preserve gaps", () => {
  const frame = alignSeries([{ key: "x", series: series([1, 2, 3, 4, 5]) }, { key: "y", series: series([7, 9, null, 13, 15]) }], "intersection", 1000, 0);
  const selected = selectSeries(frame, "y", "", "");
  assert.equal(selected.points[2]!.status, "missing");
  assert.equal(transformSeries(selected, "difference", 1).points[3]!.value, null);
  const fit = fitLinear(frame, "x", "y");
  assert.equal(fit.residuals.points.length, 5); assert.equal(fit.residuals.points[2]!.value, null);
  assert.throws(() => selectSeries(fit.model, "value", "", ""), /timestamped/);
  const p = multiSourceExample();
  p.graph.nodes.push(makeNode("extract", "field", 0, 0, { column: "source_b_series" }));
  p.graph.edges.push(edge("select", "alignment", "frame", "extract", "data"));
  assert.equal(executeWorkbench(p.graph, p.datasets).nodes.extract!.state, "ready");
});

test("invalid time/count parameters and delayed signed events are rejected", () => {
  const inputs = [{ key: "a", series: series([1, 2]) }, { key: "b", series: series([1, 2]) }];
  assert.throws(() => alignSeries(inputs, "previous", 0, 100), /Grid interval/);
  assert.throws(() => transformSeries(inputs[0]!.series, "lag", -1), /Lag/);
  assert.throws(() => rollingSeries(inputs[0]!.series, 2, 3, "mean"), /Minimum/);
  assert.throws(() => parseDataset('[{"timestampMs":9000000000000000,"v":1}]', "json", "d", "D"), /timestamp/);
  const p = pressureExample();
  p.datasets[0]!.columns.push({ key: "availableAtMs", label: "Available", type: "number" });
  p.datasets[0]!.rows[0]!.availableAtMs = Number(p.datasets[0]!.rows[0]!.timestampMs) + 1000;
  const run = executeWorkbench(p.graph, p.datasets);
  assert.equal(run.nodes[p.graph.nodes.find(n => n.type === "pressure")!.id]!.state, "error");
});
