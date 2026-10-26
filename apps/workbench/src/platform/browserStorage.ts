import { multiSourceExample, type WorkbenchProject } from "@streamweave/core";
import { decodeProject, encodeProject } from "../adapters/projectJson";

const storageKey = "streamweave.project.v2";

export function loadInitialProject(): WorkbenchProject {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return decodeProject(saved);
  } catch {
    // A malformed or unavailable browser save must not prevent opening the editor.
  }
  return multiSourceExample();
}

export function saveProject(project: WorkbenchProject): void {
  localStorage.setItem(storageKey, encodeProject(project));
}
