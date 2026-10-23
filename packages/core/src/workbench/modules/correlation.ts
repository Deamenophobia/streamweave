import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { windowParameters, pairedColumns } from "../parameters.js";
import { rollingCorrelation } from "../math.js";

export const correlation = defineModule({
  title: "Rolling correlation",
  category: "Analyze",
  description:
    "Pearson correlation over trailing aligned rows, using complete pairs. Constant series are undefined; sample counts are retained.",
  inputs: [input("frame", ["frame"])],
  outputs: [output("series", "series")],
  parameters: [...windowParameters(20, 5, 3), ...pairedColumns()],
  evaluate(context) {
    const { params } = context.node;
    return {
      series: rollingCorrelation(
        inputValue(context, "frame", ["frame"]),
        String(params.x),
        String(params.y),
        Number(params.window),
        Number(params.minimum),
      ),
    };
  },
});
