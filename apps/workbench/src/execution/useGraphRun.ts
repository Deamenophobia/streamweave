import { useEffect, useReducer, useState } from "react";
import type { WorkbenchProject } from "@streamweave/core";
import type { Execution, WorkerResponse } from "./contracts";
import { calculationKey, calculationRequest } from "./calculation";

export function useGraphRun(project: WorkbenchProject) {
  const [execution, setExecution] = useState<Execution>({ run: null, busy: true, error: "" });
  const [revision, rerun] = useReducer((value: number) => value + 1, 0);
  const { datasets } = project;
  const computation = calculationKey(project);

  useEffect(() => {
    setExecution({ run: null, busy: true, error: "" });
    const worker = new Worker(new URL("./graph.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      setExecution({ run: data.run ?? null, busy: false, error: data.error ?? "" });
    };
    worker.onerror = () => {
      setExecution({
        run: null,
        busy: false,
        error: "Calculation worker failed. Reload the workbench.",
      });
    };
    worker.postMessage(calculationRequest(project));
    return () => worker.terminate();
  }, [computation, datasets, revision]);

  return { ...execution, rerun };
}
