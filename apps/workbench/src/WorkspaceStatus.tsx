import type { WorkbenchProject } from "@streamweave/core";
import type { Execution } from "./execution/contracts";

export function WorkspaceStatus({
  project,
  execution,
  review,
}: {
  project: WorkbenchProject;
  execution: Execution;
  review: (id: string) => void;
}) {
  const failures = Object.entries(execution.run?.nodes ?? {}).filter(
    ([, result]) => result.state !== "ready",
  );
  function status() {
    if (execution.busy)
      return execution.progress
        ? `◌ Computing ${execution.progress.completed}/${execution.progress.total} modules…`
        : "◌ Computing…";
    if (execution.error) return execution.error;
    if (failures.length)
      return `${failures.length} ${failures.length === 1 ? "module needs" : "modules need"} attention`;
    return "✓ All branches ready";
  }
  return (
    <footer className={`workspace-status ${execution.error || failures.length ? "invalid" : ""}`}>
      <span role="status">{status()}</span>
      {!!failures.length && <button onClick={() => review(failures[0]![0])}>Review ↗</button>}
      <span className="status-counts">
        {project.graph.nodes.length} modules · {project.graph.edges.length} connections
      </span>
      <span className="status-local">
        {project.datasets.length} data sources ·{" "}
        {execution.engineId === "python" ? "Python" : "Browser"}
        {execution.metrics &&
          ` · ${Math.round(execution.metrics.durationMs)} ms · ${execution.metrics.cacheHits} cached`}
      </span>
    </footer>
  );
}
