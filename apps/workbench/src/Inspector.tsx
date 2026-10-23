import {
  WORKBENCH_MODULES,
  type WorkbenchNode,
  type Dataset,
  type NodeResult,
  type Column,
} from "@streamweave/core";

type Props = {
  node: WorkbenchNode;
  result?: NodeResult;
  datasets: Dataset[];
  update: (key: string, value: string | number) => void;
  rename: (value: string) => void;
  duplicate: () => void;
  remove: () => void;
};
export function Inspector({ node, result, datasets, update, rename, duplicate, remove }: Props) {
  const spec = WORKBENCH_MODULES[node.type],
    p = node.params;
  const field = (label: string, key: string, options: { value: string; label: string }[]) => (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={String(p[key] ?? "")}
        onChange={(e) => update(key, e.target.value)}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const choice = (label: string, key: string, options: string[][]) =>
    field(
      label,
      key,
      options.map(([value, label]) => ({ value: value!, label: label! })),
    );
  const num = (label: string, key: string, min: number, max: number, scale = 1) => (
    <label className="field">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={scale === 1000 ? 0.1 : "any"}
        value={Number(p[key]) / scale}
        onChange={(e) => update(key, Number(e.target.value) * scale)}
      />
    </label>
  );
  const text = (label: string, key: string) => (
    <label className="field">
      {label}
      <input
        aria-label={label}
        maxLength={120}
        value={String(p[key] ?? "")}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  const inputData = result?.inputs[0]?.data;
  const sourceData = datasets.find((d) => d.id === p.datasetId);
  const columns: Column[] =
    node.type === "source"
      ? (sourceData?.columns ?? [])
      : inputData && inputData.kind !== "series"
        ? inputData.columns
        : [];
  const numericColumns = columns.filter(
    (c) => c.type === "number" && !["timestampMs", "availableAtMs"].includes(c.key),
  );
  const numericOptions = numericColumns.map((c) => ({
    value: c.key,
    label: `${c.label}${c.unit ? ` (${c.unit})` : ""}`,
  }));
  return (
    <aside className="node-inspector">
      <div className="section-caption">
        CONFIGURE MODULE <span>{node.type}</span>
      </div>
      <label className="field">
        Module name
        <input
          aria-label="Module name"
          maxLength={100}
          value={node.title}
          onChange={(e) => rename(e.target.value)}
        />
      </label>
      <p className="inspector-description">{spec.description}</p>
      {result?.error && (
        <div className="module-error" role="status">
          {result.error}
        </div>
      )}
      {node.type === "source" &&
        field(
          "Dataset",
          "datasetId",
          datasets.map((d) => ({ value: d.id, label: d.name })),
        )}
      {["source", "field"].includes(node.type) && (
        <>
          {field("Value column", "column", numericOptions)}
          {text("Series label", "label")}
          {text("Unit", "unit")}
        </>
      )}
      {node.type === "filter" && (
        <>
          {field(
            "Filter column",
            "column",
            columns.map((c) => ({ value: c.key, label: c.label })),
          )}
          {choice("Condition", "operator", [
            ["gte", "Greater than or equal"],
            ["lte", "Less than or equal"],
            ["eq", "Equals"],
            ["present", "Is present"],
          ])}
          {p.operator !== "present" && text("Comparison value", "value")}
        </>
      )}
      {node.type === "align" && (
        <>
          {choice("Alignment mode", "mode", [
            ["previous", "Regular grid · previous available"],
            ["intersection", "Exact timestamps · intersection"],
            ["union", "Exact timestamps · union"],
          ])}
          {p.mode === "previous" && (
            <>
              {num("Grid interval (seconds)", "stepMs", 0.001, 31_536_000, 1000)}
              {num("Maximum age (seconds)", "maxAgeMs", 0, 31_536_000, 1000)}
            </>
          )}
          <p className="field-help">
            All times are UTC. No interpolation or future values are used. Missing and stale cells
            remain null.
          </p>
        </>
      )}
      {node.type === "transform" && (
        <>
          {choice("Transformation", "operation", [
            ["difference", "Absolute difference"],
            ["percent", "Percentage change"],
            ["log", "Log change (positive values)"],
            ["lag", "Lag observations"],
          ])}
          {num("Lag (observations)", "lag", 1, 1000)}
        </>
      )}
      {node.type === "scale" && (
        <>
          {num("Factor", "factor", -1e12, 1e12)}
          {num("Offset", "offset", -1e12, 1e12)}
          {text("Output unit", "unit")}
        </>
      )}
      {node.type === "smooth" &&
        num("Smoothing half-life (seconds)", "halfLifeMs", 0.001, 31_536_000, 1000)}
      {node.type === "rolling" &&
        choice("Statistic", "operation", [
          ["mean", "Mean"],
          ["std", "Sample standard deviation"],
          ["min", "Minimum"],
          ["max", "Maximum"],
          ["count", "Valid count"],
        ])}
      {["rolling", "correlation"].includes(node.type) && (
        <>
          {num("Window (observations)", "window", 2, 1000)}
          {num("Minimum valid samples", "minimum", node.type === "correlation" ? 3 : 1, 1000)}
        </>
      )}
      {["arithmetic", "correlation", "regression"].includes(node.type) && (
        <>
          {field("X column", "x", numericOptions)}
          {field("Y column", "y", numericOptions)}
        </>
      )}
      {node.type === "arithmetic" &&
        choice("Operation", "operation", [
          ["add", "X + Y"],
          ["subtract", "X − Y"],
          ["multiply", "X × Y"],
          ["divide", "X / Y"],
        ])}
      {node.type === "regression" && (
        <p className="field-help">
          Fits every complete pair in the supplied frame. R² and residuals describe that same
          sample. Change or filter inputs to choose a fit period.
        </p>
      )}
      {node.type === "pressure" && (
        <>
          {num("Pressure window (seconds)", "windowMs", 0.001, 3600, 1000)}
          {num("Decay half-life (seconds)", "halfLifeMs", 0.001, 3600, 1000)}
          {num("Minimum observations", "minimum", 1, 100000)}
          {num("Sample interval (seconds)", "stepMs", 0.001, 3600, 1000)}
        </>
      )}
      <div className="inspector-actions">
        <button onClick={duplicate}>Duplicate module</button>
        <button className="danger-text" onClick={remove}>
          Remove
        </button>
      </div>
      <div className="port-contract">
        <span className="tiny-label">PORT CONTRACT</span>
        {spec.inputs.map((port) => (
          <p key={port.id}>
            ← {port.id}: {port.accepts.join(" / ")}
            {port.multiple ? " · multiple inputs" : ""}
          </p>
        ))}
        {spec.outputs.map((port) => (
          <p key={port.id}>
            → {port.id}: {port.accepts.join(" / ")}
          </p>
        ))}
      </div>
    </aside>
  );
}
