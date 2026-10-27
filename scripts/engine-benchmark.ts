import { writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { cpus, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
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
const child = spawn(python, ["-m", "streamweave_engine.cli"], {
  cwd: resolve(root, "services/engine"),
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1" },
});
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
const hash = createHash("sha256")
  .update((await readFile(resolve(root, "protocol/modules.json"), "utf8")).replace(/\r\n/g, "\n"))
  .digest("hex");

async function local(project: WorkbenchProject, cache: boolean) {
  const started = performance.now();
  child.stdin.write(JSON.stringify({ project, cache }) + "\n");
  const line = await lines.next();
  if (line.done) throw new Error("Python benchmark process exited.");
  const result = JSON.parse(line.value);
  return { result, elapsed: performance.now() - started };
}

async function http(project: WorkbenchProject, session: string) {
  const jobId = randomUUID();
  const headers = {
    "Content-Type": "application/json",
    "X-Streamweave-Protocol": "1",
    "X-Streamweave-Session": session,
  };
  const url = "http://127.0.0.1:5191/v1/jobs";
  const started = performance.now();
  const accepted = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ protocolVersion: 1, contractHash: hash, jobId, project }),
    signal: AbortSignal.timeout(125_000),
  });
  if (!accepted.ok) throw new Error(await accepted.text());
  try {
    while (true) {
      const response = await fetch(`${url}/${jobId}`, {
        headers,
        signal: AbortSignal.timeout(125_000),
      });
      const status = await response.json();
      if (!response.ok || status.state === "failed") throw new Error(JSON.stringify(status));
      if (status.state === "completed")
        return { elapsed: performance.now() - started, metrics: status.result.metrics };
      // Same polling interval as the UI; includes transport, JSON, and waiting overhead.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  } finally {
    await fetch(`${url}/${jobId}`, { method: "DELETE", headers });
  }
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const records = [];
try {
  await local(benchmarkStudy(100, 20), false); // Exclude interpreter/library startup, as with the running service.
  for (const [rows, window] of [
    [1000, 100],
    [5000, 500],
    [20000, 1000],
  ]) {
    const project = benchmarkStudy(rows!, window!);
    executeWorkbench(project.graph, project.datasets); // JIT warmup.
    const samples = [];
    for (let repeat = 0; repeat < 5; repeat++) {
      const start = performance.now();
      executeWorkbench(project.graph, project.datasets);
      const javascriptMs = performance.now() - start;
      const fresh = await local(project, false);
      const cached = await local(project, true);
      const session = randomUUID(); // Cold cache while keeping Python libraries loaded.
      const httpFresh = await http(project, session);
      const httpCached = await http(project, session);
      samples.push({
        javascriptMs,
        pythonEngineMs: fresh.result.metrics.durationMs,
        pythonCachedMs: cached.result.metrics.durationMs,
        httpFreshMs: httpFresh.elapsed,
        httpCachedMs: httpCached.elapsed,
        cacheHits: httpCached.metrics.cacheHits,
      });
    }
    const medians = Object.fromEntries(
      Object.keys(samples[0]!)
        .filter((key) => key !== "cacheHits")
        .map((key) => [key, median(samples.map((s) => s[key as keyof typeof s]))]),
    );
    records.push({ rowsPerSource: rows, totalRows: rows! * 2, window, samples, medians });
    console.log(JSON.stringify({ rowsPerSource: rows, window, ...medians }));
  }
  const report = {
    recordedAt: new Date().toISOString(),
    cpu: cpus()[0]?.model,
    platform: platform(),
    node: process.version,
    samplesPerCase: 5,
    description:
      "Two sources, timestamp alignment, rolling correlation, sample standard deviation, OLS, four outputs. Warm runtimes. Browser core measured in Node; HTTP includes JSON and 120 ms polling, excludes UI rendering.",
    records,
  };
  await writeFile(resolve(root, ".local/engine-benchmark.json"), JSON.stringify(report, null, 2));
} finally {
  child.stdin.end();
  child.kill();
}
