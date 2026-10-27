import type { ComputeEngine, WorkerResponse } from "./contracts";

export const browserEngine: ComputeEngine = {
  run(project, signal, progress) {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const started = performance.now();
      const worker = new Worker(new URL("./graph.worker.ts", import.meta.url), { type: "module" });
      const dispose = () => {
        worker.terminate();
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        dispose();
        reject(new DOMException("Calculation cancelled.", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        dispose();
        if (!data.run) return reject(new Error(data.error));
        progress({ completed: data.run.order.length, total: data.run.order.length });
        resolve({
          run: data.run,
          engine: { id: "browser", version: "0.2.0", protocolVersion: 1 },
          metrics: {
            durationMs: performance.now() - started,
            cacheHits: 0,
            nodeCount: data.run.order.length,
          },
        });
      };
      worker.onerror = () => {
        dispose();
        reject(new Error("Browser calculation worker failed. Run the study again."));
      };
      worker.postMessage(project);
    });
  },
};
