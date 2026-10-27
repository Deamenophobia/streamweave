import {
  WORKBENCH_MODULES,
  type DataValue,
  type WorkbenchProject,
  type WorkbenchRun,
} from "@streamweave/core";
import type { EngineResult, Progress } from "./contracts";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid engine response.");
  return value as Record<string, unknown>;
}

export function decodeProgress(value: unknown, maximum: number): Progress {
  const p = record(value);
  if (
    !Number.isInteger(p.completed) ||
    !Number.isInteger(p.total) ||
    p.total !== maximum ||
    (p.completed as number) < 0 ||
    (p.completed as number) > maximum
  )
    throw new Error("Invalid engine progress.");
  return { completed: p.completed as number, total: maximum };
}

const states = new Set(["valid", "missing", "warming", "stale", "undefined"]);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function validateValue(value: unknown): DataValue {
  const data = record(value);
  if (data.kind === "series") {
    if (
      typeof data.name !== "string" ||
      typeof data.unit !== "string" ||
      !Array.isArray(data.points) ||
      data.points.length > 20_000
    )
      throw new Error("Invalid engine series.");
    for (const raw of data.points) {
      const point = record(raw);
      if (
        !finite(point.timestampMs) ||
        !Number.isSafeInteger(point.timestampMs) ||
        point.timestampMs < 0 ||
        point.timestampMs > 8.64e15 ||
        !states.has(String(point.status)) ||
        !(point.value === null || finite(point.value)) ||
        (point.availableAtMs !== undefined && !finite(point.availableAtMs)) ||
        (point.sampleCount !== undefined &&
          (!Number.isInteger(point.sampleCount) || (point.sampleCount as number) < 0))
      )
        throw new Error("Invalid engine point.");
    }
    return data as unknown as DataValue;
  }
  if (
    !["table", "frame"].includes(String(data.kind)) ||
    !Array.isArray(data.columns) ||
    !Array.isArray(data.rows) ||
    data.columns.length > 40 ||
    data.rows.length > 20_000
  )
    throw new Error("Invalid engine table.");
  const columns = data.columns.map((raw) => {
    const column = record(raw);
    if (
      typeof column.key !== "string" ||
      typeof column.label !== "string" ||
      !["number", "string"].includes(String(column.type)) ||
      (column.unit !== undefined && typeof column.unit !== "string")
    )
      throw new Error("Invalid engine column.");
    return column;
  });
  if (new Set(columns.map((c) => c.key)).size !== columns.length)
    throw new Error("Duplicate engine columns.");
  for (const raw of data.rows) {
    const row = record(raw);
    const values = data.kind === "frame" ? record(row.values) : row;
    const quality = data.kind === "frame" ? record(row.statuses) : null;
    if (quality && !finite(row.timestampMs)) throw new Error("Invalid engine timestamp.");
    for (const column of columns) {
      const cell = values[column.key as string];
      if (cell != null && !(column.type === "number" ? finite(cell) : typeof cell === "string"))
        throw new Error("Invalid engine cell.");
      if (quality && !states.has(String(quality[column.key as string])))
        throw new Error("Invalid engine quality state.");
    }
  }
  return data as unknown as DataValue;
}

export function decodeRun(
  raw: unknown,
  project: WorkbenchProject,
  expectedHash: string,
  previous?: DecodedRun,
): DecodedRun {
  const value = record(raw),
    nodes = record(value.nodes),
    engine = record(value.engine),
    metrics = record(value.metrics);
  const ids = new Set(project.graph.nodes.map((node) => node.id));
  if (
    !Array.isArray(value.order) ||
    value.order.length !== ids.size ||
    new Set(value.order).size !== ids.size ||
    value.order.some((id) => !ids.has(id)) ||
    Object.keys(nodes).length !== ids.size
  )
    throw new Error("Engine graph does not match the requested project.");
  if (
    engine.id !== "python" ||
    engine.protocolVersion !== 2 ||
    engine.contractHash !== expectedHash ||
    typeof engine.version !== "string"
  )
    throw new Error("Incompatible engine provenance.");
  const libraries = record(engine.libraries);
  if (Object.values(libraries).some((v) => typeof v !== "string"))
    throw new Error("Invalid engine libraries.");
  if (
    !finite(metrics.durationMs) ||
    metrics.durationMs < 0 ||
    !Number.isInteger(metrics.cacheHits) ||
    (metrics.cacheHits as number) < 0 ||
    (metrics.cacheHits as number) > ids.size ||
    metrics.nodeCount !== ids.size
  )
    throw new Error("Invalid engine metrics.");
  const result: WorkbenchRun = { order: value.order as string[], nodes: Object.create(null) };
  const keys: Record<string, string> = Object.create(null);
  for (const node of project.graph.nodes) {
    const response = record(nodes[node.id]);
    if (
      !["ready", "error", "blocked"].includes(String(response.state)) ||
      (response.state !== "ready" && typeof response.error !== "string")
    )
      throw new Error("Invalid engine module state.");
    if (response.state === "ready") {
      if (typeof response.key !== "string" || response.key.length !== 64)
        throw new Error("Invalid engine result identity.");
      keys[node.id] = response.key;
    }
    const retained = response.reused === true;
    if (
      retained &&
      (response.state !== "ready" ||
        !previous ||
        previous.keys[node.id] !== response.key ||
        !response.key)
    )
      throw new Error("Engine referenced an unavailable previous result.");
    const outputs = retained ? previous!.run.nodes[node.id]!.outputs : record(response.outputs);
    for (const [id, output] of Object.entries(outputs)) {
      // Retained results crossed this boundary already; do not scan their rows again.
      if (retained) continue;
      const data = validateValue(output);
      if (
        !WORKBENCH_MODULES[node.type].outputs.some(
          (port) => port.id === id && port.accepts.includes(data.kind),
        )
      )
        throw new Error("Invalid engine output port.");
    }
    if (response.sourceDataset !== undefined) {
      const dataset = project.datasets.find((data) => data.id === response.sourceDataset);
      if (retained || node.type !== "source" || !dataset || node.params.datasetId !== dataset.id)
        throw new Error("Engine referenced an unavailable source dataset.");
      outputs.data = { kind: "table", columns: dataset.columns, rows: dataset.rows };
    }
    result.nodes[node.id] = {
      state: response.state as "ready" | "error" | "blocked",
      outputs: outputs as Record<string, DataValue>,
      inputs: [],
      ...(response.error ? { error: String(response.error) } : {}),
    };
  }
  // Reconstruct wire references instead of repeating datasets in the HTTP response.
  for (const edge of project.graph.edges) {
    const target = result.nodes[edge.target]!;
    if (target.state === "blocked") continue;
    const data = result.nodes[edge.source]!.outputs[edge.sourcePort];
    if (!data) throw new Error("Engine omitted a connected output.");
    target.inputs.push({ edge, data });
  }
  return {
    keys,
    run: result,
    engine: {
      id: "python",
      version: engine.version,
      protocolVersion: 2,
      contractHash: expectedHash,
      libraries: libraries as Record<string, string>,
    },
    metrics: metrics as EngineResult["metrics"],
  };
}

export type DecodedRun = EngineResult & { keys: Record<string, string> };
