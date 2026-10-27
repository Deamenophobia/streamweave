import { readFile, writeFile, mkdir } from "node:fs/promises";
import { WORKBENCH_MODULES } from "../packages/core/src/workbench/registry.js";

// Declarative validation and ports have one source; evaluator functions stay in each engine.
const modules = Object.fromEntries(
  Object.entries(WORKBENCH_MODULES).map(([kind, { evaluate: _, ...definition }]) => [
    kind,
    definition,
  ]),
);
const content = JSON.stringify({ protocolVersion: 1, projectVersion: 2, modules }, null, 2) + "\n";
const path = new URL("../protocol/modules.json", import.meta.url);
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== content) {
    throw new Error("Module contracts changed. Run npm run contracts:generate.");
  }
  console.log("Shared module contracts match the TypeScript registry.");
} else {
  await mkdir(new URL("../protocol/", import.meta.url), { recursive: true });
  await writeFile(path, content);
}
