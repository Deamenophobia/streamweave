import {
  dataRows,
  multiSourceExample,
  parseDataset,
  parseProject,
  toCsv,
  type Dataset,
  type DataValue,
  type WorkbenchProject,
} from "@streamweave/core";

const storageKey = "streamweave.project.v2";

export type ProjectActions = {
  save: () => void;
  download: () => void;
  open: (file: File) => Promise<void>;
  import: (files: File[]) => Promise<void>;
};

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function loadInitialProject(): WorkbenchProject {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return parseProject(saved);
  } catch {
    // A malformed or unavailable browser save must not prevent opening the editor.
  }
  return multiSourceExample();
}

export async function readProject(file: File): Promise<WorkbenchProject> {
  if (file.size > 15_000_000) throw new Error("Project exceeds 15 MB.");
  return parseProject(await file.text());
}

export async function readDatasets(files: File[]): Promise<Dataset[]> {
  const datasets: Dataset[] = [];
  for (const file of files) {
    if (file.size > 5_000_000) throw new Error(`${file.name} exceeds 5 MB.`);
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    if (extension !== "csv" && extension !== "json" && extension !== "jsonl") {
      throw new Error("Choose CSV, JSON, or JSONL datasets.");
    }
    datasets.push(
      parseDataset(await file.text(), extension, createId("dataset"), file.name.slice(0, 120)),
    );
  }
  return datasets;
}

export function appendDatasets(project: WorkbenchProject, imported: Dataset[]): WorkbenchProject {
  const datasets = [...project.datasets, ...imported];
  if (
    datasets.length > 12 ||
    datasets.reduce((count, dataset) => count + dataset.rows.length, 0) > 50_000
  ) {
    throw new Error("Workspace limits: 12 datasets and 50,000 rows.");
  }
  const next = { ...project, datasets };
  if (new Blob([JSON.stringify(next)]).size > 14_000_000) {
    throw new Error(
      "Combined project is too large. Keep source data below 14 MB to allow a portable project under 15 MB.",
    );
  }
  return next;
}

function serializeProject(project: WorkbenchProject) {
  const content = JSON.stringify(project);
  parseProject(content);
  if (new Blob([content]).size > 15_000_000) throw new Error("Project exceeds 15 MB.");
  return content;
}

export function saveProject(project: WorkbenchProject) {
  localStorage.setItem(storageKey, serializeProject(project));
}

export function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadProject(project: WorkbenchProject) {
  download("streamweave.project.json", serializeProject(project));
}

export function downloadCsv(name: string, data: DataValue) {
  download(`${name}.csv`, toCsv(dataRows(data)), "text/csv");
}

export type NamedValue = { label: string; data: DataValue };

export function downloadResults(
  project: WorkbenchProject,
  moduleId: string,
  results: NamedValue[],
) {
  const content = {
    format: "streamweave-results",
    version: 2,
    engineVersion: "0.2.0",
    moduleId,
    results,
    project,
  };
  download(`streamweave-${moduleId}.results.json`, JSON.stringify(content, null, 2));
}
