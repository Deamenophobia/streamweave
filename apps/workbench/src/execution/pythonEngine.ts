import type { WorkbenchProject } from "@streamweave/core";
import type { ComputeEngine } from "./contracts";
import { decodeProgress, decodeRun, record, type DecodedRun } from "./protocol";
import { contractHash } from "./catalogueHash";

const endpoint = "http://127.0.0.1:5191/v2";
const bundleIds = new WeakMap<WorkbenchProject["datasets"], string>();
let session: string | undefined;
let uploaded: string | undefined;
let previous: DecodedRun | undefined;
let sequence = 0;

class EngineFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, headers: Record<string, string>, options: RequestInit = {}) {
  const response = await fetch(endpoint + path, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new EngineFailure(
      String(body.error?.code ?? "http_error"),
      String(body.error?.message ?? `Local engine returned HTTP ${response.status}.`),
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

async function upload(project: WorkbenchProject, id: string, headers: Record<string, string>) {
  await request(`/datasets/${id}`, headers, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project.datasets),
  });
  uploaded = id;
}

export const pythonEngine: ComputeEngine = {
  async run(project, signal, progress) {
    const started = performance.now(),
      current = ++sequence;
    const hash = await contractHash();
    session ??= crypto.randomUUID();
    let bundle = bundleIds.get(project.datasets);
    if (!bundle) {
      bundle = crypto.randomUUID();
      bundleIds.set(project.datasets, bundle);
    }
    const prior = previous;
    const headers = { "X-Streamweave-Protocol": "2", "X-Streamweave-Session": session };
    const jobId = crypto.randomUUID();
    let submitted = false;
    const timeout = AbortSignal.timeout(125_000);
    const active = AbortSignal.any([signal, timeout]);
    try {
      active.throwIfAborted();
      const capabilities = await request("/capabilities", headers, {
        signal: AbortSignal.any([active, AbortSignal.timeout(3000)]),
      });
      if (capabilities.protocolVersion !== 2 || capabilities.contractHash !== hash)
        throw new Error("Update the workbench and Python engine together: their contracts differ.");
      active.throwIfAborted();
      if (uploaded !== bundle) await upload(project, bundle, headers);
      const submission = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocolVersion: 2,
          contractHash: hash,
          jobId,
          bundleId: bundle,
          graph: project.graph,
          knownResults: prior?.keys ?? {},
        }),
      };
      // Await submission before DELETE: cancellation cannot race job creation.
      active.throwIfAborted();
      let accepted;
      try {
        accepted = await request("/jobs", headers, submission);
      } catch (error) {
        if (!(error instanceof EngineFailure) || error.code !== "datasets_missing") throw error;
        active.throwIfAborted();
        await upload(project, bundle, headers);
        active.throwIfAborted();
        accepted = await request("/jobs", headers, submission);
      }
      submitted = true;
      if (accepted.jobId !== jobId || accepted.protocolVersion !== 2)
        throw new Error("Invalid local job response.");
      while (true) {
        active.throwIfAborted();
        const update = await request(`/jobs/${jobId}`, headers, {
          signal: AbortSignal.any([active, AbortSignal.timeout(10_000)]),
        });
        if (update.protocolVersion !== 2 || update.jobId !== jobId)
          throw new Error("Invalid local job identity.");
        progress(decodeProgress(update.progress, project.graph.nodes.length));
        if (update.state === "completed") {
          const payload = await request(`/jobs/${jobId}/result`, headers, { signal: active });
          const decoded = decodeRun(payload, project, hash, prior);
          decoded.metrics.totalMs = performance.now() - started;
          if (!active.aborted && current === sequence) previous = decoded;
          return decoded;
        }
        if (update.state === "failed" || update.state === "cancelled") {
          const error = record(update.error);
          throw new EngineFailure(String(error.code), String(error.message));
        }
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
