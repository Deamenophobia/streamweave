import { executeWorkbench, type WorkbenchProject } from "@streamweave/core";
self.onmessage = (event: MessageEvent<WorkbenchProject>) => {
  try { self.postMessage({ run: executeWorkbench(event.data.graph, event.data.datasets) }); }
  catch (e) { self.postMessage({ error: (e as Error).message }); }
};
