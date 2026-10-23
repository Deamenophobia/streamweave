import { test } from "node:test";
import assert from "node:assert/strict";
import { PressureWindow, HistoryBuffer, replay, type StreamEvent } from "../src/index.js";
const event = (id: string, timestampMs: number, direction: 1 | -1 = 1, weight = 1): StreamEvent => ({ id, timestampMs, direction, weight, stream: "A" });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("normalized pressure has known analytical values and scale invariance", () => {
  for (const scale of [0.001, 1, 1e6]) {
    const w = new PressureWindow("A", { minEvents: 2 });
    w.push(event("a", 0, 1, 700 * scale)); w.push(event("b", 0, -1, 300 * scale));
    const s = w.snapshot(0); near(s.pressure!, 40); near(s.decayedPressure!, 40);
  }
});
test("quiet windows expire by time, including the exact left boundary", () => {
  const w = new PressureWindow("A", { minEvents: 1, windowMs: 1000 });
  w.push(event("a", 500)); assert.equal(w.snapshot(1499).count, 1);
  assert.equal(w.snapshot(1500).status, "empty"); assert.equal(w.snapshot(1501).pressure, null);
});
test("half-life halves relative contribution, using ln(2) semantics", () => {
  const w = new PressureWindow("A", { minEvents: 2, windowMs: 5000, halfLifeMs: 1000 });
  w.push(event("old", 0, 1)); w.push(event("new", 1000, -1));
  const s = w.snapshot(1000); near(s.pressure!, 0); near(s.decayedPressure!, -100 / 3); near(s.effectiveEvents, 1.8);
});
test("extreme accepted weights remain finite through decay and silence", () => {
  const w = new PressureWindow("A", { minEvents: 1, windowMs: 3_600_000, halfLifeMs: 1 });
  w.push(event("old", 0, 1, 1e12)); w.push(event("new", 100_000, -1, 1e-12));
  const s = w.snapshot(200_000);
  near(s.decayedPressure!, -100); near(s.effectiveEvents, 1);
  for (const weight of [1e-13, 1e13]) assert.throws(() => w.push(event("invalid", 200_001, 1, weight)), /weight/);
});
test("sustained positive flow stays positive after the window fills", () => {
  const w = new PressureWindow("A", { minEvents: 2, windowMs: 10_000 });
  for (let i = 0; i < 100; i++) w.push(event(String(i), i * 1000));
  near(w.snapshot(99_000).pressure!, 100); assert.equal(w.snapshot(99_000).count, 10);
});
test("duplicate events, late timestamps, invalid values, and stream mixing are explicit", () => {
  const w = new PressureWindow("A", { minEvents: 1 });
  assert.equal(w.push(event("a", 1000)), true); assert.equal(w.push(event("a", 1000)), false);
  assert.throws(() => w.push(event("b", 999)), /monotonic/);
  assert.throws(() => w.push({ ...event("b", 1001), stream: "B" }), /Mixed/);
  for (const weight of [0, -1, NaN, Infinity]) assert.throws(() => w.push(event("bad", 1001, 1, weight)));
  assert.equal(w.snapshot(1000).count, 1);
});
test("capacity overflow fails without silently truncating observations", () => {
  const w = new PressureWindow("A", { minEvents: 1, maxEvents: 2 });
  w.push(event("a", 0)); w.push(event("b", 1));
  assert.throws(() => w.push(event("c", 2)), /capacity/); assert.equal(w.snapshot(2).count, 2);
});
test("warming status does not fabricate a zero indicator", () => {
  const w = new PressureWindow("A", { minEvents: 5 }); w.push(event("a", 0));
  assert.equal(w.snapshot(0).status, "warming"); assert.equal(w.snapshot(0).pressure, null);
});
test("replay is deterministic, orders input, and never sees future events", () => {
  const input = [event("b", 2000, -1, 10), event("a", 0, 1, 2)];
  const config = { stream: "A", minEvents: 1, windowMs: 3000, stepMs: 1000 };
  const frames = replay(input, config); assert.deepEqual(frames, replay(input, config));
  assert.equal(frames[1]!.count, 1); assert.equal(frames[1]!.pressure, 100);
  assert.equal(frames[2]!.count, 2); assert.equal(frames.at(-1)!.status, "empty");
  assert.equal(input[0]!.id, "b");
});
test("replay includes the last irregular timestamp and clears smoothing after silence", () => {
  const frames = replay([event("a", 0), event("b", 2050, -1)], { stream: "A", minEvents: 1, windowMs: 500, stepMs: 1000 });
  assert.equal(frames.at(-1)!.timestampMs, 2550); assert.equal(frames[1]!.smoothedPressure, null);
});
test("replay rejects pathological sizes and duplicate identity", () => {
  assert.throws(() => replay([event("a", 0), event("a", 1)], { stream: "A" }), /Duplicate/);
  assert.throws(() => replay([event("a", 0), event("b", 1e10)], { stream: "A" }), /10,000/);
});
test("bounded visualization history wraps in chronological order", () => {
  const b = new HistoryBuffer<number>(3); for (const n of [1, 2, 3, 4, 5]) b.push(n);
  assert.deepEqual(b.toArray(), [3, 4, 5]); b.reset(); assert.deepEqual(b.toArray(), []);
  assert.throws(() => new HistoryBuffer(0));
});
test("rolling implementation agrees with an independent batch reference", () => {
  const w = new PressureWindow("A", { minEvents: 1, windowMs: 700, halfLifeMs: 200 });
  const all: StreamEvent[] = [];
  for (let i = 0; i < 300; i++) {
    const e = event(String(i), i * 37, i % 3 ? 1 : -1, (i % 11) + 1); all.push(e); w.push(e);
    const active = all.filter(x => x.timestampMs > e.timestampMs - 700);
    const signed = active.reduce((s, x) => s + x.direction * x.weight, 0);
    const total = active.reduce((s, x) => s + x.weight, 0);
    near(w.snapshot(e.timestampMs).pressure!, 100 * signed / total);
  }
});
