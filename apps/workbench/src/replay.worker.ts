import { runPipeline, type Pipeline, type StreamEvent } from "@streamweave/core";
self.onmessage = (event: MessageEvent<{ graph: Pipeline; events: StreamEvent[]; stepMs: number }>) => {
  try { self.postMessage({ frames: runPipeline(event.data.graph, event.data.events, event.data.stepMs) }); }
  catch (error) { self.postMessage({ error: (error as Error).message }); }
};
