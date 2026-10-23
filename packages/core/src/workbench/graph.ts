import { replay } from "../replay.js";
import {
  numeric,
  selectSeries,
  validateDataset,
  type Dataset,
  type DataValue,
  type DataTable,
  type Series,
  type AlignedFrame,
} from "./data.js";
import {
  alignSeries,
  arithmeticSeries,
  fitLinear,
  rollingCorrelation,
  rollingSeries,
  smoothSeries,
  transformSeries,
} from "./math.js";

export type WorkbenchKind =
  | "source"
  | "field"
  | "filter"
  | "align"
  | "transform"
  | "scale"
  | "smooth"
  | "rolling"
  | "arithmetic"
  | "correlation"
  | "regression"
  | "pressure"
  | "chart"
  | "table"
  | "export";
export interface WorkbenchNode {
  id: string;
  type: WorkbenchKind;
  title: string;
  position: { x: number; y: number };
  params: Record<string, string | number>;
}
export interface WorkbenchEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}
export interface WorkbenchGraph {
  version: 2;
  name: string;
  nodes: WorkbenchNode[];
  edges: WorkbenchEdge[];
}
export interface WorkbenchProject {
  format: "streamweave-project";
  version: 2;
  graph: WorkbenchGraph;
  datasets: Dataset[];
}
export interface Port {
  id: string;
  label: string;
  accepts: DataValue["kind"][];
  minimum?: number;
  multiple?: boolean;
}
export interface ModuleDefinition {
  title: string;
  category: "Data" | "Process" | "Analyze" | "Output";
  description: string;
  inputs: Port[];
  outputs: Port[];
  defaults: Record<string, string | number>;
}
const input = (id: string, accepts: DataValue["kind"][], multiple = false, minimum = 1): Port => ({
  id,
  label: id,
  accepts,
  multiple,
  minimum,
});
const output = (id: string, type: DataValue["kind"]): Port => ({ id, label: id, accepts: [type] });
const all: DataValue["kind"][] = ["table", "series", "frame"];
export const WORKBENCH_MODULES: Record<WorkbenchKind, ModuleDefinition> = {
  source: {
    title: "Dataset",
    category: "Data",
    description:
      "Expose a table and an optional selected numeric series. Each source chooses its own dataset.",
    inputs: [],
    outputs: [output("data", "table"), output("series", "series")],
    defaults: { datasetId: "", column: "", unit: "", label: "" },
  },
  field: {
    title: "Select series",
    category: "Data",
    description:
      "Select a numeric column from a timestamped table or aligned frame. Preserves timestamps, availability, and missing states.",
    inputs: [input("data", ["table", "frame"])],
    outputs: [output("series", "series")],
    defaults: { column: "", unit: "", label: "" },
  },
  filter: {
    title: "Filter rows",
    category: "Process",
    description: "Keep rows matching a column condition. Gaps remain explicit downstream.",
    inputs: [input("data", ["table"])],
    outputs: [output("data", "table")],
    defaults: { column: "", operator: "gte", value: "0" },
  },
  align: {
    title: "Align timestamps",
    category: "Process",
    description:
      "Connect two or more series. Exact intersection/union, or a regular grid using only earlier available observations with a maximum age.",
    inputs: [input("series", ["series"], true, 2)],
    outputs: [output("frame", "frame")],
    defaults: { mode: "previous", stepMs: 60_000, maxAgeMs: 150_000 },
  },
  transform: {
    title: "Change / lag",
    category: "Process",
    description:
      "Difference, percentage change, log change, or lag by observation count. Use regular alignment first when equal time intervals are required.",
    inputs: [input("series", ["series"])],
    outputs: [output("series", "series")],
    defaults: { operation: "difference", lag: 1 },
  },
  scale: {
    title: "Scale & offset",
    category: "Process",
    description: "Apply value × factor + offset and explicitly assign an output unit.",
    inputs: [input("series", ["series"])],
    outputs: [output("series", "series")],
    defaults: { factor: 1, offset: 0, unit: "value" },
  },
  smooth: {
    title: "Smooth",
    category: "Process",
    description: "Time-based exponential moving average. Missing observations reset the filter.",
    inputs: [input("series", ["series"])],
    outputs: [output("series", "series")],
    defaults: { halfLifeMs: 180_000 },
  },
  rolling: {
    title: "Rolling statistic",
    category: "Analyze",
    description:
      "Mean, sample standard deviation, minimum, maximum, or count over trailing observations. Minimum valid sample count is explicit.",
    inputs: [input("series", ["series"])],
    outputs: [output("series", "series")],
    defaults: { operation: "mean", window: 10, minimum: 3 },
  },
  arithmetic: {
    title: "Pair arithmetic",
    category: "Analyze",
    description:
      "Add, subtract, multiply, or divide two aligned columns. Addition/subtraction require matching units.",
    inputs: [input("frame", ["frame"])],
    outputs: [output("series", "series")],
    defaults: { x: "", y: "", operation: "subtract" },
  },
  correlation: {
    title: "Rolling correlation",
    category: "Analyze",
    description:
      "Pearson correlation over trailing aligned rows, using complete pairs. Constant series are undefined; sample counts are retained.",
    inputs: [input("frame", ["frame"])],
    outputs: [output("series", "series")],
    defaults: { x: "", y: "", window: 20, minimum: 5 },
  },
  regression: {
    title: "Linear fit",
    category: "Analyze",
    description:
      "Descriptive OLS: Y = intercept + slope × X. Fits the complete supplied sample. Residuals and R² are in-sample, not forecasting results.",
    inputs: [input("frame", ["frame"])],
    outputs: [output("model", "table"), output("residuals", "series")],
    defaults: { x: "", y: "" },
  },
  pressure: {
    title: "Directional pressure",
    category: "Analyze",
    description:
      "Optional signed-event measure. Requires numeric direction (1 / −1) and positive weight columns. No direction is inferred.",
    inputs: [input("data", ["table"])],
    outputs: [output("series", "series")],
    defaults: { windowMs: 30_000, halfLifeMs: 10_000, minimum: 5, stepMs: 1000 },
  },
  chart: {
    title: "Chart",
    category: "Output",
    description:
      "Connect several series or aligned frames. Each series has its own scale and unit; measurements are never combined.",
    inputs: [input("in", ["series", "frame"], true)],
    outputs: [],
    defaults: {},
  },
  table: {
    title: "Table",
    category: "Output",
    description: "Inspect exact values, missing states, and metadata. Page through all rows.",
    inputs: [input("in", all)],
    outputs: [],
    defaults: {},
  },
  export: {
    title: "Export",
    category: "Output",
    description:
      "Export CSV values or JSON results with the complete project, source datasets, and calculation parameters.",
    inputs: [input("in", all)],
    outputs: [],
    defaults: {},
  },
};

