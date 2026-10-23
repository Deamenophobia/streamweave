import {
  WORKBENCH_MODULES,
  type WorkbenchKind,
  type WorkbenchNode,
  type Dataset,
} from "@streamweave/core";

export const moduleIcons: Record<WorkbenchKind, string> = {
  source: "▤",
  field: "↳",
  filter: "≡",
  align: "⋈",
  transform: "Δ",
  scale: "×",
  smooth: "∿",
  rolling: "◷",
  arithmetic: "±",
  correlation: "ρ",
  regression: "ƒ",
  pressure: "⇅",
  chart: "⌁",
  table: "▦",
  export: "↓",
};

export function moduleDetail(node: WorkbenchNode, datasets: Dataset[]) {
  switch (node.type) {
    case "source":
      return (
        datasets.find((dataset) => dataset.id === node.params.datasetId)?.name ?? "Choose dataset"
      );
    case "align":
      return String(node.params.mode);
    case "transform":
    case "rolling":
    case "arithmetic":
      return String(node.params.operation);
    default:
      return WORKBENCH_MODULES[node.type].title;
  }
}
