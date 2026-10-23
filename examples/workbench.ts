import { writeFileSync } from "node:fs";
import {
  executeWorkbench,
  multiSourceExample,
  toCsv,
  type DataTable,
} from "../packages/core/src/index.js";

const project = multiSourceExample();
const run = executeWorkbench(project.graph, project.datasets);
for (const [id, result] of Object.entries(run.nodes)) {
  if (result.state !== "ready") throw new Error(`${id}: ${result.error}`);
}
console.log(
  `${project.graph.name}: ${run.order.length} modules, ${project.datasets.length} datasets`,
);
console.table((run.nodes.fit!.outputs.model as DataTable).rows);
console.log("All four outputs are ready. This is a descriptive fit of synthetic data.");

if (process.argv.includes("--write-samples")) {
  for (const [i, dataset] of project.datasets.entries()) {
    writeFileSync(
      new URL(`./sensor-${i === 0 ? "a" : "b"}.csv`, import.meta.url),
      toCsv(dataset.rows),
    );
  }
}
