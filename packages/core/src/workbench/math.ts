import { MAX_ROWS, numeric, type AlignedFrame, type DataTable, type Series, type Point, type ValueStatus } from "./data.js";

function observationCount(value: number, label: string, min: number, max: number) {
  numeric(value, label, min, max);
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
}

export function alignSeries(inputs: { key: string; series: Series }[], mode: string, stepMs: number, maxAgeMs: number): AlignedFrame {
  if (inputs.length < 2) throw new Error("Alignment needs at least two series.");
  if (!inputs.every(x => x.series.points.length)) throw new Error("Cannot align an empty series.");
  if (!["intersection", "union", "previous"].includes(mode)) throw new Error("Unknown alignment mode.");
  numeric(stepMs, "Grid interval", 1, 31_536_000_000);
  numeric(maxAgeMs, "Maximum age", 0, 31_536_000_000);
  if (!Number.isInteger(stepMs) || !Number.isInteger(maxAgeMs)) throw new Error("Alignment time parameters must be integer milliseconds.");
  if (new Set(inputs.map(x => x.key)).size !== inputs.length) throw new Error("Alignment keys must be unique.");
  let times: number[];
  if (mode === "previous") {
    const start = Math.ceil(Math.min(...inputs.map(x => x.series.points[0]!.timestampMs)) / stepMs) * stepMs;
    const end = Math.max(...inputs.map(x => x.series.points.at(-1)!.timestampMs));
    const n = Math.floor((end - start) / stepMs) + 1;
    if (n > MAX_ROWS) throw new Error("Alignment exceeds 20,000 rows. Increase the interval.");
    times = Array.from({ length: Math.max(0, n) }, (_, i) => start + i * stepMs);
  } else {
    const counts = new Map<number, number>();
    for (const { series } of inputs) for (const p of series.points) counts.set(p.timestampMs, (counts.get(p.timestampMs) ?? 0) + 1);
    times = [...counts].filter(([, n]) => mode === "union" || n === inputs.length).map(([t]) => t).sort((a, b) => a - b);
    if (times.length > MAX_ROWS) throw new Error("Alignment exceeds 20,000 rows.");
  }
  const columns = inputs.map(x => ({ key: x.key, label: x.series.name, unit: x.series.unit, type: "number" as const }));
  const cursors = inputs.map(() => 0);
  // Release order can differ from observation order; never consume data unavailable at the target time.
  const releases = inputs.map(({ series }) => [...series.points].sort((a, b) => (a.availableAtMs ?? a.timestampMs) - (b.availableAtMs ?? b.timestampMs)));
  const latest: (Point | undefined)[] = inputs.map(() => undefined);
  const maps = inputs.map(({ series }) => new Map(series.points.map(p => [p.timestampMs, p])));
  const rows = times.map(t => {
    const values: Record<string, number | null> = Object.create(null), statuses: Record<string, ValueStatus> = Object.create(null);
    inputs.forEach(({ key }, j) => {
      let p: Point | undefined;
      if (mode === "previous") {
        const releasesForInput = releases[j]!;
        while (cursors[j]! < releasesForInput.length && (releasesForInput[cursors[j]!]!.availableAtMs ?? releasesForInput[cursors[j]!]!.timestampMs) <= t) {
          const next = releasesForInput[cursors[j]!]!;
          if (next.timestampMs <= t && (!latest[j] || next.timestampMs >= latest[j]!.timestampMs)) latest[j] = next;
          cursors[j] = cursors[j]! + 1;
        }
        p = latest[j];
      } else p = maps[j]!.get(t);
      const status: ValueStatus = !p || (p.availableAtMs ?? p.timestampMs) > t ? "missing" : mode === "previous" && t - p.timestampMs > maxAgeMs ? "stale" : p.status;
      statuses[key] = status;
      values[key] = status === "valid" ? p!.value : null;
    });
    return { timestampMs: t, values, statuses };
  });
  return { kind: "frame", columns, rows };
}

