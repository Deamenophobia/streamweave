import type { WorkbenchGraph, WorkbenchProject } from "@streamweave/core";

/** Workspace names and positions are editor metadata, not calculation inputs. */
export function calculationGraph(graph: WorkbenchGraph): WorkbenchGraph {
  return {
    version: graph.version,
    name: "Calculation",
    nodes: graph.nodes.map(({ id, type, title, params }) => ({
      id,
      type,
      title,
      params,
      position: { x: 0, y: 0 },
    })),
    edges: graph.edges,
  };
}

export function calculationKey(project: WorkbenchProject): string {
  // Titles still affect pressure output labels and blocked-node diagnostics.
  return JSON.stringify(calculationGraph(project.graph));
}

export function calculationRequest(project: WorkbenchProject): WorkbenchProject {
  return { ...project, graph: calculationGraph(project.graph) };
}
