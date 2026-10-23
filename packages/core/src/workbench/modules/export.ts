import { defineModule, input } from "../moduleDefinition.js";

export const exportModule = defineModule({
  title: "Export",
  category: "Output",
  description:
    "Export CSV values or JSON results with the complete project, source datasets, and calculation parameters.",
  inputs: [input("in", ["table", "series", "frame"])],
  outputs: [],
  parameters: [],
  evaluate: () => ({}),
});