export interface NodeResult {
  state: "ready" | "error" | "blocked";
  outputs: Record<string, DataValue>;
  inputs: { edge: WorkbenchEdge; data: DataValue }[];
  error?: string;
}
export interface WorkbenchRun {
  nodes: Record<string, NodeResult>;
  order: string[];
}
const goodId = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(s) &&
  !["constructor", "prototype"].includes(s);

export function workbenchConnectionError(
  graph: WorkbenchGraph,
  edge: Omit<WorkbenchEdge, "id">,
): string | null {
  const source = graph.nodes.find((n) => n.id === edge.source),
    target = graph.nodes.find((n) => n.id === edge.target);
  if (!source || !target) return "Unknown module.";
  if (source.id === target.id) return "A module cannot connect to itself.";
  const from = WORKBENCH_MODULES[source.type]?.outputs.find((p) => p.id === edge.sourcePort),
    to = WORKBENCH_MODULES[target.type]?.inputs.find((p) => p.id === edge.targetPort);
  if (!from || !to) return "Unknown port.";
  if (!from.accepts.some((t) => to.accepts.includes(t)))
    return `This port accepts ${to.accepts.join(" or ")}; the source produces ${from.accepts.join(" or ")}.`;
  if (
    graph.edges.some(
      (e) =>
        e.source === edge.source &&
        e.sourcePort === edge.sourcePort &&
        e.target === edge.target &&
        e.targetPort === edge.targetPort,
    )
  )
    return "This connection already exists.";
  if (
    !to.multiple &&
    graph.edges.some((e) => e.target === edge.target && e.targetPort === edge.targetPort)
  )
    return "This port accepts one connection.";
  const pending = [edge.target],
    visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === edge.source) return "Connections must not form a cycle.";
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...graph.edges.filter((e) => e.source === id).map((e) => e.target));
  }
  return null;
}

