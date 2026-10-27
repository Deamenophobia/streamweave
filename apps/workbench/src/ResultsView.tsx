import { useState } from "react";
import {
  WORKBENCH_MODULES,
  type NodeResult,
  type WorkbenchNode,
  type WorkbenchProject,
} from "@streamweave/core";
import { DataView } from "./DataView";
import { csvExport, resultsExport, type NamedValue } from "./adapters/resultFormats";
import { downloadFile } from "./platform/browserFiles";
import type { Execution } from "./execution/contracts";

type ResultValue = NamedValue & { key: string };

function valuesFor(
  node: WorkbenchNode,
  result: NodeResult | undefined,
  project: WorkbenchProject,
): ResultValue[] {
  if (!result) return [];
  if (WORKBENCH_MODULES[node.type].category !== "Output") {
    return Object.entries(result.outputs).map(([label, data]) => ({ key: label, label, data }));
  }
  const names = new Map(project.graph.nodes.map((node) => [node.id, node.title]));
  return result.inputs.map(({ edge, data }) => ({
    key: edge.id,
    label: `${names.get(edge.source) ?? edge.source} / ${edge.sourcePort}`,
    data,
  }));
}

type Props = {
  project: WorkbenchProject;
  execution: Execution;
  id?: string;
  configure: (id: string) => void;
};

function ResultDocument({
  project,
  execution,
  node,
  configure,
}: Omit<Props, "id"> & { node: WorkbenchNode }) {
  const [port, setPort] = useState<string>();
  const [mode, setMode] = useState<"chart" | "table">(node.type === "chart" ? "chart" : "table");
  const result = execution.run?.nodes[node.id];
  const values = valuesFor(node, result, project);
  const value = values.find((value) => value.key === port) ?? values[0];
  const isOutput = WORKBENCH_MODULES[node.type].category === "Output";
  const canChart = value && value.data.kind !== "table";

  function content() {
    if (execution.busy) return <p className="empty-state">Computing this project…</p>;
    if (execution.error) return <p className="module-error">{execution.error}</p>;
    if (result?.state !== "ready")
      return (
        <div className="view-empty">
          <h2>This module needs attention</h2>
          <p>{result?.error ?? "Waiting for calculation."}</p>
          <button className="secondary-action" onClick={() => configure(node.id)}>
            Edit in canvas ↗
          </button>
        </div>
      );
    if (!value)
      return <p className="empty-state">No values to display. Connect an input in the canvas.</p>;
    return <DataView key={`${node.id}-${value.label}`} data={value.data} mode={mode} />;
  }

  return (
    <section className="document-view results-view" aria-label="Results view">
      <header className="view-heading">
        <div>
          <span className="tiny-label">RESULTS / {isOutput ? "OUTPUT" : "INTERMEDIATE DATA"}</span>
          <h1>{node.title}</h1>
          <p>
            {WORKBENCH_MODULES[node.type].title} · {values.length}{" "}
            {values.length === 1 ? "result" : "results"}
          </p>
        </div>
        <button className="secondary-action" onClick={() => configure(node.id)}>
          Edit in canvas ↗
        </button>
      </header>
      <div className="document-toolbar result-controls">
        <div className="view-tabs" role="tablist" aria-label="Result ports">
          {values.map((item) => (
            <button
              role="tab"
              key={item.key}
              aria-selected={item.key === value?.key}
              onClick={() => setPort(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="display-switch" aria-label="Result display">
          <button aria-pressed={mode === "table" || !canChart} onClick={() => setMode("table")}>
            Table
          </button>
          <button
            disabled={!canChart}
            aria-pressed={mode === "chart" && !!canChart}
            onClick={() => setMode("chart")}
          >
            Chart
          </button>
        </div>
      </div>
      <div className="result-document">{content()}</div>
      <footer className="result-downloads">
        <span>Values and quality states remain explicit.</span>
        <button
          disabled={!value || execution.busy}
          onClick={() => value && downloadFile(csvExport(`${node.id}-${value.key}`, value.data))}
        >
          Download CSV ↓
        </button>
        <button
          disabled={!values.length || execution.busy}
          onClick={() => downloadFile(resultsExport(project, node.id, values, execution.engine))}
        >
          Results + project JSON ↓
        </button>
      </footer>
    </section>
  );
}

export function ResultsView(props: Props) {
  const { project, id } = props;
  const fallback =
    project.graph.nodes.find((node) => WORKBENCH_MODULES[node.type].category === "Output") ??
    project.graph.nodes[0];
  const node = id ? project.graph.nodes.find((node) => node.id === id) : fallback;
  if (!node)
    return (
      <section className="document-view results-view" aria-label="Results view">
        <header className="view-heading">
          <div>
            <span className="tiny-label">RESULTS</span>
            <h1>Project results</h1>
          </div>
        </header>
        <div className="view-empty">
          <span>⌁</span>
          <h2>{id ? "Module unavailable" : "Your outputs will appear here"}</h2>
          <p>
            {id
              ? "Choose another result from the sidebar."
              : "Add a Chart, Table, or Export module to the canvas and connect its inputs."}
          </p>
        </div>
      </section>
    );
  return <ResultDocument key={node.id} {...props} node={node} />;
}
