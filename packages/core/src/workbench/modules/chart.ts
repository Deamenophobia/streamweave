import { defineModule, input } from "../moduleDefinition.js";

export const chart = defineModule({
  title: "Chart",
  category: "Output",
  description:
    "Connect several series or aligned frames. Each series has its own scale and unit; measurements are never combined.",
  inputs: [input("in", ["series", "frame"], true)],
  outputs: [],
  parameters: [],
  evaluate: () => ({}),
});
