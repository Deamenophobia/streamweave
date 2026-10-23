import type { StreamEvent } from "./pressure.js";

export type Scenario = "reversal" | "balanced" | "sustained" | "quiet";
/** Seeded examples are demonstrations of mechanics, never evidence of predictive performance. */
export function scenario(name: Scenario = "reversal", seed = 42): StreamEvent[] {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const events: StreamEvent[] = [];
  let value = 100;
  for (let i = 0; i < 360; i++) {
    if (name === "quiet" && i > 120 && i < 240) continue;
    const probability = name === "balanced" ? 0.5 : name === "sustained" ? 1 : i < 180 ? 0.82 : 0.18;
    const direction = random() < probability ? 1 : -1;
    const weight = Math.round((1 + random() * 9) * 100) / 100;
    value += direction * 0.015 + (random() - 0.5) * 0.04;
    events.push({ id: `${name}-${i}`, stream: "sensor-A", timestampMs: i * 500, direction, weight, value: Number(value.toFixed(4)) });
  }
  return events;
}