export function transformSeries(source: Series, operation: string, lag: number): Series {
  observationCount(lag, "Lag", 1, 1000);
  if (!["difference", "percent", "log", "lag"].includes(operation)) throw new Error("Unknown transformation.");
  const points: Point[] = source.points.map((p, i) => {
    const previous = source.points[i - lag];
    const base = { timestampMs: p.timestampMs, availableAtMs: Math.max(p.availableAtMs ?? p.timestampMs, previous?.availableAtMs ?? 0) };
    if (!previous) return { ...base, value: null, status: "warming" };
    if (previous.value === null || previous.status !== "valid") return { ...base, value: null, status: previous.status };
    if (operation === "lag") return { ...base, value: previous.value, status: "valid" };
    if (p.value === null || p.status !== "valid") return { ...base, value: null, status: p.status };
    let value: number;
    if (operation === "difference") value = p.value - previous.value;
    else if (operation === "percent") value = previous.value === 0 ? NaN : 100 * (p.value / previous.value - 1);
    else value = p.value > 0 && previous.value > 0 ? Math.log(p.value / previous.value) : NaN;
    return { ...base, value: Number.isFinite(value) ? value : null, status: Number.isFinite(value) ? "valid" : "undefined" };
  });
  return { kind: "series", name: `${source.name} · ${operation}(${lag})`, unit: operation === "percent" ? "%" : operation === "log" ? "log ratio" : source.unit, points };
}

export function smoothSeries(source: Series, halfLifeMs: number): Series {
  numeric(halfLifeMs, "Half-life", 1, 31_536_000_000);
  let previous: Point | undefined;
  const points = source.points.map(p => {
    if (p.value === null || p.status !== "valid") { previous = undefined; return { ...p }; }
    const value = previous?.value == null ? p.value : previous.value + (1 - 2 ** (-(p.timestampMs - previous.timestampMs) / halfLifeMs)) * (p.value - previous.value);
    const output: Point = { ...p, value, availableAtMs: Math.max(p.availableAtMs ?? p.timestampMs, previous?.availableAtMs ?? 0) };
    previous = output;
    return output;
  });
  return { ...source, name: `${source.name} · EMA`, points };
}

export function rollingSeries(source: Series, count: number, minimum: number, operation: string): Series {
  observationCount(count, "Window", 2, 1000);
  observationCount(minimum, "Minimum", 1, count);
  if (!["mean", "std", "min", "max", "count"].includes(operation)) throw new Error("Unknown rolling statistic.");
  const points: Point[] = source.points.map((p, i) => {
    const history = source.points.slice(Math.max(0, i - count + 1), i + 1);
    const valid = history.filter(x => x.value !== null && x.status === "valid");
    const values = valid.map(x => x.value!);
    const base = { timestampMs: p.timestampMs, sampleCount: values.length, availableAtMs: Math.max(p.availableAtMs ?? p.timestampMs, ...history.map(x => x.availableAtMs ?? x.timestampMs)) };
    if (values.length < minimum) return { ...base, value: null, status: "warming" };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const value = operation === "count" ? values.length : operation === "mean" ? mean : operation === "min" ? Math.min(...values) : operation === "max" ? Math.max(...values) : values.length < 2 ? NaN : Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1));
    return { ...base, value: Number.isFinite(value) ? value : null, status: Number.isFinite(value) ? "valid" : "undefined" };
  });
  return { ...source, name: `${source.name} · ${operation}(${count})`, unit: operation === "count" ? "observations" : source.unit, points };
}

function pairs(frame: AlignedFrame, x: string, y: string, start = 0, end = frame.rows.length): { x: number; y: number; t: number }[] {
  if (x === y || !frame.columns.some(c => c.key === x) || !frame.columns.some(c => c.key === y)) throw new Error("Select two different aligned columns.");
  return frame.rows.slice(start, end).filter(r => r.statuses[x] === "valid" && r.statuses[y] === "valid" && r.values[x] != null && r.values[y] != null).map(r => ({ x: r.values[x]!, y: r.values[y]!, t: r.timestampMs }));
}

function moments(values: { x: number; y: number }[]) {
  const mx = values.reduce((s, p) => s + p.x, 0) / values.length, my = values.reduce((s, p) => s + p.y, 0) / values.length;
  let xx = 0, yy = 0, xy = 0;
  for (const p of values) { xx += (p.x - mx) ** 2; yy += (p.y - my) ** 2; xy += (p.x - mx) * (p.y - my); }
  return { mx, my, xx, yy, xy };
}

