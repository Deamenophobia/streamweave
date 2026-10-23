import { replay, type ReplayFrame } from "./replay.js";
import { DEFAULT_WINDOW, validateWindow, type StreamEvent } from "./pressure.js";

export type ModuleKind = "source" | "window" | "pressure" | "smooth" | "output";
export interface PipelineNode {
  id: string;
  kind: ModuleKind;
  position: { x: number; y: number };
  params: Record<string, string | number>;
}
export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}
export interface Pipeline {
  version: 1;
  name: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}
export const MODULES = {
  source: {
    label: "Event source",
    input: null,
    output: "events",
    description: "Timestamped, signed observations",
  },
  window: {
    label: "Time window",
    input: "events",
    output: "window",
    description: "Aggregate a bounded time interval",
  },
  pressure: {
    label: "Directional pressure",
    input: "window",
    output: "signal",
    description: "Normalize positive and negative flow",
  },
  smooth: {
    label: "Temporal smoothing",
    input: "signal",
    output: "signal",
    description: "Reduce noise with a time-based EMA",
  },
  output: {
    label: "Indicator",
    input: "signal",
    output: null,
    description: "Inspect and export the result",
  },
} as const;

export function defaultPipeline(): Pipeline {
  const kinds: ModuleKind[] = ["source", "window", "pressure", "smooth", "output"];
  const parameters: Record<string, string | number>[] = [
    { stream: "sensor-A" },
    { windowMs: 30_000, halfLifeMs: 10_000, minEvents: 5 },
    { metric: "decayed" },
    { halfLifeMs: 5000 },
    {},
  ];
  return {
    version: 1,
    name: "Directional flow study",
    nodes: kinds.map((kind, i) => ({
      id: kind,
      kind,
      position: { x: i * 255, y: i % 2 ? 140 : 90 },
      params: parameters[i]!,
    })),
    edges: kinds.slice(1).map((kind, i) => ({ id: `edge-${i}`, source: kinds[i]!, target: kind })),
  };
}

/** Checks connection types, single-input cardinality, and cycle prevention during editing. */
export function connectionError(graph: Pipeline, source: string, target: string): string | null {
  const a = graph.nodes.find((n) => n.id === source),
    b = graph.nodes.find((n) => n.id === target);
  if (!a || !b) return "Connection references an unknown node.";
  if (source === target) return "A node cannot connect to itself.";
  if (!MODULES[a.kind].output || MODULES[a.kind].output !== MODULES[b.kind].input)
    return "These ports carry incompatible data.";
  if (graph.edges.some((e) => e.target === target)) return "This input already has a connection.";
  const pending = [target],
    seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === source) return "Connections must not create a cycle.";
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...graph.edges.filter((e) => e.source === id).map((e) => e.target));
  }
  return null;
}

export function validatePipeline(graph: Pipeline): string[] {
  const errors: string[] = [];
  if (
    !graph ||
    graph.version !== 1 ||
    typeof graph.name !== "string" ||
    !graph.name.trim() ||
    graph.name.length > 120
  )
    return ["Expected a version 1 pipeline with a name of 1–120 characters."];
  if (
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > 5 ||
    graph.edges.length > 4
  )
    return ["This version supports one source, window, pressure, output, and optional smoother."];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (
      !node ||
      typeof node.id !== "string" ||
      !node.id.trim() ||
      node.id.length > 100 ||
      !Object.hasOwn(MODULES, node.kind) ||
      !node.position ||
      !Number.isFinite(node.position.x) ||
      !Number.isFinite(node.position.y) ||
      !node.params ||
      typeof node.params !== "object" ||
      Array.isArray(node.params)
    )
      return ["Malformed pipeline node."];
    if (ids.has(node.id)) errors.push("Node IDs must be unique.");
    ids.add(node.id);
  }
  for (const kind of Object.keys(MODULES) as ModuleKind[]) {
    const count = graph.nodes.filter((n) => n.kind === kind).length;
    if (kind === "smooth" ? count > 1 : count !== 1)
      errors.push(`Expected ${kind === "smooth" ? "at most" : "exactly"} one ${kind} node.`);
  }
  const added: Pipeline = { ...graph, edges: [] };
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge || typeof edge.id !== "string" || !edge.id || edgeIds.has(edge.id)) {
      errors.push("Edge IDs must be non-empty and unique.");
      continue;
    }
    edgeIds.add(edge.id);
    const error = connectionError(added, edge.source, edge.target);
    if (error) errors.push(error);
    else added.edges.push(edge);
  }
  for (const node of graph.nodes) {
    if (node.kind !== "source" && !added.edges.some((e) => e.target === node.id))
      errors.push(`${MODULES[node.kind].label} needs an input.`);
    if (node.kind !== "output" && added.edges.filter((e) => e.source === node.id).length !== 1)
      errors.push(`${MODULES[node.kind].label} needs exactly one output connection.`);
  }
  try {
    const window = graph.nodes.find((n) => n.kind === "window");
    if (window)
      validateWindow({
        ...DEFAULT_WINDOW,
        windowMs: Number(window.params.windowMs),
        halfLifeMs: Number(window.params.halfLifeMs),
        minEvents: Number(window.params.minEvents),
      });
    const source = graph.nodes.find((n) => n.kind === "source");
    if (source && (typeof source.params.stream !== "string" || !source.params.stream.trim()))
      errors.push("Select a source stream.");
    const pressure = graph.nodes.find((n) => n.kind === "pressure");
    if (pressure && !["raw", "decayed"].includes(String(pressure.params.metric)))
      errors.push("Unknown pressure metric.");
    const smooth = graph.nodes.find((n) => n.kind === "smooth");
    if (
      smooth &&
      (!Number.isFinite(Number(smooth.params.halfLifeMs)) || Number(smooth.params.halfLifeMs) < 1)
    )
      errors.push("Smoothing half-life must be at least 1 ms.");
  } catch (error) {
    errors.push((error as Error).message);
  }
  return [...new Set(errors)];
}

export function runPipeline(
  graph: Pipeline,
  events: readonly StreamEvent[],
  stepMs = 1000,
): (ReplayFrame & { output: number | null })[] {
  const errors = validatePipeline(graph);
  if (errors.length) throw new Error(errors.join(" "));
  const source = graph.nodes.find((n) => n.kind === "source")!;
  const window = graph.nodes.find((n) => n.kind === "window")!;
  const pressure = graph.nodes.find((n) => n.kind === "pressure")!;
  const smooth = graph.nodes.find((n) => n.kind === "smooth");
  const metric = pressure.params.metric === "raw" ? "pressure" : "decayedPressure";
  return replay(events, {
    stream: String(source.params.stream),
    stepMs,
    windowMs: Number(window.params.windowMs),
    halfLifeMs: Number(window.params.halfLifeMs),
    minEvents: Number(window.params.minEvents),
    smoothingSource: metric,
    smoothingHalfLifeMs: smooth ? Number(smooth.params.halfLifeMs) : 1,
  }).map((frame) => ({ ...frame, output: smooth ? frame.smoothedPressure : frame[metric] }));
}
