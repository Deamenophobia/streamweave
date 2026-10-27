import type { EngineMetadata, WorkbenchProject, WorkbenchRun } from "@streamweave/core";

export type EngineId = "browser" | "python";
export type Progress = { completed: number; total: number };
export type EngineResult = {
  run: WorkbenchRun;
  engine: EngineMetadata;
  metrics: { durationMs: number; cacheHits: number; nodeCount: number; totalMs?: number };
};
export type ComputeEngine = {
  run: (
    project: WorkbenchProject,
    signal: AbortSignal,
    progress: (value: Progress) => void,
  ) => Promise<EngineResult>;
};
export type Execution = {
  engineId?: EngineId;
  run: WorkbenchRun | null;
  busy: boolean;
  error: string;
  engine?: EngineMetadata;
  metrics?: EngineResult["metrics"];
  progress?: Progress;
};
export type WorkerResponse = { run: WorkbenchRun; error?: never } | { error: string; run?: never };