export function validateWorkbench(graph: WorkbenchGraph): string[] {
  if (
    !graph ||
    graph.version !== 2 ||
    typeof graph.name !== "string" ||
    !graph.name.trim() ||
    graph.name.length > 120
  )
    return ["Expected a version 2 graph with a name of 1–120 characters."];
  if (
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > 50 ||
    graph.edges.length > 120
  )
    return ["Graph limits: 50 modules and 120 connections."];
  const ids = new Set<string>(),
    edgeIds = new Set<string>();
  for (const n of graph.nodes) {
    if (
      !n ||
      !goodId(n.id) ||
      !Object.hasOwn(WORKBENCH_MODULES, n.type) ||
      typeof n.title !== "string" ||
      !n.title.trim() ||
      n.title.length > 100 ||
      !n.position ||
      !Number.isFinite(n.position.x) ||
      !Number.isFinite(n.position.y) ||
      !n.params ||
      typeof n.params !== "object" ||
      Array.isArray(n.params)
    )
      return ["Malformed module."];
    if (ids.has(n.id)) return ["Module IDs must be unique."];
    ids.add(n.id);
    if (
      Object.entries(n.params).some(
        ([k, v]) =>
          !goodId(k) ||
          !(
            (typeof v === "string" && v.length <= 200) ||
            (typeof v === "number" && Number.isFinite(v))
          ),
      )
    )
      return ["Invalid module parameters."];
  }
  const accepted: WorkbenchGraph = { ...graph, edges: [] };
  for (const e of graph.edges) {
    if (!e || !goodId(e.id) || edgeIds.has(e.id)) return ["Connection IDs must be unique."];
    edgeIds.add(e.id);
    const error = workbenchConnectionError(accepted, e);
    if (error) return [error];
    accepted.edges.push(e);
  }
  return [];
}

function numberParam(
  node: WorkbenchNode,
  key: string,
  min: number,
  max: number,
  integer = false,
): number {
  const value = numeric(node.params[key], key, min, max);
  if (integer && !Number.isSafeInteger(value)) throw new Error(`${key} must be an integer.`);
  return value;
}
function textParam(node: WorkbenchNode, key: string): string {
  return String(node.params[key] ?? "");
}