export function rollingCorrelation(frame: AlignedFrame, x: string, y: string, count: number, minimum: number): Series {
  observationCount(count, "Window", 3, 1000);
  observationCount(minimum, "Minimum", 3, count);
  pairs(frame, x, y, 0, 0);
  return { kind: "series", name: `Correlation · ${count} rows`, unit: "correlation", points: frame.rows.map((row, i) => {
    const values = pairs(frame, x, y, Math.max(0, i - count + 1), i + 1);
    if (values.length < minimum) return { timestampMs: row.timestampMs, value: null, status: "warming", sampleCount: values.length };
    const m = moments(values), denominator = Math.sqrt(m.xx) * Math.sqrt(m.yy);
    return { timestampMs: row.timestampMs, value: denominator > 0 ? Math.max(-1, Math.min(1, m.xy / denominator)) : null, status: denominator > 0 ? "valid" : "undefined", sampleCount: values.length };
  }) };
}

/** Descriptive full-sample OLS; residuals are in-sample, never presented as forecasts. */
export function fitLinear(frame: AlignedFrame, x: string, y: string): { model: DataTable; residuals: Series } {
  const values = pairs(frame, x, y);
  if (values.length < 3) throw new Error("Regression needs at least three complete pairs.");
  const m = moments(values);
  if (m.xx === 0) throw new Error("Regression input X has zero variance.");
  const slope = m.xy / m.xx, intercept = m.my - slope * m.mx;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) throw new Error("Regression is numerically undefined. Rescale the input.");
  const fittedAt = frame.rows.at(-1)!.timestampMs;
  const residuals: Point[] = frame.rows.map(r => {
    const complete = r.values[x] != null && r.values[y] != null && r.statuses[x] === "valid" && r.statuses[y] === "valid";
    return { timestampMs: r.timestampMs, availableAtMs: fittedAt, value: complete ? r.values[y]! - (intercept + slope * r.values[x]!) : null, status: complete ? "valid" : r.statuses[x] !== "valid" ? r.statuses[x]! : r.statuses[y]! };
  });
  const sse = residuals.reduce((s, p) => s + (p.value ?? 0) ** 2, 0);
  const yUnit = frame.columns.find(c => c.key === y)!.unit ?? "value", xUnit = frame.columns.find(c => c.key === x)!.unit ?? "value";
  const rows = [
    { statistic: "paired observations", value: values.length, unit: "count" },
    { statistic: "intercept", value: intercept, unit: yUnit },
    { statistic: "slope", value: slope, unit: `${yUnit} / ${xUnit}` },
    { statistic: "R squared (in sample)", value: m.yy > 0 ? 1 - sse / m.yy : null, unit: "ratio" },
    { statistic: "RMSE (in sample)", value: Math.sqrt(sse / values.length), unit: yUnit },
  ];
  return { model: { kind: "table", columns: [{ key: "statistic", label: "Statistic", type: "string" }, { key: "value", label: "Value", type: "number" }, { key: "unit", label: "Unit", type: "string" }], rows }, residuals: { kind: "series", name: "OLS residuals · in sample", unit: yUnit, points: residuals } };
}

export function arithmeticSeries(frame: AlignedFrame, x: string, y: string, operation: string): Series {
  pairs(frame, x, y, 0, 0);
  const a = frame.columns.find(c => c.key === x)!, b = frame.columns.find(c => c.key === y)!;
  if (!["add", "subtract", "multiply", "divide"].includes(operation)) throw new Error("Unknown arithmetic operation.");
  if (["add", "subtract"].includes(operation) && a.unit !== b.unit) throw new Error("Addition and subtraction require matching units. Convert units upstream.");
  const unit = operation === "divide" ? a.unit === b.unit ? "ratio" : `${a.unit} / ${b.unit}` : operation === "multiply" ? `${a.unit} × ${b.unit}` : a.unit ?? "value";
  return { kind: "series", name: `${a.label} ${operation} ${b.label}`, unit, points: frame.rows.map(r => {
    const left = r.values[x], right = r.values[y];
    if (left == null || right == null) return { timestampMs: r.timestampMs, value: null, status: r.statuses[x] !== "valid" ? r.statuses[x]! : r.statuses[y]! };
    const value = operation === "add" ? left + right : operation === "subtract" ? left - right : operation === "multiply" ? left * right : right === 0 ? NaN : left / right;
    return { timestampMs: r.timestampMs, value: Number.isFinite(value) ? value : null, status: Number.isFinite(value) ? "valid" : "undefined" };
  }) };
}
