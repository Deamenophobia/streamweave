import type { Dataset, NodeResult, ParameterDefinition, Parameters } from "@streamweave/core";

export type ParameterContext = { params: Parameters; datasets: Dataset[]; result?: NodeResult };
export type ParameterOption = { value: string; label: string };

export function parameterOptions(
  field: ParameterDefinition,
  context: ParameterContext,
): ParameterOption[] {
  if (field.kind === "choice") return field.options;
  if (field.kind === "dataset")
    return context.datasets.map((dataset) => ({ value: dataset.id, label: dataset.name }));
  if (field.kind !== "column") return [];
  const { from } = field;
  const data =
    "dataset" in from
      ? context.datasets.find((dataset) => dataset.id === context.params[from.dataset])
      : context.result?.inputs.find(({ edge }) => edge.targetPort === from.input)?.data;
  if (!data || data.kind === "series") return [];
  return data.columns
    .filter(
      (column) =>
        !field.numericOnly ||
        (column.type === "number" && !["timestampMs", "availableAtMs"].includes(column.key)),
    )
    .map((column) => ({
      value: column.key,
      label: column.unit ? `${column.label} (${column.unit})` : column.label,
    }));
}
