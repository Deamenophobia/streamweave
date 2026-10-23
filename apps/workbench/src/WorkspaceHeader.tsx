import { useEffect, useRef, type ReactNode } from "react";
import {
  emptyProject,
  multiSourceExample,
  pressureExample,
  type WorkbenchProject,
} from "@streamweave/core";
import type { ProjectActions } from "./projectFiles";

function Menu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current)
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return (
    <details
      ref={ref}
      className="app-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>{label}</summary>
      <div
        className="app-menu-items"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("button") && ref.current)
            ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

type Props = {
  name: string;
  rename: (name: string) => void;
  files: ProjectActions;
  load: (project: WorkbenchProject) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  run: () => void;
};

export function WorkspaceHeader({
  name,
  rename,
  files,
  load,
  undo,
  redo,
  canUndo,
  canRedo,
  busy,
  run,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <header className="workspace-header">
      <a href="#/canvas" className="brand">
        <span className="brand-mark">≋</span>Streamweave
      </a>
      <nav className="project-menu" aria-label="Project menu">
        <Menu label="File">
          <button onClick={() => load(emptyProject())}>New workspace</button>
          <button onClick={() => input.current?.click()}>Open project…</button>
          <hr />
          <button onClick={files.save}>Save in browser</button>
          <button onClick={files.download}>Download project</button>
        </Menu>
        <Menu label="Edit">
          <button disabled={!canUndo} onClick={undo}>
            Undo
          </button>
          <button disabled={!canRedo} onClick={redo}>
            Redo
          </button>
        </Menu>
        <Menu label="Examples">
          <button onClick={() => load(multiSourceExample())}>Two-source study</button>
          <button onClick={() => load(pressureExample())}>Signed-event study</button>
        </Menu>
      </nav>
      <input
        className="workspace-name"
        aria-label="Project name"
        maxLength={120}
        value={name}
        onChange={(event) => rename(event.target.value)}
      />
      <button className="run-button" onClick={run} disabled={busy}>
        {busy ? "Computing…" : "↻ Run"}
      </button>
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
    </header>
  );
}
