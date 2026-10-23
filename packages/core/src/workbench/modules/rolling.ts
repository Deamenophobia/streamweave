import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { windowParameters } from "../parameters.js";
import { rollingSeries } from "../math.js";

export const rolling = defineModule({
  title: "Rolling statistic",
  category: "Analyze",
  description:
    "Mean, sample standard deviation, minimum, maximum, or count over trailing observations. Minimum valid sample count is explicit.",
  inputs: [input("series", ["series"])],
  outputs: [output("series", "series")],
  parameters: [
    {
      key: "operation",
      label: "Statistic",
      kind: "choice",
      default: "mean",
      options: [
        { value: "mean", label: "Mean" },
        { value: "std", label: "Sample standard deviation" },
        { value: "min", label: "Minimum" },
        { value: "max", label: "Maximum" },
        { value: "count", label: "Valid count" },
      ],
    },
    ...windowParameters(10, 3),
  ],
  evaluate(context) {
    const { params } = context.node;
    return {
      series: rollingSeries(
        inputValue(context, "series", ["series"]),
        Number(params.window),
        Number(params.minimum),
        String(params.operation),
      ),
    };
  },
});
