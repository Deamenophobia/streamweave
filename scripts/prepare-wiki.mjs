import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "docs/wiki");
const output = resolve(root, ".local/wiki");
const repository = "https://github.com/Deamenophobia/streamweave/blob/main/";
const checkOnly = process.argv.includes("--check");
const files = new Map();
for (const name of (await readdir(source)).filter((name) => name.endsWith(".md"))) {
  files.set(resolve(source, name), name);
}
for (const [name, target] of Object.entries({
  "analytics.md": "numerical-contract.md",
  "architecture.md": "architecture.md",
  "validation.md": "validation.md",
  "code-quality.md": "code-quality.md",
  "workbench.png": "assets/workbench.png",
  "studio.png": "assets/studio.png",
  "datasets.png": "assets/datasets.png",
  "results.png": "assets/results.png",
  "local-engine.png": "assets/local-engine.png",
}))
  files.set(resolve(root, "docs", name), target);

function linkTarget(sourcePath, href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [path, fragment] = href.split("#", 2);
  const target = resolve(dirname(sourcePath), path);
  const repoPath = relative(root, target);
  if (repoPath.startsWith(`..${sep}`) || !existsSync(target)) {
    throw new Error(`Broken or external local link in ${relative(root, sourcePath)}: ${href}`);
  }
  const published = files.get(target);
  const url =
    published?.replace(/\.md$/, "") ??
    repository + repoPath.split(sep).map(encodeURIComponent).join("/");
  return fragment ? `${url}#${fragment}` : url;
}

function rewriteLinks(path, markdown) {
  return markdown.replace(
    /(!?\[[^\]]*\])\(([^\s)]+)\)/g,
    (_, label, href) => `${label}(${linkTarget(path, href)})`,
  );
}

const repositoryDocs = [
  "README.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  ...(await readdir(resolve(root, "docs/releases")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/releases/${name}`),
];
for (const name of repositoryDocs) {
  const path = resolve(root, name);
  rewriteLinks(path, await readFile(path, "utf8"));
}

let pages = 0;
for (const [path, target] of files) {
  if (!path.endsWith(".md")) {
    if (!checkOnly) {
      await mkdir(dirname(resolve(output, target)), { recursive: true });
      await copyFile(path, resolve(output, target));
    }
    continue;
  }
  const markdown = await readFile(path, "utf8");
  const rendered = rewriteLinks(path, markdown);
  pages++;
  if (!checkOnly) {
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, target), rendered);
  }
}
console.log(
  `${checkOnly ? "Validated" : "Prepared"} ${pages} wiki pages${checkOnly ? "" : ` in ${output}`}; checked ${repositoryDocs.length} repository documents.`,
);
