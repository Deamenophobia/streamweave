import { useEffect, useRef, useState } from "react";
import type { WorkbenchProject } from "@streamweave/core";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { ResultsPanel, type Inspection } from "./ResultsPanel";
import {
  appendDatasets,
  downloadProject,
  loadInitialProject,
  readDatasets,
  readProject,
  saveProject,
  type ProjectActions,
} from "./projectFiles";
import { useGraphRun } from "./useGraphRun";
import { useProjectHistory } from "./useProjectHistory";

export function App() {
  const history = useProjectHistory(loadInitialProject);
  const { project, setProject } = history;
  const execution = useGraphRun(project);
  const [selected, setSelected] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection>(null);
  const [notice, setNotice] = useState("");
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const documentVersion = useRef(0);
  const latestProject = useRef(project);
  useEffect(() => {
    latestProject.current = project;
  }, [project]);

  function select(id: string | null) {
    setSelected(id);
    if (inspection?.kind === "node") setInspection({ kind: "node", id: id ?? "" });
  }

  function load(next: WorkbenchProject) {
    documentVersion.current += 1;
    setProject(next);
    setSelected(null);
    setInspection(null);
    setNotice("");
    setWorkspaceVersion((version) => version + 1);
  }

  const files: ProjectActions = {
    async import(files) {
      const version = documentVersion.current;
      try {
        const datasets = await readDatasets(files);
        if (version !== documentVersion.current) {
          setNotice("Import cancelled because a different workspace was opened.");
          return;
        }
        setProject(appendDatasets(latestProject.current, datasets));
        setNotice(
          `Imported ${datasets.length} dataset${datasets.length === 1 ? "" : "s"}. Drag a dataset onto the canvas or choose Place source.`,
        );
      } catch (error) {
        setNotice(`Import failed: ${(error as Error).message}`);
      }
    },
    async open(file) {
      try {
        load(await readProject(file));
        setNotice(`Opened ${file.name}.`);
      } catch (error) {
        setNotice(`Could not open project: ${(error as Error).message}`);
      }
    },
    save() {
      try {
        saveProject(project);
        setNotice("Project and datasets saved in this browser.");
      } catch (error) {
        setNotice(
          `Save failed: ${(error as Error).message} Use Download project for larger workspaces.`,
        );
      }
    },
    download() {
      try {
        downloadProject(project);
      } catch (error) {
        setNotice(`Could not export project: ${(error as Error).message}`);
      }
    },
  };

  return (
    <div className="workbench-shell">
      <header className="workbench-header">
        <a href="/" className="brand">
          <span className="brand-mark">≋</span>Streamweave <span className="version">0.2</span>
        </a>
        <span className="header-purpose">Visual numerical workbench</span>
        <a
          className="repo-link"
          href="https://gitlab.com/Deamenophobia/streamweave"
          target="_blank"
          rel="noreferrer"
        >
          Repository ↗
        </a>
        <span className="local-badge">
          <i /> Local computation
        </span>
      </header>
      <main className="workbench-main">
        <CanvasWorkspace
          key={workspaceVersion}
          history={history}
          execution={execution}
          selected={selected}
          select={select}
          inspect={setInspection}
          load={load}
          run={execution.rerun}
          files={files}
          notify={setNotice}
        />
        {notice && (
          <div className="notice" role="alert">
            {notice}
            <button aria-label="Dismiss notification" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        <ResultsPanel
          project={project}
          execution={execution}
          selected={selected}
          inspection={inspection}
          onInspect={setInspection}
          onSelect={select}
        />
        <footer className="main-foot">
          Streamweave / numerical workbench{" "}
          <span>Time alignment is explicit. Synthetic examples demonstrate mechanics.</span>
        </footer>
      </main>
    </div>
  );
}
