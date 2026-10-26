import { dataRows, toCsv, type DataValue, type WorkbenchProject } from "@streamweave/core";
import type { ExportFile } from "./contracts";

export type NamedValue = { label: string; data: DataValue };

export function csvExport(name: string, data: DataValue): ExportFile {
  return { name: `${name}.csv`, mediaType: "text/csv", content: toCsv(dataRows(data)) };
}

export function resultsExport(
  project: WorkbenchProject,
  moduleId: string,
  results: NamedValue[],
): ExportFile {
  return {
    name: `streamweave-${moduleId}.results.json`,
    mediaType: "application/json",
    content: JSON.stringify(
      {
        format: "streamweave-results",
        version: 2,
        engineVersion: "0.2.0",
        moduleId,
        results,
        project,
      },
      null,
      2,
    ),
  };
}
