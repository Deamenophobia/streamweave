import { parseProject, validateProject, type WorkbenchProject } from "@streamweave/core";
import type { ExportFile } from "./contracts";

export const projectFileAccept = ".json";
export const maxProjectBytes = 15_000_000;

export function textByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function decodeProject(text: string): WorkbenchProject {
  if (textByteLength(text) > maxProjectBytes) throw new Error("Project exceeds 15 MB.");
  return parseProject(text);
}

export function encodeProject(project: WorkbenchProject): string {
  validateProject(project);
  const content = JSON.stringify(project);
  if (textByteLength(content) > maxProjectBytes) throw new Error("Project exceeds 15 MB.");
  return content;
}

export function projectExport(project: WorkbenchProject): ExportFile {
  return {
    name: "streamweave.project.json",
    mediaType: "application/json",
    content: encodeProject(project),
  };
}
