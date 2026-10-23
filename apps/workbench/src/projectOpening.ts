import type { WorkbenchProject } from "@streamweave/core";
import { readProject } from "./projectFiles";

/** Only the latest open request may replace the document it started from. */
export function createProjectOpener(
  currentVersion: () => number,
  read: typeof readProject = readProject,
) {
  let sequence = 0;
  return async (file: File): Promise<WorkbenchProject | null> => {
    const request = ++sequence;
    const version = currentVersion();
    const current = () => request === sequence && version === currentVersion();
    try {
      const project = await read(file);
      return current() ? project : null;
    } catch (error) {
      if (current()) throw error;
      return null;
    }
  };
}
