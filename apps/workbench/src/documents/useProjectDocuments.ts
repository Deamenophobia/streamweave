import { useEffect, useRef, useState } from "react";
import type { WorkbenchProject } from "@streamweave/core";
import { projectExport } from "../adapters/projectJson";
import { downloadFile, readDatasets } from "../platform/browserFiles";
import { saveProject } from "../platform/browserStorage";
import { appendDatasets } from "./projectData";
import type { ProjectActions } from "./contracts";
import { createProjectOpener } from "./projectOpening";
import type { ProjectHistory } from "./useProjectHistory";

type Options = {
  history: ProjectHistory;
  version: number;
  load: (project: WorkbenchProject) => void;
  imported: (id: string) => void;
  notify: (message: string) => void;
};

export function useProjectDocuments({ history, version, load, imported, notify }: Options) {
  const { project, setProject } = history;
  const latest = useRef({ project, version });
  const [openProject] = useState(() => createProjectOpener(() => latest.current.version));
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    latest.current = { project, version };
  }, [project, version]);

  const files: ProjectActions = {
    async import(files) {
      if (!files.length || importing) return;
      setImporting(true);
      try {
        const datasets = await readDatasets(files);
        if (version !== latest.current.version) {
          notify("Import cancelled because a different workspace was opened.");
          return;
        }
        setProject(appendDatasets(latest.current.project, datasets));
        if (datasets[0]) imported(datasets[0].id);
        notify(
          `Imported ${datasets.length} dataset${datasets.length === 1 ? "" : "s"}. Choose Use on canvas when you are ready to place a source.`,
        );
      } catch (error) {
        notify(`Import failed: ${(error as Error).message}`);
      } finally {
        setImporting(false);
      }
    },
    async open(file) {
      try {
        const opened = await openProject(file);
        if (!opened) return;
        load(opened);
        notify(`Opened ${file.name}.`);
      } catch (error) {
        notify(`Could not open project: ${(error as Error).message}`);
      }
    },
    save() {
      try {
        saveProject(project);
        notify("Project and datasets saved in this browser.");
      } catch (error) {
        notify(
          `Save failed: ${(error as Error).message} Use Download project for larger workspaces.`,
        );
      }
    },
    download() {
      try {
        downloadFile(projectExport(project));
      } catch (error) {
        notify(`Could not export project: ${(error as Error).message}`);
      }
    },
  };
  return { files, importing };
}
