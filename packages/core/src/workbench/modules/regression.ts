import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { pairedColumns } from "../parameters.js";
import { fitLinear } from "../math.js";

export const regression = defineModule({
  title: "Linear fit",
  category: "Analyze",
  description:
    "Descriptive OLS: Y = intercept + slope × X. Fits the complete supplied sample. Residuals and R² are in-sample, not forecasting results.",
  inputs: [input("frame", ["frame"])],
  outputs: [output("model", "table"), output("residuals", "series")],
  parameters: pairedColumns(),
  help: "Fits every complete pair in the supplied frame. R² and residuals describe that same sample. Change or filter inputs to choose a fit period.",
  evaluate(context) {
    return fitLinear(
      inputValue(context, "frame", ["frame"]),
      String(context.node.params.x),
      String(context.node.params.y),
    );
  },
});
