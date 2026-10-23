import { useRef, useState } from "react";
import {
  emptyProject,
  multiSourceExample,
  pressureExample,
  type Dataset,
  type NodeResult,
  type WorkbenchNode,
  type WorkbenchProject,
} from "@streamweave/core";
import { Inspector } from "./Inspector";
import { removeEdges, type Graph, type GraphUpdate } from "./editorModel";

import type { ProjectActions } from "./projectFiles";

type ToolbarProps = {
  name: string;
  rename: (name: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  run: () => void;
  files: ProjectActions;
};

export function ProjectToolbar({
  name,
  rename,
  undo,
  redo,
  canUndo,
  canRedo,
  busy,
  run,
  files,
}: ToolbarProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="panel-header">
      <div>
        <span className="tiny-label">WORKSPACE</span>
        <input
          className="pipeline-name"
          aria-label="Project name"
          maxLength={120}
          value={name}
          onChange={(event) => rename(event.target.value)}
        />
      </div>
      <div className="toolbar">
        <button disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={undo}>
          ↶ Undo
        </button>
        <button disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" onClick={redo}>
          ↷ Redo
        </button>
        <span className="toolbar-divider" />
        <button onClick={files.save}>Save</button>
        <button onClick={() => input.current?.click()}>Open</button>
        <button onClick={files.download}>Download project</button>
        <button onClick={run} disabled={busy}>
          ↻ Run
        </button>
      </div>
      <input
        className="hidden"
        ref={input}
        type="file"
        accept=".json"
        aria-label="Open project file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void files.open(file);
        }}
      />
    </div>
  );
}

type ToolsProps = {
  dataOpen: boolean;
  datasetCount: number;
  add: () => void;
  toggleData: () => void;
  load: (project: WorkbenchProject) => void;
};
export function CanvasTools({ dataOpen, datasetCount, add, toggleData, load }: ToolsProps) {
  const examples = useRef<HTMLDetailsElement>(null);
  function choose(project: WorkbenchProject) {
    if (examples.current) examples.current.open = false;
    load(project);
  }
  return (
    <div className="canvas-tools">
      <button className="add-module-button" onClick={add}>
        ＋ Add module <kbd>⇧ A</kbd>
      </button>
      <button className={dataOpen ? "active" : ""} onClick={toggleData}>
        ▤ Data <span>{datasetCount}</span>
      </button>
      <details ref={examples} className="examples-menu">
        <summary>Examples ▾</summary>
        <div>
          <button onClick={() => choose(multiSourceExample())}>Two-source study</button>
          <button onClick={() => choose(pressureExample())}>Signed-event study</button>
          <button onClick={() => choose(emptyProject())}>Blank workspace</button>
        </div>
      </details>
    </div>
  );
}

type DataProps = {
  datasets: Dataset[];
  inspect: (id: string) => void;
  place: (dataset: Dataset) => void;
  close: () => void;
  importFiles: ProjectActions["import"];
};
export function DatasetDrawer({ datasets, inspect, place, close, importFiles }: DataProps) {
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  async function importSelected(files: File[]) {
    if (!files.length) return;
    setImporting(true);
    try {
      await importFiles(files);
    } finally {
      setImporting(false);
    }
  }
  return (
    <aside className="data-drawer nodrag nopan nowheel" aria-label="Project data">
      <div className="drawer-heading">
        <strong>
          Project data <span>{datasets.length}/12</span>
        </strong>
        <button aria-label="Close project data" onClick={close}>
          ×
        </button>
      </div>
      <p>Drag a dataset onto the canvas, or choose where to place its source.</p>
      <div className="dataset-list">
        {datasets.map((dataset) => (
          <div className="dataset-item" key={dataset.id}>
            <button
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/streamweave-dataset", dataset.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => inspect(dataset.id)}
              title="Inspect dataset"
            >
              <span>▤</span>
              <div>
                {dataset.name}
                <small>
                  {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns
                </small>
              </div>
            </button>
            <button
              className="place-source"
              aria-label={`Place source ${dataset.name}`}
              onClick={() => place(dataset)}
            >
              Place source ↗
            </button>
          </div>
        ))}
      </div>
      <button className="import-button" disabled={importing} onClick={() => input.current?.click()}>
        {importing ? "Importing…" : "＋ Import datasets"}
      </button>
      <small className="drawer-note">
        CSV / JSON / JSONL · Importing adds data to this project.
      </small>
      <input
        ref={input}
        className="hidden"
        type="file"
        multiple
        accept=".csv,.json,.jsonl"
        aria-label="Import datasets"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void importSelected(files);
        }}
      />
    </aside>
  );
}

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
          Inspect this module’s data ↓
        </button>
      </div>
    </div>
  );
}