function evaluateNode(
  node: WorkbenchNode,
  incoming: NodeResult["inputs"],
  datasets: Map<string, Dataset>,
): Record<string, DataValue> {
  const p = node.params;
  const first = incoming[0]?.data;
  const table = first as DataTable,
    series = first as Series,
    frame = first as AlignedFrame;
  const n = (key: string, min: number, max: number, integer = false) =>
    numberParam(node, key, min, max, integer);
  const s = (key: string) => textParam(node, key);
  if (node.type === "source") {
    const dataset = datasets.get(s("datasetId"));
    if (!dataset) throw new Error("Choose an available dataset.");
    const outputs: Record<string, DataValue> = {
      data: { kind: "table", columns: dataset.columns, rows: dataset.rows },
    };
    if (s("column"))
      outputs.series = selectSeries(dataset, s("column"), s("label") || dataset.name, s("unit"));
    return outputs;
  }
  if (node.type === "field")
    return {
      series: selectSeries(first as DataTable | AlignedFrame, s("column"), s("label"), s("unit")),
    };
  if (node.type === "filter") {
    const column = table.columns.find((c) => c.key === s("column"));
    if (!column) throw new Error("Choose a filter column.");
    if (!["eq", "gte", "lte", "present"].includes(s("operator")))
      throw new Error("Unknown filter operator.");
    if (
      ["gte", "lte"].includes(s("operator")) &&
      (column.type !== "number" || !s("value").trim() || !Number.isFinite(Number(p.value)))
    )
      throw new Error("Numeric comparison needs a numeric column and value.");
    const rows = table.rows.filter(
      (r) =>
        r[column.key] != null &&
        (s("operator") === "present" ||
          (s("operator") === "eq"
            ? String(r[column.key]) === s("value")
            : s("operator") === "gte"
              ? Number(r[column.key]) >= Number(p.value)
              : Number(r[column.key]) <= Number(p.value))),
    );
    return { data: { ...table, rows } };
  }
  if (node.type === "align")
    return {
      frame: alignSeries(
        incoming.map(({ edge, data }) => ({
          key: `${edge.source}_${edge.sourcePort}`,
          series: data as Series,
        })),
        s("mode"),
        n("stepMs", 1, 31_536_000_000, true),
        n("maxAgeMs", 0, 31_536_000_000, true),
      ),
    };
  if (node.type === "transform")
    return { series: transformSeries(series, s("operation"), n("lag", 1, 1000, true)) };
  if (node.type === "smooth")
    return { series: smoothSeries(series, n("halfLifeMs", 1, 31_536_000_000)) };
  if (node.type === "scale") {
    const factor = n("factor", -1e12, 1e12),
      offset = n("offset", -1e12, 1e12);
    return {
      series: {
        ...series,
        name: `${series.name} · scaled`,
        unit: s("unit") || series.unit,
        points: series.points.map((p) => {
          if (p.value === null) return { ...p };
          const value = p.value * factor + offset;
          return {
            ...p,
            value: Number.isFinite(value) ? value : null,
            status: Number.isFinite(value) ? p.status : "undefined",
          };
        }),
      },
    };
  }
  if (node.type === "rolling" || node.type === "correlation") {
    const count = n("window", 2, 1000, true),
      minimum = n("minimum", node.type === "correlation" ? 3 : 1, count, true);
    return {
      series:
        node.type === "rolling"
          ? rollingSeries(series, count, minimum, s("operation"))
          : rollingCorrelation(frame, s("x"), s("y"), count, minimum),
    };
  }
  if (node.type === "regression") return fitLinear(frame, s("x"), s("y"));
  if (node.type === "arithmetic")
    return { series: arithmeticSeries(frame, s("x"), s("y"), s("operation")) };
  if (node.type === "pressure") {
    if (
      table.rows.some(
        (r) => r.availableAtMs != null && Number(r.availableAtMs) !== Number(r.timestampMs),
      )
    )
      throw new Error(
        "Directional pressure requires events available at their event time. Delayed-release data is not supported by this module.",
      );
    const observations = table.rows.map((r, i) => ({
      id: String(i),
      timestampMs: Number(r.timestampMs),
      stream: node.id,
      direction: Number(r.direction) as 1 | -1,
      weight: Number(r.weight),
    }));
    const frames = replay(observations, {
      stream: node.id,
      windowMs: n("windowMs", 1, 3_600_000, true),
      halfLifeMs: n("halfLifeMs", 1, 3_600_000),
      minEvents: n("minimum", 1, 100_000, true),
      stepMs: n("stepMs", 1, 3_600_000, true),
    });
    if (frames.some((f) => f.timestampMs > 8.64e15))
      throw new Error("Pressure replay extends beyond the supported date range.");
    return {
      series: {
        kind: "series",
        name: node.title,
        unit: "pressure points",
        points: frames.map((f) => ({
          timestampMs: f.timestampMs,
          value: f.decayedPressure,
          status: f.status === "ready" ? "valid" : f.status === "warming" ? "warming" : "missing",
          sampleCount: f.count,
        })),
      },
    };
  }
  return {}; // Output modules expose their incoming values without modifying them.
}

