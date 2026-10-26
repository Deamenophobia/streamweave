import { moduleIcons } from "./modulePresentation";
import { useEffect, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { WORKBENCH_MODULES } from "@streamweave/core";
import { NodeInspectorPanel } from "./NodeInspectorPanel";
import { removeNodes, type ModuleDraft } from "./editorModel";
import { nodeTypes, type VisualNode } from "./ModuleNode";
import { NodePicker } from "./NodePicker";
import { useCanvasInsertion, type CanvasInsertion } from "./useCanvasInsertion";
import { useGraphEditing } from "./useGraphEditing";
import { type Execution } from "./execution/contracts";
import { type ProjectHistory } from "./documents/useProjectHistory";

type Props = {
  history: ProjectHistory;
  execution: Execution;
  selected: string | null;
  select: (id: string | null) => void;
  inspect: (id: string) => void;
  active: boolean;
  requested?: ModuleDraft;
  focusRequest?: { id: string };
  cancelVersion: number;
  notify: (message: string) => void;
};

const fitViewOptions = {
  padding: { top: "45px", bottom: "45px", left: "40px", right: "40px" },
} as const;

function PlacementOverlay({ insertion }: { insertion: CanvasInsertion }) {
  const { placement, ghost, zoom, place, cancel } = insertion;
  if (!placement) return null;
  const spec = WORKBENCH_MODULES[placement.type];
  const title = placement.title ?? spec.title;
  return (
    <>
      <div
        className="placement-surface"
        aria-label={`Place ${title} on canvas`}
        onClick={(event) => place({ x: event.clientX, y: event.clientY })}
        onContextMenu={(event) => {
          event.preventDefault();
          cancel();
        }}
      />
      <div className="placement-banner" role="status">
        <strong>{title}</strong>
        <span>Click the canvas to place · Esc to cancel</span>
        <button onClick={cancel}>Cancel</button>
      </div>
      {ghost && (
        <div
          className={`placement-ghost category-${spec.category.toLowerCase()}`}
          style={{ left: ghost.x, top: ghost.y, width: 184 * zoom, height: 134 * zoom }}
        >
          <span>{moduleIcons[placement.type]}</span>
          {title}
        </div>
      )}
    </>
  );
}

function Workspace({
  history,
  execution,
  selected,
  select,
  inspect,
  active,
  requested,
  focusRequest,
  cancelVersion,
  notify,
}: Props) {
  const { project } = history;
  const { graph, datasets } = project;
  const { setCenter, getZoom } = useReactFlow();
  const focusedRequest = useRef<{ id: string } | undefined>(undefined);
  useEffect(() => {
    if (!active || !focusRequest || focusedRequest.current === focusRequest) return;
    const node = graph.nodes.find((node) => node.id === focusRequest.id);
    if (!node) return;
    focusedRequest.current = focusRequest;
    void setCenter(node.position.x + 92, node.position.y + 67, {
      zoom: Math.max(0.85, getZoom()),
      duration: 180,
    });
  }, [active, focusRequest, graph.nodes, setCenter, getZoom]);
  const editor = useGraphEditing(history, execution, selected, notify);
  const insertion = useCanvasInsertion({
    project,
    updateGraph: editor.updateGraph,
    select,
    notify,
    undo: history.undo,
    redo: history.redo,
    active,
    requested,
    cancelVersion,
  });
  const { canvas, picker, placement } = insertion;
  const selectedNode = graph.nodes.find((node) => node.id === selected);
  const connectionSource = graph.nodes.find((node) => node.id === picker?.from?.source);

  return (
    <section className="canvas-section" aria-label="Calculation canvas">
      <header className="canvas-heading">
        <div>
          <h1>Canvas</h1>
          <span>
            {graph.nodes.length} modules · {graph.edges.length} connections
          </span>
        </div>
        <div className="toolbar">
          <button disabled={!history.canUndo} onClick={insertion.undo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button disabled={!history.canRedo} onClick={insertion.redo} title="Redo (Ctrl+Shift+Z)">
            ↷ Redo
          </button>
          <button className="secondary-action" onClick={() => insertion.showPicker()}>
            ＋ Add module
          </button>
        </div>
      </header>
      <div
        ref={canvas}
        className={`workbench-canvas ${placement ? "is-placing" : ""}`}
        tabIndex={0}
        aria-label="Canvas workspace"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={insertion.drop}
        onPointerMove={insertion.movePointer}
        onPointerLeave={insertion.leavePointer}
        onKeyDown={insertion.keyDown}
      >
        <ReactFlow<VisualNode>
          nodes={editor.nodes}
          edges={editor.edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            select(node.id);
            insertion.closePicker();
          }}
          onPaneClick={() => {
            select(null);
            insertion.closePicker();
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            insertion.showPicker({ x: event.clientX, y: event.clientY });
          }}
          onConnect={editor.connect}
          onConnectEnd={insertion.connectEnd}
          onNodeDragStart={history.checkpoint}
          onNodesChange={editor.changeNodes}
          onEdgesChange={editor.changeEdges}
          onBeforeDelete={editor.beforeDelete}
          onEdgeClick={() => select(null)}
          isValidConnection={(connection) => editor.connectionError(connection) === null}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.2}
          maxZoom={1.6}
          colorMode="dark"
          deleteKeyCode={picker || placement ? null : ["Backspace", "Delete"]}
        >
          <Background variant={BackgroundVariant.Dots} color="#34413e" gap={22} size={1} />
          <Controls showInteractive={false} fitViewOptions={fitViewOptions} />
        </ReactFlow>
        {!graph.nodes.length && !picker && !placement && (
          <div className="canvas-empty">
            <strong>A canvas for your calculations.</strong>
            <p>Drag a module from the library, or open Datasets to import a source.</p>
            <button onClick={() => insertion.showPicker()}>＋ Add your first module</button>
          </div>
        )}
        <span className="canvas-hint">
          Right-click or Shift+A to add · Drag a wire into empty space to continue
        </span>
        {selectedNode && !placement && !picker && (
          <NodeInspectorPanel
            node={selectedNode}
            result={execution.run?.nodes[selectedNode.id]}
            datasets={datasets}
            graph={graph}
            updateGraph={editor.updateGraph}
            updateParam={editor.updateParam}
            rename={editor.rename}
            duplicate={() =>
              insertion.beginPlacement({
                type: selectedNode.type,
                params: { ...selectedNode.params },
                title: `${selectedNode.title} copy`.slice(0, 100),
              })
            }
            remove={() => {
              editor.updateGraph((graph) => removeNodes(graph, new Set([selectedNode.id])));
              select(null);
            }}
            close={() => select(null)}
            inspect={() => inspect(selectedNode.id)}
          />
        )}
        <PlacementOverlay insertion={insertion} />
        {picker && (
          <NodePicker
            x={picker.screen.x}
            y={picker.screen.y}
            height={picker.height}
            kinds={insertion.kinds}
            connectionLabel={
              picker.from ? `${connectionSource?.title} / ${picker.from.sourcePort}` : undefined
            }
            close={insertion.closePicker}
            choose={insertion.choose}
          />
        )}
      </div>
    </section>
  );
}

export function CanvasWorkspace(props: Props) {
  return (
    <ReactFlowProvider>
      <Workspace {...props} />
    </ReactFlowProvider>
  );
}
