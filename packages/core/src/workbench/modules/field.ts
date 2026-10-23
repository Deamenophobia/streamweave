import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { valueSelection } from "../parameters.js";
import { selectSeries } from "../data.js";

export const field = defineModule({
  title: "Select series",
  category: "Data",
  description:
    "Select a numeric column from a timestamped table or aligned frame. Preserves timestamps, availability, and missing states.",
  inputs: [input("data", ["table", "frame"])],
  outputs: [output("series", "series")],
  parameters: valueSelection({ input: "data" }),
  evaluate(context) {
    const { params } = context.node;
    return {
      series: selectSeries(
        inputValue(context, "data", ["table", "frame"]),
        String(params.column ?? ""),
        String(params.label ?? ""),
        String(params.unit ?? ""),
      ),
    };
  },
});
