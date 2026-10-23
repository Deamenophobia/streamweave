import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { pairedColumns } from "../parameters.js";
import { arithmeticSeries } from "../math.js";

export const arithmetic = defineModule({
  title: "Pair arithmetic",
  category: "Analyze",
  description:
    "Add, subtract, multiply, or divide two aligned columns. Addition/subtraction require matching units.",
  inputs: [input("frame", ["frame"])],
  outputs: [output("series", "series")],
  parameters: [
    ...pairedColumns(),
    {
      key: "operation",
      label: "Operation",
      kind: "choice",
      default: "subtract",
      options: [
        { value: "add", label: "X + Y" },
        { value: "subtract", label: "X − Y" },
        { value: "multiply", label: "X × Y" },
        { value: "divide", label: "X / Y" },
      ],
    },
  ],
  evaluate(context) {
    const { params } = context.node;
    return {
      series: arithmeticSeries(
        inputValue(context, "frame", ["frame"]),
        String(params.x),
        String(params.y),
        String(params.operation),
      ),
    };
  },
});
