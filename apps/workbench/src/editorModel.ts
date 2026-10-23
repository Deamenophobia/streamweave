import {
  WORKBENCH_MODULES,
  makeNode,
  workbenchConnectionError,
  type Dataset,
  type WorkbenchKind,
  type WorkbenchNode,
  type WorkbenchProject,
} from "@streamweave/core";

export type Graph = WorkbenchProject["graph"];
export type Point = { x: number; y: number };
export type ConnectionOrigin = { source: string; sourcePort: string };
export type ModuleDraft = { type: WorkbenchKind; params?: WorkbenchNode["params"]; title?: string };
export type GraphUpdate = (update: (graph: Graph) => Graph, record?: boolean) => void;

export const moduleIcons: Record<WorkbenchKind, string> = {
  source: "▤",
  field: "↳",
  filter: "≡",
  align: "⋈",
  transform: "Δ",
  scale: "×",
  smooth: "∿",
  rolling: "◷",
  arithmetic: "±",
  correlation: "ρ",
  regression: "ƒ",
  pressure: "⇅",
  chart: "⌁",
  table: "▦",
  export: "↓",
};

export function firstNumericColumn(dataset?: Dataset) {
  return (
    dataset?.columns.find(
      (column) =>
        column.type === "number" && !["timestampMs", "availableAtMs"].includes(column.key),
    )?.key ?? ""
  );
}

export function sourceDraft(dataset: Dataset): ModuleDraft {
  return {
    type: "source",
    title: dataset.name.slice(0, 100),
    params: { datasetId: dataset.id, column: firstNumericColumn(dataset) },
  };
}

function compatibleInput(graph: Graph, kind: WorkbenchKind, origin: ConnectionOrigin) {
  const source = graph.nodes.find((node) => node.id === origin.source);
  const output =
    source && WORKBENCH_MODULES[source.type].outputs.find((port) => port.id === origin.sourcePort);
  if (!output) return undefined;
  return WORKBENCH_MODULES[kind].inputs.find((input) =>
    input.accepts.some((type) => output.accepts.includes(type)),
  );
}

export function compatibleKinds(graph: Graph, origin?: ConnectionOrigin): WorkbenchKind[] {
  const kinds = Object.keys(WORKBENCH_MODULES) as WorkbenchKind[];
  return origin ? kinds.filter((kind) => compatibleInput(graph, kind, origin)) : kinds;
}

// Add a module and its optional incoming wire as one immutable edit / undo step.
export function insertModule(
  project: WorkbenchProject,
  draft: ModuleDraft,
  position: Point,
  nodeId: string,
  edgeId: string,
  origin?: ConnectionOrigin,
): Graph {
  const { graph, datasets } = project;
  if (graph.nodes.length >= 50) throw new Error("This workspace supports up to 50 modules.");
  const node = makeNode(nodeId, draft.type, position.x, position.y, draft.params, draft.title);
  if (node.type === "source" && !node.params.datasetId && datasets[0]) {
    node.params = { ...node.params, ...sourceDraft(datasets[0]).params };
  }
  const next = { ...graph, nodes: [...graph.nodes, node] };
  if (!origin) return next;
  const input = compatibleInput(graph, draft.type, origin);
  if (!input) throw new Error("This module cannot accept the selected output.");
  const edge = { id: edgeId, ...origin, target: nodeId, targetPort: input.id };
  const reason = workbenchConnectionError(next, edge);
  if (reason) throw new Error(reason);
  return { ...next, edges: [...graph.edges, edge] };
}

export function removeNodes(graph: Graph, ids: Set<string>): Graph {
  if (!graph.nodes.some((node) => ids.has(node.id))) return graph;
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => !ids.has(node.id)),
    edges: graph.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
  };
}

export function removeEdges(graph: Graph, ids: Set<string>): Graph {
  if (!graph.edges.some((edge) => ids.has(edge.id))) return graph;
  return { ...graph, edges: graph.edges.filter((edge) => !ids.has(edge.id)) };
}

export function deleteElements(
  graph: Graph,
  nodes: { id: string }[],
  edges: { id: string }[],
): Graph {
  const remaining = removeNodes(graph, new Set(nodes.map((node) => node.id)));
  return removeEdges(remaining, new Set(edges.map((edge) => edge.id)));
}

export function moduleDetail(node: WorkbenchNode, datasets: Dataset[]) {
  switch (node.type) {
    case "source":
      return (
        datasets.find((dataset) => dataset.id === node.params.datasetId)?.name ?? "Choose dataset"
      );
    case "align":
      return String(node.params.mode);
    case "transform":
    case "rolling":
    case "arithmetic":
      return String(node.params.operation);
    default:
      return WORKBENCH_MODULES[node.type].title;
  }
}
