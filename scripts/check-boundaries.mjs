import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = resolve(root, "packages/core/src");
const ui = resolve(root, "apps/workbench/src");

// Low-level code must not depend on feature views or application orchestration.
const allowedLayers = {
  adapters: new Set(["adapters"]),
  platform: new Set(["platform", "adapters"]),
  documents: new Set(["documents", "platform", "adapters"]),
  execution: new Set(["execution"]),
};
const uiLayer = (path) => relative(ui, path).split(sep)[0];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

const paths = [...(await sourceFiles(core)), ...(await sourceFiles(ui))];
const known = new Set(paths);
const dependencies = new Map();
for (const path of paths) {
  const text = await readFile(path, "utf8");
  const imports = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  const targets = [];
  for (const specifier of imports) {
    if (path.startsWith(core + sep) && !specifier.startsWith("."))
      throw new Error(`Core must remain dependency-free: ${relative(root, path)} → ${specifier}`);
    const layer = uiLayer(path);
    if (["adapters", "platform"].includes(layer) && /^(react|@xyflow\/react)(\/|$)/.test(specifier))
      throw new Error(
        `${layer} must not import UI libraries: ${relative(root, path)} → ${specifier}`,
      );
    if (!specifier.startsWith(".")) continue;
    const base = resolve(dirname(path), specifier).replace(/\.js$/, "");
    const target = [base, base + ".ts", base + ".tsx"].find((candidate) => known.has(candidate));
    if (!target) continue; // Styles and bundled assets are not source-module dependencies.
    if (path.startsWith(core + sep) && !target.startsWith(core + sep))
      throw new Error("Core imports outside its package.");
    if (path.startsWith(ui + sep) && target.startsWith(core + sep))
      throw new Error("Use @streamweave/core instead of importing core internals.");
    if (
      path.startsWith(ui + sep) &&
      allowedLayers[layer] &&
      !allowedLayers[layer].has(uiLayer(target))
    )
      throw new Error(
        `Layer boundary: ${relative(root, path)} must not import ${relative(root, target)}`,
      );
    targets.push(target);
  }
  dependencies.set(path, targets);
}

const complete = new Set();
function visit(path, stack = []) {
  if (stack.includes(path))
    throw new Error(
      `Source dependency cycle: ${[...stack, path].map((item) => relative(root, item)).join(" → ")}`,
    );
  if (complete.has(path)) return;
  for (const target of dependencies.get(path) ?? []) visit(target, [...stack, path]);
  complete.add(path);
}
for (const path of paths) visit(path);
console.log(
  `Validated import boundaries and acyclic dependencies across ${paths.length} source files.`,
);
