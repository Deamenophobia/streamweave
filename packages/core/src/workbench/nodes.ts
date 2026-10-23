import { WORKBENCH_MODULES } from "./registry.js";
import type { WorkbenchKind, WorkbenchNode } from "./contracts.js";

export function makeNode(
  id: string,
  type: WorkbenchKind,
  x: number,
  y: number,
  params: WorkbenchNode["params"] = {},
  title?: string,
): WorkbenchNode {
  return {
    id,
    type,
    title: title ?? WORKBENCH_MODULES[type].title,
    position: { x, y },
    params: { ...WORKBENCH_MODULES[type].defaults, ...params },
  };
}
