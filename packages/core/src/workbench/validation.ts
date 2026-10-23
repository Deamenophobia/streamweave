import { WORKBENCH_MODULES } from "./registry.js";
import type { WorkbenchGraph, WorkbenchEdge } from "./contracts.js";

const goodId = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(s) &&
  !["constructor", "prototype"].includes(s);

export function workbenchConnectionError(
  graph: WorkbenchGraph,
  edge: Omit<WorkbenchEdge, "id">,
): string | null {
  if (graph.edges.length >= 120) return "This workspace supports up to 120 connections.";
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
