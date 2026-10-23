import { useEffect, useReducer, useState } from "react";
import type { WorkbenchProject, WorkbenchRun } from "@streamweave/core";

export type Execution = { run: WorkbenchRun | null; busy: boolean; error: string };

export function useGraphRun(project: WorkbenchProject) {
  const [execution, setExecution] = useState<Execution>({ run: null, busy: true, error: "" });
  const [revision, rerun] = useReducer((value: number) => value + 1, 0);
  const { graph, datasets } = project;
  // Layout changes are deliberately excluded from calculation dependencies.
  const computation = JSON.stringify({
    name: graph.name,
    nodes: graph.nodes.map(({ id, type, title, params }) => ({ id, type, title, params })),
    edges: graph.edges,
  });

  useEffect(() => {
    setExecution({ run: null, busy: true, error: "" });
    const worker = new Worker(new URL("./graph.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<{ run?: WorkbenchRun; error?: string }>) => {
      setExecution({ run: data.run ?? null, busy: false, error: data.error ?? "" });
    };
    worker.onerror = () => {
      setExecution({
        run: null,
        busy: false,
        error: "Calculation worker failed. Reload the workbench.",
      });
    };
    worker.postMessage(project);
    return () => worker.terminate();
  }, [computation, datasets, revision]);

  return { ...execution, rerun };
}
