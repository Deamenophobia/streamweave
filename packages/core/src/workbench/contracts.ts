import type { Dataset, DataValue } from "./data.js";

export type WorkbenchKind =
  | "source"
  | "field"
  | "filter"
  | "align"
  | "transform"
  | "scale"
  | "smooth"
  | "rolling"
  | "arithmetic"
  | "correlation"
  | "regression"
  | "pressure"
  | "chart"
  | "table"
  | "export";
export interface WorkbenchNode {
  id: string;
  type: WorkbenchKind;
  title: string;
  position: { x: number; y: number };
  params: Record<string, string | number>;
}
export interface WorkbenchEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}
export interface WorkbenchGraph {
  version: 2;
  name: string;
  nodes: WorkbenchNode[];
  edges: WorkbenchEdge[];
}
export interface WorkbenchProject {
  format: "streamweave-project";
  version: 2;
  graph: WorkbenchGraph;
  datasets: Dataset[];
}
export interface Port {
  id: string;
  label: string;
  accepts: DataValue["kind"][];
  minimum?: number;
  multiple?: boolean;
}
export interface NodeResult {
  state: "ready" | "error" | "blocked";
  outputs: Record<string, DataValue>;
  inputs: { edge: WorkbenchEdge; data: DataValue }[];
  error?: string;
}
export interface WorkbenchRun {
  nodes: Record<string, NodeResult>;
  order: string[];
}

/** Execution provenance belongs to results, never to the portable project document. */
export interface EngineMetadata {
  id: "browser" | "python";
  version: string;
  protocolVersion: 1 | 2;
  contractHash?: string;
  libraries?: Record<string, string>;
}
