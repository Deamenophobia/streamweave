import { parseDataset } from "./data.js";
import { makeNode } from "./nodes.js";
import type { WorkbenchProject, WorkbenchEdge } from "./contracts.js";
import { scenario } from "../scenarios.js";

const edge = (
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
): WorkbenchEdge => ({
  id: `e_${source}_${sourcePort}_${target}_${targetPort}`,
  source,
  sourcePort,
  target,
  targetPort,
});

export function multiSourceExample(): WorkbenchProject {
  const start = Date.UTC(2026, 0, 1);
  const signal = (minutes: number) => 20 + Math.sin(minutes / 9) * 4 + Math.sin(minutes / 3) * 0.8;
  const a = Array.from({ length: 121 }, (_, i) => ({
    timestampMs: start + i * 60_000,
    reading: signal(i),
    location: "north",
  }));
  const b = Array.from({ length: 81 }, (_, i) => ({
    timestampMs: start + 30_000 + i * 90_000,
    reading: 2 * signal(0.5 + i * 1.5) + 5 + Math.cos(i / 3) * 0.5,
    location: "south",
  })).filter((_, i) => i < 25 || i > 29);
  const datasets = [
    parseDataset(JSON.stringify(a), "json", "recording_a", "Sensor A · every 60s"),
    parseDataset(JSON.stringify(b), "json", "recording_b", "Sensor B · every 90s, with a gap"),
  ];
  const nodes = [
    makeNode(
      "source_a",
      "source",
      0,
      0,
      { datasetId: "recording_a", column: "reading", label: "Sensor A", unit: "units" },
      "Sensor A",
    ),
    makeNode(
      "source_b",
      "source",
      0,
      220,
      { datasetId: "recording_b", column: "reading", label: "Sensor B", unit: "units" },
      "Sensor B",
    ),
    makeNode("alignment", "align", 250, 100),
    makeNode("correlation", "correlation", 500, 0, { x: "source_a_series", y: "source_b_series" }),
    makeNode("fit", "regression", 500, 220, { x: "source_a_series", y: "source_b_series" }),
    makeNode("correlation_chart", "chart", 760, 0, {}, "Correlation over time"),
    makeNode("fit_table", "table", 760, 220, {}, "Fit coefficients"),
    makeNode("residual_chart", "chart", 760, 410, {}, "Residual diagnostics"),
    makeNode("aligned_export", "export", 250, 410, {}, "Aligned data export"),
  ];
  const edges = [
    edge("source_a", "series", "alignment", "series"),
    edge("source_b", "series", "alignment", "series"),
    edge("alignment", "frame", "correlation", "frame"),
    edge("alignment", "frame", "fit", "frame"),
    edge("correlation", "series", "correlation_chart", "in"),
    edge("fit", "model", "fit_table", "in"),
    edge("fit", "residuals", "residual_chart", "in"),
    edge("alignment", "frame", "aligned_export", "in"),
  ];
  return {
    format: "streamweave-project",
    version: 2,
    graph: { version: 2, name: "Two sources · four independent outputs", nodes, edges },
    datasets,
  };
}

export function pressureExample(): WorkbenchProject {
  const dataset = parseDataset(
    JSON.stringify(scenario().map((e) => ({ ...e }))),
    "json",
    "signed_events",
    "Signed events · synthetic",
  );
  return {
    format: "streamweave-project",
    version: 2,
    datasets: [dataset],
    graph: {
      version: 2,
      name: "Optional signed-event analysis",
      nodes: [
        makeNode("events", "source", 0, 100, {
          datasetId: dataset.id,
          column: "value",
          unit: "value",
        }),
        makeNode("pressure", "pressure", 250, 100),
        makeNode("smooth", "smooth", 500, 100, { halfLifeMs: 5000 }),
        makeNode("chart", "chart", 750, 20, {}, "Raw and smoothed pressure"),
        makeNode("export", "export", 750, 260),
      ],
      edges: [
        edge("events", "data", "pressure", "data"),
        edge("pressure", "series", "smooth", "series"),
        edge("pressure", "series", "chart", "in"),
        edge("smooth", "series", "chart", "in"),
        edge("smooth", "series", "export", "in"),
      ],
    },
  };
}

export function emptyProject(): WorkbenchProject {
  return {
    format: "streamweave-project",
    version: 2,
    graph: { version: 2, name: "Untitled calculation", nodes: [], edges: [] },
    datasets: [],
  };
}
