import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { replay } from "../../replay.js";

export const pressure = defineModule({
  title: "Directional pressure",
  category: "Analyze",
  description:
    "Optional signed-event measure. Requires numeric direction (1 / −1) and positive weight columns. No direction is inferred.",
  inputs: [input("data", ["table"])],
  outputs: [output("series", "series")],
  parameters: [
    {
      key: "windowMs",
      label: "Pressure window (seconds)",
      kind: "number",
      default: 30000,
      min: 1,
      max: 3600000,
      integer: true,
      displayScale: 1000,
    },
    {
      key: "halfLifeMs",
      label: "Decay half-life (seconds)",
      kind: "number",
      default: 10000,
      min: 1,
      max: 3600000,
      displayScale: 1000,
    },
    {
      key: "minimum",
      label: "Minimum observations",
      kind: "number",
      default: 5,
      min: 1,
      max: 100000,
      integer: true,
    },
    {
      key: "stepMs",
      label: "Sample interval (seconds)",
      kind: "number",
      default: 1000,
      min: 1,
      max: 3600000,
      integer: true,
      displayScale: 1000,
    },
  ],
  evaluate(context) {
    const table = inputValue(context, "data", ["table"]);
    if (
      table.rows.some(
        (row) => row.availableAtMs != null && Number(row.availableAtMs) !== Number(row.timestampMs),
      )
    )
      throw new Error(
        "Directional pressure requires events available at their event time. Delayed-release data is not supported by this module.",
      );
    const { node } = context;
    const observations = table.rows.map((row, index) => ({
      id: String(index),
      timestampMs: Number(row.timestampMs),
      stream: node.id,
      direction: Number(row.direction) as 1 | -1,
      weight: Number(row.weight),
    }));
    const frames = replay(observations, {
      stream: node.id,
      windowMs: Number(node.params.windowMs),
      halfLifeMs: Number(node.params.halfLifeMs),
      minEvents: Number(node.params.minimum),
      stepMs: Number(node.params.stepMs),
    });
    if (frames.some((frame) => frame.timestampMs > 8.64e15))
      throw new Error("Pressure replay extends beyond the supported date range.");
    const states = { ready: "valid", warming: "warming", empty: "missing" } as const;
    return {
      series: {
        kind: "series",
        name: node.title,
        unit: "pressure points",
        points: frames.map((frame) => ({
          timestampMs: frame.timestampMs,
          value: frame.decayedPressure,
          status: states[frame.status],
          sampleCount: frame.count,
        })),
      },
    };
  },
});
