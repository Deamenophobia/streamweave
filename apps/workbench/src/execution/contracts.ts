import type { WorkbenchRun } from "@streamweave/core";

export type Execution = { run: WorkbenchRun | null; busy: boolean; error: string };
export type WorkerResponse = { run: WorkbenchRun; error?: never } | { error: string; run?: never };
