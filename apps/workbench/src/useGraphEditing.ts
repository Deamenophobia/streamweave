import { moduleDetail } from "./modulePresentation";
import { useCallback, useMemo, useState } from "react";
import { type Connection, type Edge, type EdgeChange, type NodeChange } from "@xyflow/react";
import { workbenchConnectionError } from "@streamweave/core";
import {
  firstNumericColumn,
  deleteElements,
  removeEdges,
  removeNodes,
  type GraphUpdate,
  type Point,
} from "./editorModel";
import { createId } from "./platform/ids";
import type { VisualNode } from "./ModuleNode";
import type { ProjectHistory } from "./documents/useProjectHistory";
import type { Execution } from "./execution/contracts";

export function useGraphEditing(
  history: ProjectHistory,
  execution: Execution,
  selected: string | null,
  notify: (message: string) => void,
) {
  const { project, setProject } = history;
  const { graph, datasets } = project;
  const [activeEdges, setActiveEdges] = useState<string[]>([]);
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});

  const updateGraph = useCallback<GraphUpdate>(
    (update, record = true) => {
      setProject((previous) => {
        const graph = update(previous.graph);
        return graph === previous.graph ? previous : { ...previous, graph };
      }, record);
    },
    [setProject],
  );

  const nodes = useMemo<VisualNode[]>(
    () =>
      graph.nodes.map((node) => {
        const result = execution.run?.nodes[node.id];
        return {
          id: node.id,
          type: "module",
          position: node.position,
          width: 184,
          height: 134,
          measured: measurements[node.id],
          selected: selected === node.id,
          data: {
            module: node,
            detail: result?.error ?? moduleDetail(node, datasets),
            state: execution.busy ? "computing" : (result?.state ?? "waiting"),
          },
        };
      }),
    [graph.nodes, selected, execution.run, execution.busy, datasets, measurements],
  );

  const edges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        sourceHandle: edge.sourcePort,
        targetHandle: edge.targetPort,
        type: "smoothstep",
        selected: activeEdges.includes(edge.id),
      })),
    [graph.edges, activeEdges],
  );

  function connectionError(connection: Connection | Edge) {
    return workbenchConnectionError(graph, {
      source: connection.source,
      sourcePort: connection.sourceHandle ?? "",
      target: connection.target,
      targetPort: connection.targetHandle ?? "",
    });
  }

  function connect(connection: Connection) {
    const reason = connectionError(connection);
    if (reason) return notify(reason);
    const edge = {
      id: createId("edge"),
      source: connection.source,
      sourcePort: connection.sourceHandle ?? "",
      target: connection.target,
      targetPort: connection.targetHandle ?? "",
    };
    updateGraph((graph) => ({ ...graph, edges: [...graph.edges, edge] }));
    notify("");
  }

  function changeNodes(changes: NodeChange<VisualNode>[]) {
    const resized = changes.filter((change) => change.type === "dimensions");
    if (resized.length) {
      setMeasurements((previous) => {
        const current = new Set(graph.nodes.map((node) => node.id));
        const next = Object.fromEntries(Object.entries(previous).filter(([id]) => current.has(id)));
        for (const change of resized) {
          if (change.dimensions) next[change.id] = change.dimensions;
        }
        return next;
      });
    }
    const removed = new Set(
      changes.filter((change) => change.type === "remove").map((change) => change.id),
    );
    if (removed.size) {
      updateGraph((graph) => removeNodes(graph, removed));
      return;
    }
    const positions = new Map<string, Point>();
    for (const change of changes) {
      if (change.type === "position" && change.position) positions.set(change.id, change.position);
    }
    if (!positions.size) return;
    updateGraph(
      (graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node,
        ),
      }),
      false,
    );
  }

  async function beforeDelete({ nodes, edges }: { nodes: VisualNode[]; edges: Edge[] }) {
    // React Flow otherwise emits edge and node removals separately. Own the transaction so undo
    // restores the entire selection and its wires together.
    updateGraph((graph) => deleteElements(graph, nodes, edges));
    return false;
  }

  function changeEdges(changes: EdgeChange[]) {
    const removed = new Set(
      changes.filter((change) => change.type === "remove").map((change) => change.id),
    );
    if (removed.size) updateGraph((graph) => removeEdges(graph, removed));
    const selections = changes.filter((change) => change.type === "select");
    if (!selections.length) return;
    setActiveEdges((previous) => {
      const next = new Set(previous);
      for (const change of selections) {
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      }
      return [...next];
    });
  }

  function updateParam(key: string, value: string | number) {
    updateGraph((graph) => ({
      ...graph,
      nodes: graph.nodes.map((node) => {
        if (node.id !== selected) return node;
        const params = { ...node.params, [key]: value };
        if (key === "datasetId")
          params.column = firstNumericColumn(datasets.find((dataset) => dataset.id === value));
        return { ...node, params };
      }),
    }));
  }

  function rename(title: string) {
    updateGraph((graph) => ({
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === selected ? { ...node, title } : node)),
    }));
  }

  return {
    nodes,
    edges,
    updateGraph,
    connect,
    connectionError,
    changeNodes,
    beforeDelete,
    changeEdges,
    updateParam,
    rename,
  };
}
