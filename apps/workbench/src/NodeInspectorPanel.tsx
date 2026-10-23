import type { Dataset, NodeResult, WorkbenchNode } from "@streamweave/core";
import { Inspector } from "./Inspector";
import { removeEdges, type Graph, type GraphUpdate } from "./editorModel";
type InspectorProps = {
  node: WorkbenchNode;
  result?: NodeResult;
  datasets: Dataset[];
  graph: Graph;
  updateGraph: GraphUpdate;
  updateParam: (key: string, value: string | number) => void;
  rename: (title: string) => void;
  duplicate: () => void;
  remove: () => void;
  close: () => void;
  inspect: () => void;
};
export function NodeInspectorPanel({
  node,
  result,
  datasets,
  graph,
  updateGraph,
  updateParam,
  rename,
  duplicate,
  remove,
  close,
  inspect,
}: InspectorProps) {
  const connections = graph.edges.filter(
    (edge) => edge.target === node.id || edge.source === node.id,
  );
  const names = new Map(graph.nodes.map((node) => [node.id, node.title]));
  return (
    <div className="canvas-inspector nodrag nopan nowheel">
      <button className="inspector-close" aria-label="Close inspector" onClick={close}>
        ×
      </button>
      <Inspector
        node={node}
        result={result}
        datasets={datasets}
        update={updateParam}
        rename={rename}
        duplicate={duplicate}
        remove={remove}
      />
      <div className="connection-list">
        <span className="tiny-label">CONNECTIONS</span>
        {connections.map((edge) => (
          <div key={edge.id}>
            <span>
              {names.get(edge.source)} / {edge.sourcePort}
              <br />→ {names.get(edge.target)} / {edge.targetPort}
            </span>
            <button
              aria-label={`Disconnect ${edge.id}`}
              title="Disconnect"
              onClick={() => updateGraph((graph) => removeEdges(graph, new Set([edge.id])))}
            >
              ×
            </button>
          </div>
        ))}
        <button className="text-button" onClick={inspect}>
          Open module results ↗
        </button>
      </div>
    </div>
  );
}
