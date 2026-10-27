import {
  dataRows,
  toCsv,
  type DataValue,
  type EngineMetadata,
  type WorkbenchProject,
} from "@streamweave/core";
import type { ExportFile } from "./contracts";

export type NamedValue = { label: string; data: DataValue };

export function csvExport(name: string, data: DataValue): ExportFile {
  return { name: `${name}.csv`, mediaType: "text/csv", content: toCsv(dataRows(data)) };
}

export function resultsExport(
  project: WorkbenchProject,
  moduleId: string,
  results: NamedValue[],
  engine?: EngineMetadata,
): ExportFile {
  return {
    name: `streamweave-${moduleId}.results.json`,
    mediaType: "application/json",
    content: JSON.stringify(
      {
        format: "streamweave-results",
        version: 2,
        engineVersion: engine?.version ?? "0.2.0",
        ...(engine ? { engine } : {}),
        moduleId,
        results,
        project,
      },
      null,
      2,
    ),
  };
}
