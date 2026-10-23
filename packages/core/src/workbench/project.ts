import { validateDataset } from "./data.js";
import { validateWorkbench } from "./validation.js";
import type { WorkbenchProject } from "./contracts.js";

export function parseProject(text: string): WorkbenchProject {
  if (text.length > 15_000_000) throw new Error("Project exceeds 15 MB.");
  const project = JSON.parse(text) as WorkbenchProject;
  if (
    project?.version !== 2 ||
    project.format !== "streamweave-project" ||
    !Array.isArray(project.datasets)
  )
    throw new Error(
      "Open a Streamweave version 2 project. Version 1 pipelines remain supported by the legacy core API.",
    );
  const issues = validateWorkbench(project.graph);
  if (issues.length) throw new Error(issues.join(" "));
  if (
    project.datasets.length > 12 ||
    project.datasets.reduce((n, d) => n + (d?.rows?.length ?? 0), 0) > 50_000
  )
    throw new Error("Project exceeds dataset limits.");
  const ids = new Set<string>();
  for (const d of project.datasets) {
    validateDataset(d);
    if (ids.has(d.id)) throw new Error("Duplicate dataset ID.");
    ids.add(d.id);
  }
  return project;
}
