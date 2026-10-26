import type { WorkbenchProject } from "@streamweave/core";

export type ProjectUpdate = WorkbenchProject | ((previous: WorkbenchProject) => WorkbenchProject);
export type ProjectHistoryState = {
  past: WorkbenchProject[];
  present: WorkbenchProject;
  future: WorkbenchProject[];
};
export type HistoryAction =
  | { type: "edit"; update: ProjectUpdate; record: boolean }
  | { type: "checkpoint" | "undo" | "redo" };

const retain = (projects: WorkbenchProject[]) => projects.slice(-50);

export function initialHistory(present: WorkbenchProject): ProjectHistoryState {
  return { past: [], present, future: [] };
}

export function projectHistory(
  history: ProjectHistoryState,
  action: HistoryAction,
): ProjectHistoryState {
  const { past, present, future } = history;
  switch (action.type) {
    case "edit": {
      const next = typeof action.update === "function" ? action.update(present) : action.update;
      if (next === present) return history;
      return { past: action.record ? retain([...past, present]) : past, present: next, future: [] };
    }
    case "checkpoint":
      return { ...history, past: retain([...past, present]), future: [] };
    case "undo":
      if (!past.length) return history;
      return {
        past: past.slice(0, -1),
        present: past.at(-1)!,
        future: [present, ...future].slice(0, 50),
      };
    case "redo":
      if (!future.length) return history;
      return { past: retain([...past, present]), present: future[0]!, future: future.slice(1) };
  }
}
