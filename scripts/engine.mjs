import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, "services/engine");
const environment = resolve(root, ".local/engine-venv");
const environmentPython = resolve(
  environment,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python = process.env.STREAMWEAVE_PYTHON || environmentPython;
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const mode = process.argv[2];
if (mode === "setup") {
  if (!existsSync(environmentPython))
    run(process.env.STREAMWEAVE_PYTHON || (process.platform === "win32" ? "python" : "python3"), [
      "-m",
      "venv",
      environment,
    ]);
  run(environmentPython, ["-m", "pip", "install", "-r", resolve(directory, "requirements.txt")]);
} else if (mode === "start") {
  run(python, ["-m", "streamweave_engine"], directory);
} else if (mode === "check") {
  run(process.execPath, ["--import", "tsx", "scripts/export-module-contracts.ts", "--check"]);
  run(process.execPath, ["--import", "tsx", "scripts/engine-fixtures.ts"]);
  run(python, ["-m", "ruff", "check", "."], directory);
  run(python, ["-m", "ruff", "format", "--check", "."], directory);
  run(python, ["-m", "mypy"], directory);
  run(python, ["-m", "pytest", "-q"], directory);
} else {
  throw new Error("Use setup, start, or check. Python 3.12+ is required.");
}
