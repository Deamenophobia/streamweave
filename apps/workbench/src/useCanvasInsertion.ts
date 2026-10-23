import { useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { useReactFlow, type OnConnectEnd } from "@xyflow/react";
import { type WorkbenchKind, type WorkbenchProject } from "@streamweave/core";
import {
  compatibleKinds,
  insertModule,
  sourceDraft,
  type ConnectionOrigin,
  type GraphUpdate,
  type ModuleDraft,
  type Point,
} from "./editorModel";
import { createId } from "./projectFiles";

type Picker = {
  screen: Point;
  position: Point;
  height: number;
  place: boolean;
  from?: ConnectionOrigin;
};
type Options = {
  project: WorkbenchProject;
  updateGraph: GraphUpdate;
  select: (id: string | null) => void;
  notify: (message: string) => void;
  undo: () => void;
  redo: () => void;
};

export function useCanvasInsertion({ project, updateGraph, select, notify, undo, redo }: Options) {
  const canvas = useRef<HTMLDivElement>(null);
  const pointer = useRef<Point | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [placement, setPlacement] = useState<ModuleDraft | null>(null);
  const [ghost, setGhost] = useState<Point | null>(null);
  const { screenToFlowPosition, getZoom } = useReactFlow();

  function focus() {
    canvas.current?.focus({ preventScroll: true });
  }
  function closePicker() {
    setPicker(null);
    focus();
  }
  function cancel() {
    setPlacement(null);
    setGhost(null);
    closePicker();
  }
  function beginPlacement(draft: ModuleDraft) {
    setPlacement(draft);
    setPicker(null);
    setGhost(null);
    focus();
  }

  function showPicker(point?: Point, from?: ConnectionOrigin) {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    const anchor = point ?? { x: rect.left + Math.min(rect.width / 2, 300), y: rect.top + 75 };
    const height = Math.min(420, rect.height - 32);
    setPlacement(null);
    setGhost(null);
    setPicker({
      screen: {
        x: Math.max(16, Math.min(anchor.x - rect.left, rect.width - 376)),
        y: Math.max(16, Math.min(anchor.y - rect.top, rect.height - height - 16)),
      },
      height,
      position: screenToFlowPosition(anchor),
      place: !point,
      from,
    });
  }

  function add(draft: ModuleDraft, position: Point, from?: ConnectionOrigin) {
    try {
      const id = createId(draft.type);
      const graph = insertModule(project, draft, position, id, createId("edge"), from);
      updateGraph(() => graph);
      select(id);
      cancel();
      notify("");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  function choose(kind: WorkbenchKind) {
    if (!picker) return;
    if (picker.place) beginPlacement({ type: kind });
    else add({ type: kind }, picker.position, picker.from);
  }

  function place(point: Point) {
    if (placement) add(placement, screenToFlowPosition(point));
  }

  const connectEnd: OnConnectEnd = (event, connection) => {
    if (
      connection.isValid ||
      connection.toNode ||
      connection.fromHandle?.type !== "source" ||
      !connection.fromNode
    )
      return;
    if (!(event.target instanceof Element) || !event.target.closest(".react-flow__pane")) return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!point) return;
    showPicker(
      { x: point.clientX, y: point.clientY },
      { source: connection.fromNode.id, sourcePort: connection.fromHandle.id ?? "" },
    );
  };

  function drop(event: DragEvent) {
    event.preventDefault();
    const dataset = project.datasets.find(
      (dataset) => dataset.id === event.dataTransfer.getData("application/streamweave-dataset"),
    );
    if (dataset)
      add(sourceDraft(dataset), screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    pointer.current = { x: event.clientX, y: event.clientY };
    if (!placement) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setGhost({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }
  function leavePointer() {
    pointer.current = null;
    setGhost(null);
  }
  function undoEdit() {
    cancel();
    undo();
  }
  function redoEdit() {
    cancel();
    redo();
  }

  function keyDown(event: KeyboardEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) ||
        target.isContentEditable)
    )
      return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      event.preventDefault();
      cancel();
    }
    if (event.shiftKey && key === "a") {
      event.preventDefault();
      showPicker(pointer.current ?? undefined);
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (key === "z") {
      event.preventDefault();
      event.shiftKey ? redoEdit() : undoEdit();
    }
    if (key === "y") {
      event.preventDefault();
      redoEdit();
    }
  }

  return {
    canvas,
    picker,
    placement,
    ghost,
    zoom: getZoom(),
    kinds: compatibleKinds(project.graph, picker?.from),
    showPicker,
    closePicker,
    beginPlacement,
    cancel,
    choose,
    place,
    connectEnd,
    drop,
    movePointer,
    leavePointer,
    keyDown,
    undo: undoEdit,
    redo: redoEdit,
  };
}

export type CanvasInsertion = ReturnType<typeof useCanvasInsertion>;
