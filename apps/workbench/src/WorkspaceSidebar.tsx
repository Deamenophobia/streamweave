import { moduleIcons } from "./modulePresentation";
import { useState } from "react";
import { WORKBENCH_MODULES, type WorkbenchKind, type WorkbenchProject } from "@streamweave/core";
import { sourceDraft, type ModuleDraft } from "./editorModel";
import type { WorkspaceRoute } from "./workspaceNavigation";
import type { Execution } from "./execution/contracts";

type Props = {
  route: WorkspaceRoute;
  project: WorkbenchProject;
  execution: Execution;
  navigate: (route: WorkspaceRoute) => void;
  place: (draft: ModuleDraft) => void;
};

function ModulePalette({ place }: Pick<Props, "place">) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WorkbenchKind | null>(null);
  const kinds = (Object.keys(WORKBENCH_MODULES) as WorkbenchKind[]).filter((kind) => {
    const spec = WORKBENCH_MODULES[kind];
    return `${spec.title} ${spec.category} ${spec.description}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  return (
    <>
      <input
        className="sidebar-search"
        aria-label="Filter module library"
        placeholder="Find a module…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="sidebar-hint">Drag to place · Click for details</p>
      <div className="sidebar-scroll">
        {["Data", "Process", "Analyze", "Output"].map((category) => {
          const items = kinds.filter((kind) => WORKBENCH_MODULES[kind].category === category);
          if (!items.length) return null;
          return (
            <section className="palette-category" key={category}>
              <h3>{category}</h3>
              {items.map((kind) => (
                <button
                  className={`palette-item ${selected === kind ? "active" : ""}`}
                  key={kind}
                  draggable
                  aria-pressed={selected === kind}
                  onClick={() => setSelected(kind)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/streamweave-module", kind);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <span>{moduleIcons[kind]}</span>
                  {WORKBENCH_MODULES[kind].title}
                  <small>⠿</small>
                </button>
              ))}
            </section>
          );
        })}
        {!kinds.length && <p className="sidebar-hint">No matching modules.</p>}
      </div>
      {selected && (
        <div className="palette-detail">
          <div>
            <strong>{WORKBENCH_MODULES[selected].title}</strong>
            <button aria-label="Close module details" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <p>{WORKBENCH_MODULES[selected].description}</p>
          <button className="primary-action" onClick={() => place({ type: selected })}>
            Place module ↗
          </button>
        </div>
      )}
    </>
  );
}

function SourceList({ project, route, navigate, place }: Omit<Props, "execution">) {
  const activeId = route.id ?? project.datasets[0]?.id;
  return (
    <div className="sidebar-scroll source-list">
      {!project.datasets.length && (
        <p className="sidebar-hint">No sources yet. Import a file in Datasets.</p>
      )}
      {project.datasets.map((dataset) => (
        <div className="sidebar-source" key={dataset.id}>
          <button
            className={route.page === "data" && activeId === dataset.id ? "active" : ""}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/streamweave-dataset", dataset.id);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => navigate({ page: "data", id: dataset.id })}
            title={dataset.name}
          >
            <span>▤</span>
            <div>
              {dataset.name}
              <small>
                {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns
              </small>
            </div>
          </button>
          {route.page === "canvas" && (
            <button
              className="source-place"
              aria-label={`Place source ${dataset.name}`}
              onClick={() => place(sourceDraft(dataset))}
            >
              Place source ↗
            </button>
          )}
        </div>
      ))}
      {route.page === "canvas" && (
        <button className="sidebar-action" onClick={() => navigate({ page: "data" })}>
          Manage datasets ↗
        </button>
      )}
    </div>
  );
}

function ResultList({ project, execution, route, navigate }: Omit<Props, "place">) {
  const outputs = project.graph.nodes.filter(
    (node) => WORKBENCH_MODULES[node.type].category === "Output",
  );
  const intermediates = project.graph.nodes.filter(
    (node) => WORKBENCH_MODULES[node.type].category !== "Output",
  );
  const activeId = route.id ?? outputs[0]?.id ?? intermediates[0]?.id;
  return (
    <div className="sidebar-scroll result-list">
      {[
        { title: "Outputs", nodes: outputs },
        { title: "Intermediate data", nodes: intermediates },
      ].map((group) => (
        <section className="palette-category" key={group.title}>
          <h3>{group.title}</h3>
          {!group.nodes.length && (
            <p className="sidebar-hint">No {group.title.toLowerCase()} yet.</p>
          )}
          {group.nodes.map((node) => (
            <button
              className={`result-link ${activeId === node.id ? "active" : ""}`}
              key={node.id}
              onClick={() => navigate({ page: "results", id: node.id })}
              title={node.title}
            >
              <span>{moduleIcons[node.type]}</span>
              <div>
                {node.title}
                <small>{WORKBENCH_MODULES[node.type].title}</small>
              </div>
              <i className={`node-state ${execution.run?.nodes[node.id]?.state ?? "waiting"}`} />
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

export function WorkspaceSidebar(props: Props) {
  const { route, navigate, project, place } = props;
  const [canvasTab, setCanvasTab] = useState<"modules" | "sources">("modules");
  const outputCount = project.graph.nodes.filter(
    (node) => WORKBENCH_MODULES[node.type].category === "Output",
  ).length;
  const pages = [
    { page: "canvas", title: "Canvas", icon: "◇", count: project.graph.nodes.length },
    { page: "data", title: "Datasets", icon: "▤", count: project.datasets.length },
    { page: "results", title: "Results", icon: "⌁", count: outputCount },
  ] as const;
  return (
    <aside className="workspace-sidebar" aria-label="Workspace sidebar">
      <nav className="workspace-nav" aria-label="Workspace views">
        <span className="tiny-label">WORKSPACE</span>
        {pages.map((item) => (
          <button
            key={item.page}
            aria-current={route.page === item.page ? "page" : undefined}
            onClick={() => navigate({ page: item.page })}
          >
            <span>{item.icon}</span>
            {item.title}
            <small>{item.count}</small>
          </button>
        ))}
      </nav>
      {route.page === "canvas" && (
        <>
          <div className="sidebar-tabs" role="tablist" aria-label="Canvas library">
            <button
              role="tab"
              aria-selected={canvasTab === "modules"}
              onClick={() => setCanvasTab("modules")}
            >
              Modules
            </button>
            <button
              role="tab"
              aria-selected={canvasTab === "sources"}
              onClick={() => setCanvasTab("sources")}
            >
              Sources <span>{project.datasets.length}</span>
            </button>
          </div>
          {canvasTab === "modules" ? <ModulePalette place={place} /> : <SourceList {...props} />}
        </>
      )}
      {route.page === "data" && (
        <>
          <div className="sidebar-section-title">
            PROJECT DATA <span>{project.datasets.length}/12</span>
          </div>
          <SourceList {...props} />
        </>
      )}
      {route.page === "results" && <ResultList {...props} />}
      <a
        className="sidebar-repository"
        href="https://gitlab.com/Deamenophobia/streamweave"
        target="_blank"
        rel="noreferrer"
      >
        Streamweave 0.2 <span>Repository ↗</span>
      </a>
    </aside>
  );
}
