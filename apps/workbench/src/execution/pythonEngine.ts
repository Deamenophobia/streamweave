import type { ComputeEngine } from "./contracts";
import { decodeProgress, decodeRun, record } from "./protocol";
import { contractHash } from "./catalogueHash";

const endpoint = "http://127.0.0.1:5191/v1";
let session: string | undefined;

async function request(path: string, headers: Record<string, string>, options: RequestInit = {}) {
  const response = await fetch(endpoint + path, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const message = await response.json().catch(() => ({}));
    throw new Error(
      typeof message.detail === "string"
        ? message.detail
        : `Local engine returned HTTP ${response.status}.`,
    );
  }
  if (response.status === 204) return {};
  const text = await response.text();
  if (text.length > 32_000_000) throw new Error("Local engine response exceeds 32 MB.");
  return record(JSON.parse(text));
}

function wait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 120);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export const pythonEngine: ComputeEngine = {
  async run(project, signal, progress) {
    const hash = await contractHash();
    session ??= crypto.randomUUID();
    const headers = { "X-Streamweave-Protocol": "1", "X-Streamweave-Session": session };
    const jobId = crypto.randomUUID();
    let submitted = false;
    const timeout = AbortSignal.timeout(125_000);
    const active = AbortSignal.any([signal, timeout]);
    try {
      active.throwIfAborted();
      const capabilities = await request("/capabilities", headers, {
        signal: AbortSignal.any([active, AbortSignal.timeout(3000)]),
      });
      if (capabilities.protocolVersion !== 1 || capabilities.contractHash !== hash)
        throw new Error(
          "Update the workbench and Python engine together: their module contracts differ.",
        );
      active.throwIfAborted();
      // Finish submission before cleanup so cancellation cannot race job creation.
      const accepted = await request("/jobs", headers, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocolVersion: 1, contractHash: hash, jobId, project }),
      });
      submitted = true;
      if (accepted.jobId !== jobId || accepted.protocolVersion !== 1)
        throw new Error("Invalid local job response.");
      while (true) {
        active.throwIfAborted();
        const update = await request(`/jobs/${jobId}`, headers, {
          signal: AbortSignal.any([active, AbortSignal.timeout(10_000)]),
        });
        if (update.protocolVersion !== 1 || update.jobId !== jobId)
          throw new Error("Invalid local job identity.");
        progress(decodeProgress(update.progress, project.graph.nodes.length));
        if (update.state === "completed") return decodeRun(update.result, project, hash);
        if (update.state === "failed")
          throw new Error(String(update.error || "Python calculation failed."));
        if (update.state === "cancelled") throw new Error("Python calculation cancelled.");
        if (update.state !== "running") throw new Error("Unknown local job state.");
        await wait(active);
      }
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof TypeError)
        throw new Error(
          "Local Python engine is unavailable. Start it on port 5191 or select Browser in the Engine menu.",
        );
      if (timeout.aborted)
        throw new Error("Python calculation timed out. Reduce the study or select Browser.");
      throw error;
    } finally {
      if (submitted)
        await request(`/jobs/${jobId}`, headers, {
          method: "DELETE",
          signal: AbortSignal.timeout(2000),
        }).catch(() => undefined);
    }
  },
};
