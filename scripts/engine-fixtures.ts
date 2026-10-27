import { mkdir, writeFile } from "node:fs/promises";
import {
  executeWorkbench,
  makeNode,
  multiSourceExample,
  pressureExample,
  parseDataset,
  type WorkbenchProject,
  type WorkbenchKind,
} from "../packages/core/src/index.js";

export function operationStudy(): WorkbenchProject {
  const project = multiSourceExample();
  project.datasets = ["recording_a", "recording_b"].map((id, j) =>
    parseDataset(
      JSON.stringify(
        Array.from({ length: 17 }, (_, i) => ({
          timestampMs: i * 1000 + j * 250,
          availableAtMs: i * 1000 + j * 250 + (i === 3 ? 5000 : 0),
          reading: i % 7 === 0 ? null : (i - 5) * (j + 1),
          location: i % 2 ? "north" : "south",
        })),
      ),
      "json",
      id,
      id,
    ),
  );
  project.graph.nodes.find((n) => n.id === "alignment")!.params = {
    mode: "previous",
    stepMs: 1000,
    maxAgeMs: 1200,
  };
  function add(
    id: string,
    kind: WorkbenchKind,
    params: Record<string, string | number>,
    source: string,
    sourcePort: string,
    targetPort: string,
  ) {
    project.graph.nodes.push(makeNode(id, kind, 0, 0, params));
    project.graph.edges.push({ id: `edge_${id}`, source, sourcePort, target: id, targetPort });
  }
  for (const operation of ["difference", "percent", "log", "lag"])
    add(`change_${operation}`, "transform", { operation, lag: 2 }, "source_a", "series", "series");
  for (const operation of ["mean", "std", "count", "min", "max"])
    add(
      `roll_${operation}`,
      "rolling",
      { operation, window: 4, minimum: 1 },
      "source_a",
      "series",
      "series",
    );
  for (const operation of ["add", "subtract", "multiply", "divide"])
    add(
      `pair_${operation}`,
      "arithmetic",
      { operation, x: "source_a_series", y: "source_b_series" },
      "alignment",
      "frame",
      "frame",
    );
  for (const operator of ["gte", "lte", "eq", "present"])
    add(
      `filter_${operator}`,
      "filter",
      {
        operator,
        column: operator === "eq" ? "location" : "reading",
        value: operator === "eq" ? "north" : "0",
      },
      "source_a",
      "data",
      "data",
    );
  add("selected", "field", { column: "source_a_series" }, "alignment", "frame", "data");
  add("filtered_series", "field", { column: "reading" }, "filter_gte", "data", "data");
  add(
    "scaled",
    "scale",
    { factor: -2, offset: 3, unit: "converted" },
    "source_a",
    "series",
    "series",
  );
  add("smoothed", "smooth", { halfLifeMs: 2000 }, "source_a", "series", "series");
  return project;
}

export function benchmarkStudy(rows: number, window: number): WorkbenchProject {
  const project = multiSourceExample();
  project.datasets = ["recording_a", "recording_b"].map((id, j) =>
    parseDataset(
      JSON.stringify(
        Array.from({ length: rows }, (_, i) => ({
          timestampMs: i * 1000,
          reading: i % 113 === 0 ? null : 100 + Math.sin(i / 13) + j * Math.cos(i / 7),
        })),
      ),
      "json",
      id,
      id,
    ),
  );
  project.graph.nodes.find((n) => n.id === "alignment")!.params = {
    mode: "previous",
    stepMs: 1000,
    maxAgeMs: 1000,
  };
  project.graph.nodes.find((n) => n.id === "correlation")!.params.window = window;
  project.graph.nodes.push(
    makeNode("rolling", "rolling", 0, 0, { operation: "std", window, minimum: 3 }),
  );
  project.graph.edges.push({
    id: "edge_rolling",
    source: "source_a",
    sourcePort: "series",
    target: "rolling",
    targetPort: "series",
  });
  return project;
}

if (process.argv[1]?.endsWith("engine-fixtures.ts")) {
  const cases: { name: string; project: WorkbenchProject }[] = [
    { name: "two sources", project: multiSourceExample() },
    { name: "signed events", project: pressureExample() },
    { name: "vectorized chunk boundaries", project: benchmarkStudy(600, 300) },
    ...["previous", "union", "intersection"].map((mode) => {
      const project = operationStudy();
      project.graph.nodes.find((n) => n.id === "alignment")!.params.mode = mode;
      return { name: `operations ${mode}`, project };
    }),
  ];
  const broken = operationStudy();
  broken.graph.nodes.find((n) => n.id === "alignment")!.params.stepMs = 0;
  cases.push({ name: "invalid branch leaves independent results", project: broken });
  const constant = operationStudy();
  for (const row of constant.datasets[0]!.rows) row.reading = 4;
  cases.push({ name: "constant input", project: constant });
  const delayed = pressureExample();
  delayed.datasets[0]!.columns.push({
    key: "availableAtMs",
    label: "Availability",
    type: "number",
  });
  for (const row of delayed.datasets[0]!.rows) row.availableAtMs = Number(row.timestampMs) + 1;
  cases.push({ name: "pressure rejects delayed observations", project: delayed });
  const fixtures = cases.map(({ name, project }) => {
    const run = executeWorkbench(project.graph, project.datasets);
    return {
      name,
      project,
      expected: {
        order: run.order,
        nodes: Object.fromEntries(
          Object.entries(run.nodes).map(([id, { inputs: _, ...node }]) => [id, node]),
        ),
      },
    };
  });
  await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../.local/engine-fixtures.json", import.meta.url),
    JSON.stringify(fixtures),
  );
  console.log(`Prepared ${fixtures.length} cross-engine fixture projects.`);
}