/** Executes the actual DAG, including disconnected branches. No prescribed module sequence. */
export function executeWorkbench(
  graph: WorkbenchGraph,
  sourceDatasets: readonly Dataset[],
): WorkbenchRun {
  const issues = validateWorkbench(graph);
  if (issues.length) throw new Error(issues.join(" "));
  if (
    sourceDatasets.length > 12 ||
    sourceDatasets.reduce((n, d) => n + (d?.rows?.length ?? 0), 0) > 50_000
  )
    throw new Error("Project supports at most 12 datasets and 50,000 total rows.");
  const datasets = new Map<string, Dataset>();
  for (const d of sourceDatasets) {
    validateDataset(d);
    if (datasets.has(d.id)) throw new Error("Dataset IDs must be unique.");
    datasets.set(d.id, d);
  }
  const nodes: Record<string, NodeResult> = Object.create(null),
    order: string[] = [];
  const pending = new Set(graph.nodes.map((n) => n.id));
  while (pending.size) {
    const ready = graph.nodes.filter(
      (n) =>
        pending.has(n.id) &&
        graph.edges.filter((e) => e.target === n.id).every((e) => !pending.has(e.source)),
    );
    if (!ready.length) throw new Error("Graph contains a cycle.");
    for (const node of ready) {
      pending.delete(node.id);
      order.push(node.id);
      const edges = graph.edges.filter((e) => e.target === node.id),
        incoming: NodeResult["inputs"] = [];
      const blocked = edges.find(
        (e) => nodes[e.source]?.state !== "ready" || !nodes[e.source]?.outputs[e.sourcePort],
      );
      if (blocked) {
        nodes[node.id] = {
          state: "blocked",
          inputs: [],
          outputs: {},
          error: `Waiting for ${graph.nodes.find((n) => n.id === blocked.source)!.title} / ${blocked.sourcePort}.`,
        };
        continue;
      }
      for (const edge of edges)
        incoming.push({ edge, data: nodes[edge.source]!.outputs[edge.sourcePort]! });
      try {
        for (const port of WORKBENCH_MODULES[node.type].inputs) {
          if (edges.filter((e) => e.targetPort === port.id).length < (port.minimum ?? 1))
            throw new Error(
              `Connect ${port.minimum ?? 1}${port.multiple ? " or more" : ""} ${port.accepts.join(" / ")} input${(port.minimum ?? 1) > 1 ? "s" : ""} to ${port.label}.`,
            );
        }
        const outputs = evaluateNode(node, incoming, datasets);
        for (const data of Object.values(outputs)) {
          const values =
            data.kind === "series"
              ? data.points.map((p) => p.value)
              : data.kind === "frame"
                ? data.rows.flatMap((r) => Object.values(r.values))
                : data.rows.flatMap((r) => Object.values(r));
          if (values.some((v) => typeof v === "number" && !Number.isFinite(v)))
            throw new Error("Non-finite calculation result. Rescale the input values.");
        }
        nodes[node.id] = { state: "ready", inputs: incoming, outputs };
      } catch (e) {
        nodes[node.id] = {
          state: "error",
          inputs: incoming,
          outputs: {},
          error: (e as Error).message,
        };
      }
    }
  }
  return { nodes, order };
}

export function parseProject(text: string): WorkbenchProject {
  if (text.length > 15_000_000) throw new Error("Project exceeds 15 MB.");
  const project = JSON.parse(text) as WorkbenchProject;
  if (
    project?.version !== 2 ||
    project.format !== "streamweave-project" ||
    !Array.isArray(project.datasets)
  )
    throw new Error(
      "Open a Streamweave version 2 project. Version 1 pipelines remain supported by the legacy core API.",
    );
  const issues = validateWorkbench(project.graph);
  if (issues.length) throw new Error(issues.join(" "));
  if (
    project.datasets.length > 12 ||
    project.datasets.reduce((n, d) => n + (d?.rows?.length ?? 0), 0) > 50_000
  )
    throw new Error("Project exceeds dataset limits.");
  const ids = new Set<string>();
  for (const d of project.datasets) {
    validateDataset(d);
    if (ids.has(d.id)) throw new Error("Duplicate dataset ID.");
    ids.add(d.id);
  }
  return project;
}
