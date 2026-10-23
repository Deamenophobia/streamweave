import { useCallback, useReducer } from "react";
import type { WorkbenchProject } from "@streamweave/core";
import { initialHistory, projectHistory, type ProjectUpdate } from "./projectHistory";

export function useProjectHistory(initial: () => WorkbenchProject) {
  const [history, dispatch] = useReducer(projectHistory, initial, (load) => initialHistory(load()));
  const setProject = useCallback(
    (update: ProjectUpdate, record = true) => dispatch({ type: "edit", update, record }),
    [],
  );
  // Record once when dragging starts; pointer movements update the present without adding history.
  const checkpoint = useCallback(() => dispatch({ type: "checkpoint" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    project: history.present,
    setProject,
    checkpoint,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

export type ProjectHistory = ReturnType<typeof useProjectHistory>;
