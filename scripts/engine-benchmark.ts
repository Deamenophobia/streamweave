import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { cpus, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { executeWorkbench, type WorkbenchProject } from "../packages/core/src/index.js";
import { benchmarkStudy } from "./engine-fixtures.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const python =
  process.env.STREAMWEAVE_PYTHON ||
  resolve(
    root,
    ".local/engine-venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
const probe = process.env.STREAMWEAVE_ENGINE_PID
  ? spawn(
      python,
      [resolve(root, "scripts/engine-memory-probe.py"), process.env.STREAMWEAVE_ENGINE_PID],
      { stdio: ["pipe", "pipe", "inherit"] },
    )
  : null;
const lines = probe ? createInterface({ input: probe.stdout })[Symbol.asyncIterator]() : null;
async function memory(command: "reset" | "read") {
  if (!probe || !lines) return null;
  probe.stdin.write(command + "\n");
  const line = await lines.next();
  if (line.done) throw new Error("Memory probe exited.");
  return JSON.parse(line.value) as { baselineRssBytes: number; peakRssBytes: number };
}
const hash = createHash("sha256")
  .update((await readFile(resolve(root, "protocol/modules.json"), "utf8")).replace(/\r\n/g, "\n"))
  .digest("hex");
const endpoint = "http://127.0.0.1:5191/v2";

async function http(
  project: WorkbenchProject,
  session: string,
  bundle: string,
  known: Record<string, string> = {},
  upload = true,
) {
  const headers = {
    "Content-Type": "application/json",
    // Avoid a stale Node keep-alive socket after a long synchronous JS benchmark.
    Connection: "close",
    "X-Streamweave-Protocol": "2",
    "X-Streamweave-Session": session,
  };
  let requestBytes = 0,
    responseBytes = 0;
  const started = performance.now();
  async function request(path: string, method = "GET", value?: unknown) {
    const body = value === undefined ? undefined : JSON.stringify(value);
    requestBytes += body ? Buffer.byteLength(body) : 0;
    const response = await fetch(endpoint + path, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(125_000),
    });
    const text = await response.text();
    responseBytes += Buffer.byteLength(text);
    if (!response.ok) throw new Error(text);
    return text ? JSON.parse(text) : {};
  }
  if (upload) await request(`/datasets/${bundle}`, "PUT", project.datasets);
  const job = randomUUID();
  await request("/jobs", "POST", {
    protocolVersion: 2,
    contractHash: hash,
    jobId: job,
    bundleId: bundle,
    graph: project.graph,
    knownResults: known,
  });
  try {
    while (true) {
      const status = await request(`/jobs/${job}`);
      if (status.state === "failed") throw new Error(JSON.stringify(status.error));
      if (status.state === "completed") {
        const result = await request(`/jobs/${job}/result`);
        return {
          elapsed: performance.now() - started,
          metrics: result.metrics,
          requestBytes,
          responseBytes,
          keys: Object.fromEntries(
            Object.entries(result.nodes as Record<string, { key?: string }>)
              .filter(([, node]) => node.key)
              .map(([id, node]) => [id, node.key!]),
          ),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  } finally {
    await request(`/jobs/${job}`, "DELETE");
  }
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const records = [];
try {
  for (const [rows, window] of [
    [1000, 100],
    [5000, 500],
    [20000, 1000],
  ]) {
    const project = benchmarkStudy(rows!, window!);
    executeWorkbench(project.graph, project.datasets);
    await memory("reset");
    const samples = [];
    for (let repeat = 0; repeat < 5; repeat++) {
      const start = performance.now();
      executeWorkbench(project.graph, project.datasets);
      const javascriptMs = performance.now() - start;
      const session = randomUUID(),
        bundle = randomUUID();
      const fresh = await http(project, session, bundle);
      const cached = await http(project, session, bundle, fresh.keys, false);
      samples.push({
        javascriptMs,
        pythonEngineMs: fresh.metrics.durationMs,
        pythonCachedMs: cached.metrics.durationMs,
        httpFreshMs: fresh.elapsed,
        httpCachedMs: cached.elapsed,
        freshRequestBytes: fresh.requestBytes,
        cachedRequestBytes: cached.requestBytes,
        freshResponseBytes: fresh.responseBytes,
        cachedResponseBytes: cached.responseBytes,
        cacheHits: cached.metrics.cacheHits,
      });
    }
    const medians = Object.fromEntries(
      Object.keys(samples[0]!).map((key) => [
        key,
        median(samples.map((s) => s[key as keyof typeof s])),
      ]),
    );
    const residentMemory = await memory("read");
    records.push({
      rowsPerSource: rows,
      totalRows: rows! * 2,
      window,
      samples,
      medians,
      residentMemory,
    });
    console.log(JSON.stringify({ rowsPerSource: rows, window, ...medians, residentMemory }));
  }
  await writeFile(
    resolve(root, ".local/engine-benchmark.json"),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        cpu: cpus()[0]?.model,
        platform: platform(),
        node: process.version,
        samplesPerCase: 5,
        description:
          "Two sources, timestamp alignment, rolling correlation, sample standard deviation, OLS, four outputs. Warm TypeScript core in Node. Fresh HTTP includes upload/validation; cached HTTP reuses input and output objects. Both include JSON and 120 ms polling; exclude UI rendering. Engine duration excludes one-time input validation. Optional service RSS sampled every 20 ms across each case, including retained sessions/results; not an allocation proof.",
        records,
      },
      null,
      2,
    ),
  );
} finally {
  probe?.stdin.end();
}
