import { defaultPipeline, runPipeline, scenario } from "@streamweave/core";
const frames = runPipeline(defaultPipeline(), scenario("reversal"));
console.table(
  frames
    .filter((_, i) => i % 30 === 0)
    .map((f) => ({
      seconds: f.timestampMs / 1000,
      status: f.status,
      events: f.count,
      pressure: f.pressure?.toFixed(2),
      output: f.output?.toFixed(2),
    })),
);
