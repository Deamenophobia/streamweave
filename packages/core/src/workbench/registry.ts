import type { WorkbenchKind } from "./contracts.js";
import type { ModuleDefinition } from "./moduleDefinition.js";
import { source } from "./modules/source.js";
import { field } from "./modules/field.js";
import { filter } from "./modules/filter.js";
import { align } from "./modules/align.js";
import { transform } from "./modules/transform.js";
import { scale } from "./modules/scale.js";
import { smooth } from "./modules/smooth.js";
import { rolling } from "./modules/rolling.js";
import { arithmetic } from "./modules/arithmetic.js";
import { correlation } from "./modules/correlation.js";
import { regression } from "./modules/regression.js";
import { pressure } from "./modules/pressure.js";
import { chart } from "./modules/chart.js";
import { table } from "./modules/table.js";
import { exportModule } from "./modules/export.js";

/** Build-time composition root; execution and UI consume the same module contracts. */
export const WORKBENCH_MODULES: Readonly<Record<WorkbenchKind, ModuleDefinition>> = {
  source,
  field,
  filter,
  align,
  transform,
  scale,
  smooth,
  rolling,
  arithmetic,
  correlation,
  regression,
  pressure,
  chart,
  table,
  export: exportModule,
};
