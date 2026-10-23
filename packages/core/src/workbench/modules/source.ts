import { defineModule, output } from "../moduleDefinition.js";
import { valueSelection } from "../parameters.js";
import { selectSeries, type DataValue } from "../data.js";

export const source = defineModule({
  title: "Dataset",
  category: "Data",
  description:
    "Expose a table and an optional selected numeric series. Each source chooses its own dataset.",
  inputs: [],
  outputs: [output("data", "table"), output("series", "series")],
  parameters: [
    { key: "datasetId", label: "Dataset", kind: "dataset", default: "" },
    ...valueSelection({ dataset: "datasetId" }),
  ],
  evaluate(context) {
    const { node, datasets } = context;
    const dataset = datasets.get(String(node.params.datasetId ?? ""));
    if (!dataset) throw new Error("Choose an available dataset.");
    const outputs: Record<string, DataValue> = {
      data: { kind: "table", columns: dataset.columns, rows: dataset.rows },
    };
    const column = String(node.params.column ?? "");
    if (column)
      outputs.series = selectSeries(
        dataset,
        column,
        String(node.params.label ?? "") || dataset.name,
        String(node.params.unit ?? ""),
      );
    return outputs;
  },
});
