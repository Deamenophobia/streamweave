import { validateDataset, type Dataset, type WorkbenchProject } from "@streamweave/core";
import type { ExportFile } from "../adapters/contracts";
import { datasetReaderFor, type DatasetFile } from "../adapters/datasetFormats";
import { decodeProject, maxProjectBytes } from "../adapters/projectJson";
import { createId } from "./ids";

export async function readProject(file: File): Promise<WorkbenchProject> {
  if (file.size > maxProjectBytes) throw new Error("Project exceeds 15 MB.");
  return decodeProject(await file.text());
}

export async function readDatasets(files: readonly DatasetFile[]): Promise<Dataset[]> {
  if (files.length > 12) throw new Error("Import at most 12 datasets at a time.");
  const datasets: Dataset[] = [];
  let rowCount = 0;
  for (const file of files) {
    if (file.size > 5_000_000) throw new Error(`${file.name} exceeds 5 MB.`);
    const dataset = await datasetReaderFor(file.name).read(file, createId("dataset"));
    validateDataset(dataset);
    rowCount += dataset.rows.length;
    if (rowCount > 50_000) throw new Error("Import at most 50,000 rows at a time.");
    datasets.push(dataset);
  }
  return datasets;
}

export function downloadFile(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mediaType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
