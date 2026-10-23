import { validateDataset, type Dataset } from "./data.js";
import type {
  NodeResult,
  WorkbenchEdge,
  WorkbenchGraph,
  WorkbenchNode,
  WorkbenchRun,
} from "./contracts.js";
import { runModule } from "./moduleDefinition.js";
import { WORKBENCH_MODULES } from "./registry.js";
import { validateWorkbench } from "./validation.js";

function evaluateNode(
  node: WorkbenchNode,
  edges: WorkbenchEdge[],
  results: Record<string, NodeResult>,
  titles: ReadonlyMap<string, string>,
  datasets: ReadonlyMap<string, Dataset>,
): NodeResult {
  const blocked = edges.find(
    (edge) =>
      results[edge.source]?.state !== "ready" || !results[edge.source]?.outputs[edge.sourcePort],
  );
  if (blocked)
    return {
      state: "blocked",
      inputs: [],
      outputs: {},
      error: `Waiting for ${titles.get(blocked.source)} / ${blocked.sourcePort}.`,
    };
  const inputs = edges.map((edge) => ({
    edge,
    data: results[edge.source]!.outputs[edge.sourcePort]!,
  }));
  try {
    const outputs = runModule(WORKBENCH_MODULES[node.type], { node, inputs, datasets });
    return { state: "ready", inputs, outputs };
  } catch (error) {
    return { state: "error", inputs, outputs: {}, error: (error as Error).message };
  }
}

/** Schedule a validated DAG without knowing any individual module's calculation. */
export function executeWorkbench(
  graph: WorkbenchGraph,
  sourceDatasets: readonly Dataset[],
): WorkbenchRun {
  const issues = validateWorkbench(graph);
  if (issues.length) throw new Error(issues.join(" "));
  if (
    sourceDatasets.length > 12 ||
    sourceDatasets.reduce((count, dataset) => count + (dataset?.rows?.length ?? 0), 0) > 50_000
  )
    throw new Error("Project supports at most 12 datasets and 50,000 total rows.");
  const datasets = new Map<string, Dataset>();
  for (const dataset of sourceDatasets) {
    validateDataset(dataset);
    if (datasets.has(dataset.id)) throw new Error("Dataset IDs must be unique.");
    datasets.set(dataset.id, dataset);
  }
  const nodes: Record<string, NodeResult> = Object.create(null);
  const order: string[] = [];
  const pending = new Set(graph.nodes.map((node) => node.id));
  const titles = new Map(graph.nodes.map((node) => [node.id, node.title]));
  const incoming = new Map(
    graph.nodes.map((node) => [node.id, graph.edges.filter((edge) => edge.target === node.id)]),
  );
  while (pending.size) {
    const ready = graph.nodes.filter(
      (node) =>
        pending.has(node.id) && incoming.get(node.id)!.every((edge) => !pending.has(edge.source)),
    );
    if (!ready.length) throw new Error("Graph contains a cycle.");
    for (const node of ready) {
      pending.delete(node.id);
      order.push(node.id);
      nodes[node.id] = evaluateNode(node, incoming.get(node.id)!, nodes, titles, datasets);
    }
  }
  return { nodes, order };
}
