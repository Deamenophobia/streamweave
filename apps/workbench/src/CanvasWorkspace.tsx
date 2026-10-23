import { useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { WORKBENCH_MODULES, type WorkbenchProject } from "@streamweave/core";
import { CanvasTools, DatasetDrawer, NodeInspectorPanel, ProjectToolbar } from "./CanvasPanels";
import type { ProjectActions } from "./projectFiles";
import { moduleIcons, removeNodes, sourceDraft } from "./editorModel";
import { nodeTypes, type VisualNode } from "./ModuleNode";
import { NodePicker } from "./NodePicker";
import { useCanvasInsertion, type CanvasInsertion } from "./useCanvasInsertion";
import { useGraphEditing } from "./useGraphEditing";
import { type Execution } from "./useGraphRun";
import { type ProjectHistory } from "./useProjectHistory";
import { type Inspection } from "./ResultsPanel";

type Props = {
  history: ProjectHistory;
  execution: Execution;
  selected: string | null;
  select: (id: string | null) => void;
  inspect: (inspection: Inspection) => void;
  load: (project: WorkbenchProject) => void;
  run: () => void;
  files: ProjectActions;
  notify: (message: string) => void;
};

const fitViewOptions = {
  padding: { top: "80px", bottom: "44px", left: "50px", right: "50px" },
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
  load,
  run,
  files,
  notify,
}: Props) {
  const { project } = history;
  const { graph, datasets } = project;
  const [dataOpen, setDataOpen] = useState(false);
  const editor = useGraphEditing(history, execution, selected, notify);
  const insertion = useCanvasInsertion({
    project,
    updateGraph: editor.updateGraph,
    select,
    notify,
    undo: history.undo,
    redo: history.redo,
  });
  const { canvas, picker, placement } = insertion;
  const selectedNode = graph.nodes.find((node) => node.id === selected);
  const failures = Object.values(execution.run?.nodes ?? {}).filter(
    (result) => result.state !== "ready",
  ).length;
  const connectionSource = graph.nodes.find((node) => node.id === picker?.from?.source);
  let status = `${failures ? "!" : "✓"} ${graph.nodes.length} modules · ${graph.edges.length} connections · ${failures ? `${failures} need attention` : "all branches ready"}`;
  if (execution.error) status = execution.error;
  if (execution.busy) status = "◌ Computing graph…";

  return (
    <section className="canvas-section" aria-label="Calculation canvas">
      <ProjectToolbar
        name={graph.name}
        rename={(name) => editor.updateGraph((graph) => ({ ...graph, name }))}
        undo={insertion.undo}
        redo={insertion.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        busy={execution.busy}
        run={run}
        files={files}
      />
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
        <CanvasTools
          dataOpen={dataOpen}
          datasetCount={datasets.length}
          add={() => {
            setDataOpen(false);
            insertion.showPicker();
          }}
          toggleData={() => {
            setDataOpen((open) => !open);
            insertion.cancel();
          }}
          load={load}
        />
        {dataOpen && (
          <DatasetDrawer
            datasets={datasets}
            inspect={(id) => inspect({ kind: "dataset", id })}
            place={(dataset) => {
              setDataOpen(false);
              insertion.beginPlacement(sourceDraft(dataset));
            }}
            close={() => setDataOpen(false)}
            importFiles={files.import}
          />
        )}
        {!graph.nodes.length && !picker && !placement && (
          <div className="canvas-empty">
            <strong>A canvas for your calculations.</strong>
            <p>Right-click to add a module, or open Data to import a source.</p>
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
            inspect={() => inspect({ kind: "node", id: selectedNode.id })}
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
      <div
        className={`pipeline-status ${execution.error || failures ? "invalid" : ""}`}
        role="status"
      >
        <span>{status}</span>
        <span>{datasets.length} DATA SOURCES</span>
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
