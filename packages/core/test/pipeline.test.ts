import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultPipeline,
  validatePipeline,
  runPipeline,
  connectionError,
  parseEvents,
  parsePipeline,
  scenario,
  toCsv,
} from "../src/index.js";
test("default graph runs and removing smoothing changes the actual computation", () => {
  const g = defaultPipeline();
  assert.deepEqual(validatePipeline(g), []);
  const original = runPipeline(g, scenario());
  g.nodes = g.nodes.filter((n) => n.kind !== "smooth");
  g.edges = g.edges.filter((e) => e.source !== "smooth" && e.target !== "smooth");
  g.edges.push({ id: "direct", source: "pressure", target: "output" });
  const direct = runPipeline(g, scenario());
  assert.equal(direct[90]!.output, direct[90]!.decayedPressure);
  assert.notEqual(original[90]!.output, direct[90]!.output);
});
test("graph parameter changes affect output, with raw and decayed metrics distinct", () => {
  const g = defaultPipeline(),
    a = runPipeline(g, scenario());
  g.nodes.find((n) => n.kind === "pressure")!.params.metric = "raw";
  const b = runPipeline(g, scenario());
  assert.notEqual(a[120]!.output, b[120]!.output);
  g.nodes.find((n) => n.kind === "window")!.params.windowMs = 60_000;
  const c = runPipeline(g, scenario());
  assert.notEqual(b[120]!.count, c[120]!.count);
});
test("incompatible ports, disconnected graphs, cycles and invalid configs are rejected", () => {
  const g = defaultPipeline();
  assert.match(connectionError({ ...g, edges: [] }, "source", "output")!, /incompatible/);
  g.edges.pop();
  assert.ok(validatePipeline(g).some((e) => e.includes("input")));
  assert.throws(() => runPipeline(g, scenario()));
  const cycle = defaultPipeline();
  cycle.edges = [{ id: "x", source: "pressure", target: "smooth" }];
  assert.ok(connectionError(cycle, "smooth", "pressure"));
  const invalid = defaultPipeline();
  invalid.nodes[1]!.params.windowMs = -1;
  assert.ok(validatePipeline(invalid).some((e) => e.includes("Window")));
});
test("JSON graph import rejects malformed and oversized input", () => {
  assert.deepEqual(parsePipeline(JSON.stringify(defaultPipeline())), defaultPipeline());
  assert.throws(
    () => parsePipeline('{"version":1,"name":"x","nodes":[null],"edges":[]}'),
    /Malformed/,
  );
  assert.throws(
    () => parsePipeline(JSON.stringify({ ...defaultPipeline(), edges: [null] })),
    /Edge IDs/,
  );
  assert.throws(() => parsePipeline(" ".repeat(100001)), /100 KB/);
});
test("CSV and JSONL recordings round-trip, retaining timestamps and signed weights", () => {
  const events = scenario().slice(0, 10);
  assert.deepEqual(parseEvents(toCsv(events.map((e) => ({ ...e }))), "csv"), events);
  assert.deepEqual(parseEvents(events.map((e) => JSON.stringify(e)).join("\n"), "jsonl"), events);
  const quoted = 'id,stream,timestampMs,direction,weight\r\n"a,""b""",A,0,-1,2\r\n';
  assert.equal(parseEvents(quoted, "csv")[0]!.id, 'a,"b"');
});
test("imports reject invalid, duplicate and non-finite data with useful errors", () => {
  assert.throws(
    () => parseEvents("id,stream,timestampMs,direction,weight\na,A,,1,2", "csv"),
    /empty numeric/,
  );
  assert.throws(
    () => parseEvents('[{"id":"a","stream":"A","timestampMs":0,"direction":0,"weight":1}]', "json"),
    /direction/,
  );
  const e = scenario()[0]!;
  assert.throws(() => parseEvents(JSON.stringify([e, e]), "json"), /Duplicate/);
  assert.throws(
    () => parseEvents('id,stream,timestampMs,direction,weight\n"unfinished', "csv"),
    /Unclosed/,
  );
  assert.throws(() => parseEvents("{}", "json"), /1 to 20,000/);
});
test("CSV result export neutralizes spreadsheet formula text but preserves negative numbers", () => {
  assert.equal(toCsv([{ stream: "=1+1", value: -2 }]), "stream,value\n'=1+1,-2\n");
});
