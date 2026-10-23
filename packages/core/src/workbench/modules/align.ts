import { defineModule, input, output } from "../moduleDefinition.js";
import { alignSeries } from "../math.js";

export const align = defineModule({
  title: "Align timestamps",
  category: "Process",
  description:
    "Connect two or more series. Exact intersection/union, or a regular grid using only earlier available observations with a maximum age.",
  inputs: [input("series", ["series"], true, 2)],
  outputs: [output("frame", "frame")],
  parameters: [
    {
      key: "mode",
      label: "Alignment mode",
      kind: "choice",
      default: "previous",
      options: [
        { value: "previous", label: "Regular grid · previous available" },
        { value: "intersection", label: "Exact timestamps · intersection" },
        { value: "union", label: "Exact timestamps · union" },
      ],
    },
    {
      key: "stepMs",
      label: "Grid interval (seconds)",
      kind: "number",
      default: 60000,
      min: 1,
      max: 31536000000,
      integer: true,
      displayScale: 1000,
      visibleWhen: (params) => params.mode === "previous",
    },
    {
      key: "maxAgeMs",
      label: "Maximum age (seconds)",
      kind: "number",
      default: 150000,
      min: 0,
      max: 31536000000,
      integer: true,
      displayScale: 1000,
      visibleWhen: (params) => params.mode === "previous",
    },
  ],
  help: "All times are UTC. No interpolation or future values are used. Missing and stale cells remain null.",
  evaluate({ node, inputs }) {
    const series = inputs.map(({ edge, data }) => {
      if (data.kind !== "series") throw new Error("Alignment requires series inputs.");
      return { key: edge.source + "_" + edge.sourcePort, series: data };
    });
    return {
      frame: alignSeries(
        series,
        String(node.params.mode),
        Number(node.params.stepMs),
        Number(node.params.maxAgeMs),
      ),
    };
  },
});
