import type { Dataset, WorkbenchProject } from "@streamweave/core";
import { textByteLength } from "../adapters/projectJson";

export function appendDatasets(project: WorkbenchProject, imported: Dataset[]): WorkbenchProject {
  const datasets = [...project.datasets, ...imported];
  if (
    datasets.length > 12 ||
    datasets.reduce((count, dataset) => count + dataset.rows.length, 0) > 50_000
  ) {
    throw new Error("Workspace limits: 12 datasets and 50,000 rows.");
  }
  const next = { ...project, datasets };
  if (textByteLength(JSON.stringify(next)) > 14_000_000) {
    throw new Error(
      "Combined project is too large. Keep source data below 14 MB to allow a portable project under 15 MB.",
    );
  }
  return next;
}
