import { defineModule, input, output, inputValue } from "../moduleDefinition.js";

export const scale = defineModule({
  title: "Scale & offset",
  category: "Process",
  description: "Apply value × factor + offset and explicitly assign an output unit.",
  inputs: [input("series", ["series"])],
  outputs: [output("series", "series")],
  parameters: [
    { key: "factor", label: "Factor", kind: "number", default: 1, min: -1e12, max: 1e12 },
    { key: "offset", label: "Offset", kind: "number", default: 0, min: -1e12, max: 1e12 },
    { key: "unit", label: "Output unit", kind: "text", default: "value" },
  ],
  evaluate(context) {
    const series = inputValue(context, "series", ["series"]);
    const { params } = context.node;
    const points = series.points.map((point) => {
      if (point.value === null) return { ...point };
      const value = point.value * Number(params.factor) + Number(params.offset);
      return {
        ...point,
        value: Number.isFinite(value) ? value : null,
        status: Number.isFinite(value) ? point.status : ("undefined" as const),
      };
    });
    return {
      series: {
        ...series,
        name: series.name + " · scaled",
        unit: String(params.unit ?? "") || series.unit,
        points,
      },
    };
  },
});
