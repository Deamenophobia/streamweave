import { useEffect, useState } from "react";
import type { WorkbenchProject } from "@streamweave/core";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { DatasetsView } from "./DatasetsView";
import { ResultsView } from "./ResultsView";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceStatus } from "./WorkspaceStatus";
import { sourceDraft, type ModuleDraft } from "./editorModel";
import { loadInitialProject } from "./projectFiles";
import { useGraphRun } from "./useGraphRun";
import { useProjectDocuments } from "./useProjectDocuments";
import { useProjectHistory } from "./useProjectHistory";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";

export function App() {
  const history = useProjectHistory(loadInitialProject);
  const { project, setProject } = history;
  const execution = useGraphRun(project);
  const navigation = useWorkspaceNavigation();
  const { route, navigate } = navigation;
  const [canvasVisited, setCanvasVisited] = useState(route.page === "canvas");
  useEffect(() => {
    if (route.page === "canvas") setCanvasVisited(true);
  }, [route.page]);
  const [selected, setSelected] = useState<string | null>(null);
  const [placement, setPlacement] = useState<ModuleDraft>();
  const [focusRequest, setFocusRequest] = useState<{ id: string }>();
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const [cancelVersion, setCancelVersion] = useState(0);

  function cancelEditing() {
    setPlacement(undefined);
    setCancelVersion((value) => value + 1);
  }
  function load(next: WorkbenchProject) {
    cancelEditing();
    setProject(next);
    setSelected(null);
    setFocusRequest(undefined);
    setNotice("");
    setVersion((value) => value + 1);
    navigation.reset();
  }
  function place(draft: ModuleDraft) {
    navigate({ page: "canvas" });
    setPlacement({ ...draft });
  }
  function configure(id: string) {
    cancelEditing();
    setSelected(id);
    setFocusRequest({ id });
    navigate({ page: "canvas" });
  }
  const { files, importing } = useProjectDocuments({
    history,
    version,
    load,
    imported: (id) => navigate({ page: "data", id }),
    notify: setNotice,
  });

  return (
    <div className="workspace-shell">
      <WorkspaceHeader
        name={project.graph.name}
        rename={(name) =>
          setProject((previous) => ({ ...previous, graph: { ...previous.graph, name } }))
        }
        files={files}
        load={load}
        undo={() => {
          cancelEditing();
          history.undo();
        }}
        redo={() => {
          cancelEditing();
          history.redo();
        }}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        busy={execution.busy}
        run={execution.rerun}
      />
      <WorkspaceSidebar
        route={route}
        project={project}
        execution={execution}
        navigate={navigate}
        place={place}
      />
      <main className="workspace-content">
        <div className="canvas-view" hidden={route.page !== "canvas"}>
          {(canvasVisited || route.page === "canvas") && (
            <CanvasWorkspace
              key={version}
              history={history}
              execution={execution}
              selected={selected}
              select={setSelected}
              inspect={(id) => navigate({ page: "results", id })}
              active={route.page === "canvas"}
              requested={placement}
              cancelVersion={cancelVersion}
              focusRequest={focusRequest}
              notify={setNotice}
            />
          )}
        </div>
        {route.page === "data" && (
          <DatasetsView
            datasets={project.datasets}
            id={route.id}
            importFiles={files.import}
            importing={importing}
            useSource={(dataset) => place(sourceDraft(dataset))}
          />
        )}
        {route.page === "results" && (
          <ResultsView
            project={project}
            execution={execution}
            id={route.id}
            configure={configure}
          />
        )}
      </main>
      <WorkspaceStatus project={project} execution={execution} review={configure} />
      {notice && (
        <div className="workspace-notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
