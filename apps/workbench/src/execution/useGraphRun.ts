import { useEffect, useReducer, useRef, useState } from "react";
import type { WorkbenchProject } from "@streamweave/core";
import type { EngineId, Execution } from "./contracts";
import { calculationKey, calculationRequest } from "./calculation";
import { browserEngine } from "./browserEngine";
import { pythonEngine } from "./pythonEngine";

const engines = { browser: browserEngine, python: pythonEngine };

export function useGraphRun(project: WorkbenchProject) {
  const [engineId, setEngine] = useState<EngineId>("browser");
  const [execution, setExecution] = useState<Execution>({ run: null, busy: true, error: "" });
  const [revision, rerun] = useReducer((value: number) => value + 1, 0);
  const active = useRef<AbortController | null>(null);
  const { datasets } = project;
  const computation = calculationKey(project);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setExecution({
      run: null,
      busy: true,
      error: "",
      progress: { completed: 0, total: project.graph.nodes.length },
    });
    void engines[engineId]
      .run(calculationRequest(project), controller.signal, (progress) => {
        if (!controller.signal.aborted) setExecution((previous) => ({ ...previous, progress }));
      })
      .then((result) => {
        if (!controller.signal.aborted) setExecution({ ...result, busy: false, error: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setExecution({
            run: null,
            busy: false,
            error: error instanceof Error ? error.message : "Calculation failed.",
          });
      });
    return () => controller.abort();
  }, [computation, datasets, revision, engineId]);

  function cancel() {
    active.current?.abort();
    setExecution({ run: null, busy: false, error: "Calculation cancelled. Run to try again." });
  }

  return { ...execution, engineId, setEngine, rerun, cancel };
}
