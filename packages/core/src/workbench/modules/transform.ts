import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { transformSeries } from "../math.js";

export const transform = defineModule({
  title: "Change / lag",
  category: "Process",
  description:
    "Difference, percentage change, log change, or lag by observation count. Use regular alignment first when equal time intervals are required.",
  inputs: [input("series", ["series"])],
  outputs: [output("series", "series")],
  parameters: [
    {
      key: "operation",
      label: "Transformation",
      kind: "choice",
      default: "difference",
      options: [
        { value: "difference", label: "Absolute difference" },
        { value: "percent", label: "Percentage change" },
        { value: "log", label: "Log change (positive values)" },
        { value: "lag", label: "Lag observations" },
      ],
    },
    {
      key: "lag",
      label: "Lag (observations)",
      kind: "number",
      default: 1,
      min: 1,
      max: 1000,
      integer: true,
    },
  ],
  evaluate(context) {
    return {
      series: transformSeries(
        inputValue(context, "series", ["series"]),
        String(context.node.params.operation),
        Number(context.node.params.lag),
      ),
    };
  },
});
