import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { smoothSeries } from "../math.js";

export const smooth = defineModule({
  title: "Smooth",
  category: "Process",
  description: "Time-based exponential moving average. Missing observations reset the filter.",
  inputs: [input("series", ["series"])],
  outputs: [output("series", "series")],
  parameters: [
    {
      key: "halfLifeMs",
      label: "Smoothing half-life (seconds)",
      kind: "number",
      default: 180000,
      min: 1,
      max: 31536000000,
      displayScale: 1000,
    },
  ],
  evaluate(context) {
    return {
      series: smoothSeries(
        inputValue(context, "series", ["series"]),
        Number(context.node.params.halfLifeMs),
      ),
    };
  },
});
