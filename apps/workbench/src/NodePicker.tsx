import { useEffect, useRef, useState } from "react";
import { WORKBENCH_MODULES, type WorkbenchKind } from "@streamweave/core";
import { moduleIcons } from "./editorModel";
type Props = {
  x: number;
  y: number;
  height: number;
  kinds: WorkbenchKind[];
  connectionLabel?: string;
  choose: (kind: WorkbenchKind) => void;
  close: () => void;
};

export function NodePicker({ x, y, height, kinds, connectionLabel, choose, close }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const matches = kinds.filter((kind) => {
    const spec = WORKBENCH_MODULES[kind];
    return `${spec.title} ${spec.category} ${spec.description}`
      .toLowerCase()
      .includes(query.toLowerCase().trim());
  });
  useEffect(() => {
    search.current?.focus();
  }, []);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <div
        className="picker-backdrop"
        onPointerDown={close}
        onContextMenu={(e) => {
          e.preventDefault();
          close();
        }}
      />
      <div
        className="node-picker nodrag nopan nowheel"
        role="dialog"
        aria-label="Add module"
        style={{ left: x, top: y, maxHeight: height }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        <div className="picker-heading">
          <span>{connectionLabel ? "CONNECT TO…" : "ADD MODULE"}</span>
          <button aria-label="Close module search" onClick={close}>
            ×
          </button>
        </div>
        {connectionLabel && (
          <p className="picker-context">From {connectionLabel} · compatible modules only</p>
        )}
        <input
          ref={search}
          className="module-search"
          aria-label="Search modules"
          role="combobox"
          aria-expanded="true"
          aria-controls="module-options"
          aria-activedescendant={matches[active] ? `module-option-${matches[active]}` : undefined}
          placeholder="Search modules…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) =>
                Math.max(0, Math.min(matches.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))),
              );
            }
            if (e.key === "Enter" && matches[active]) {
              e.preventDefault();
              choose(matches[active]);
            }
          }}
        />
        <div
          ref={list}
          className="picker-options"
          id="module-options"
          role="listbox"
          aria-label="Available modules"
        >
          {matches.map((kind, i) => {
            const spec = WORKBENCH_MODULES[kind];
            return (
              <button
                key={kind}
                id={`module-option-${kind}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                aria-label={spec.title}
                className={i === active ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(kind)}
              >
                <span className={`picker-icon category-${spec.category.toLowerCase()}`}>
                  {moduleIcons[kind]}
                </span>
                <span className="picker-label">
                  <strong>{spec.title}</strong>
                  <small>{spec.description}</small>
                </span>
                <span className="picker-category">{spec.category}</span>
              </button>
            );
          })}
          {!matches.length && <p className="picker-empty">No matching modules.</p>}
        </div>
        <div className="picker-footer">
          <span>↑ ↓ Navigate · Enter Choose</span>
          <span>Esc Cancel</span>
        </div>
      </div>
    </>
  );
}
