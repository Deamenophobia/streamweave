import { useState } from "react";
import {
  WORKBENCH_MODULES,
  type Dataset,
  type NodeResult,
  type WorkbenchNode,
  type WorkbenchProject,
} from "@streamweave/core";
import { DataView } from "./DataView";
import { downloadCsv, downloadResults, type NamedValue } from "./projectFiles";
import type { Execution } from "./useGraphRun";

export type Inspection = { kind: "node" | "dataset"; id: string } | null;
type Props = {
  project: WorkbenchProject;
  execution: Execution;
  selected: string | null;
  inspection: Inspection;
  onInspect: (inspection: Inspection) => void;
  onSelect: (id: string) => void;
};

function inputValues(result?: NodeResult): NamedValue[] {
  return (
    result?.inputs.map(({ edge, data }) => ({
      label: `${edge.source} / ${edge.sourcePort}`,
      data,
    })) ?? []
  );
}

function inspectionValues(result: NodeResult): NamedValue[] {
  const outputs = Object.entries(result.outputs).map(([label, data]) => ({ label, data }));
  return outputs.length ? outputs : inputValues(result);
}

function ValuePreview({
  value,
  mode,
  filename,
}: {
  value: NamedValue;
  mode: "chart" | "table";
  filename: string;
}) {
  return (
    <div>
      <div className="result-tools">
        <span>{value.label}</span>
        <button onClick={() => downloadCsv(filename, value.data)}>CSV ↓</button>
      </div>
      <DataView data={value.data} mode={mode} />
    </div>
  );
}

function OutputCard({
  node,
  result,
  project,
  onSelect,
}: {
  node: WorkbenchNode;
  result?: NodeResult;
  project: WorkbenchProject;
  onSelect: (id: string) => void;
}) {
  const values = inputValues(result);
  return (
    <section className="output-card">
      <div className="panel-header">
        <div>
          <span className="tiny-label">
            {WORKBENCH_MODULES[node.type].title.toUpperCase()} OUTPUT
          </span>
          <h2>{node.title}</h2>
        </div>
        <button className="text-button" onClick={() => onSelect(node.id)}>
          Configure ↗
        </button>
      </div>
      {result?.state !== "ready" ? (
        <p className="module-error">{result?.error ?? "Waiting for calculation."}</p>
      ) : (
        <>
          {node.type === "export" && (
            <p className="result-note">
              CSV contains values and quality states. JSON also includes the complete graph,
              parameters, and source datasets for reproduction.
            </p>
          )}
          {values.map((value, index) => (
            <ValuePreview
              key={index}
              value={value}
              filename={`${node.id}-${index}`}
              mode={node.type === "chart" ? "chart" : "table"}
            />
          ))}
          <div className="output-foot">
            <button onClick={() => downloadResults(project, node.id, values)}>
              Results + project JSON ↓
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function InspectionContent({
  dataset,
  node,
  result,
  mode,
}: {
  dataset?: Dataset;
  node?: WorkbenchNode;
  result?: NodeResult;
  mode: "chart" | "table";
}) {
  if (dataset)
    return (
      <>
        <DataView data={dataset} />
        <div className="output-foot">
          <button onClick={() => downloadCsv(dataset.id, dataset)}>Download dataset CSV ↓</button>
        </div>
      </>
    );
  if (!node || result?.state !== "ready") {
    return (
      <p className="empty-state">
        {result?.error ?? "Click any canvas module to inspect its data."}
      </p>
    );
  }
  return inspectionValues(result).map((value) => (
    <ValuePreview
      key={value.label}
      value={value}
      filename={`${node.id}-${value.label}`}
      mode={mode}
    />
  ));
}

export function ResultsPanel({
  project,
  execution,
  selected,
  inspection,
  onInspect,
  onSelect,
}: Props) {
  const [mode, setMode] = useState<"chart" | "table">("table");
  const outputs = project.graph.nodes.filter(
    (node) => WORKBENCH_MODULES[node.type].category === "Output",
  );
  const node =
    inspection?.kind === "node"
      ? project.graph.nodes.find((node) => node.id === inspection.id)
      : undefined;
  const dataset =
    inspection?.kind === "dataset"
      ? project.datasets.find((dataset) => dataset.id === inspection.id)
      : undefined;
  const result = node && execution.run?.nodes[node.id];

  function content() {
    if (execution.busy) return <div className="empty-state">Computing…</div>;
    if (execution.error)
      return <div className="empty-state">Resolve the graph error to inspect results.</div>;
    if (!inspection)
      return (
        <div className="output-grid">
          {!outputs.length && (
            <div className="empty-state">
              Add a Chart, Table, or Export module and connect its input.
            </div>
          )}
          {outputs.map((node) => (
            <OutputCard
              key={node.id}
              node={node}
              result={execution.run?.nodes[node.id]}
              project={project}
              onSelect={onSelect}
            />
          ))}
        </div>
      );
    return (
      <section className="output-card inspection">
        <div className="panel-header">
          <div>
            <span className="tiny-label">INTERMEDIATE DATA</span>
            <h2>{dataset?.name ?? node?.title ?? "Select a module"}</h2>
          </div>
          {!dataset && (
            <div className="toolbar">
              <button aria-pressed={mode === "table"} onClick={() => setMode("table")}>
                Table
              </button>
              <button aria-pressed={mode === "chart"} onClick={() => setMode("chart")}>
                Chart
              </button>
            </div>
          )}
        </div>
        <InspectionContent dataset={dataset} node={node} result={result} mode={mode} />
      </section>
    );
  }

  return (
    <>
      <div className="results-tabs">
        <button className={!inspection ? "active" : ""} onClick={() => onInspect(null)}>
          Outputs <span>{outputs.length}</span>
        </button>
        <button
          className={inspection ? "active" : ""}
          onClick={() => onInspect(inspection ?? { kind: "node", id: selected ?? "" })}
        >
          {dataset ? "Inspect dataset" : "Inspect module"}
        </button>
        <span>Values stay separate · units stay visible</span>
      </div>
      {content()}
    </>
  );
}
