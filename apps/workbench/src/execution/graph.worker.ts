import { executeWorkbench, type WorkbenchProject } from "@streamweave/core";
import type { WorkerResponse } from "./contracts";
self.onmessage = (event: MessageEvent<WorkbenchProject>) => {
  try {
    self.postMessage({
      run: executeWorkbench(event.data.graph, event.data.datasets),
    } satisfies WorkerResponse);
  } catch (e) {
    self.postMessage({ error: (e as Error).message } satisfies WorkerResponse);
  }
};
