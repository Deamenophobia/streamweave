import { defineModule, input } from "../moduleDefinition.js";

export const table = defineModule({
  title: "Table",
  category: "Output",
  description: "Inspect exact values, missing states, and metadata. Page through all rows.",
  inputs: [input("in", ["table", "series", "frame"])],
  outputs: [],
  parameters: [],
  evaluate: () => ({}),
});
