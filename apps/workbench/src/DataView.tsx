import { useEffect, useMemo, useState } from "react";
import { dataRows, frameSeries, type DataValue, type Series } from "@streamweave/core";

export function displayNumber(value: number | null | undefined) {
  if (value == null) return "—";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e7 || (magnitude > 0 && magnitude < 1e-4)) return value.toExponential(4);
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
export const displayTime = (v: number) =>
  new Date(v).toISOString().replace("T", " ").replace(".000Z", " UTC");

function cellValue(column: string, value: string | number | null | undefined) {
  if (value == null) return <span className="null-cell">—</span>;
  if (column === "timestampMs" || column === "availableAtMs") return displayTime(Number(value));
  if (typeof value === "number") return displayNumber(value);
  return value;
}

function SeriesChart({ series }: { series: Series }) {
  const [cursor, setCursor] = useState(Math.max(0, series.points.length - 1));
  useEffect(() => setCursor(Math.max(0, series.points.length - 1)), [series]);
  const plot = useMemo(() => {
    const values = series.points.filter((p) => p.value !== null).map((p) => p.value!);
    let min = values.length ? Math.min(...values) : 0,
      max = values.length ? Math.max(...values) : 1;
    const padding = max === min ? Math.max(Math.abs(max) * 0.05, 1) : (max - min) * 0.08;
    min -= padding;
    max += padding;
    const start = series.points[0]?.timestampMs ?? 0,
      end = series.points.at(-1)?.timestampMs ?? start;
    const x = (timestamp: number) => 65 + (620 * (timestamp - start)) / Math.max(1, end - start);
    const y = (value: number) => 20 + ((max - value) / (max - min)) * 150;
    let pen = false;
    const d = series.points
      .map((p) => {
        if (p.value === null) {
          pen = false;
          return "";
        }
        const command = pen ? "L" : "M";
        pen = true;
        return `${command}${x(p.timestampMs).toFixed(2)},${y(p.value).toFixed(2)}`;
      })
      .join(" ");
    return { min, max, x, y, d, count: values.length };
  }, [series]);
  const point = series.points[cursor];
  return (
    <div className="series-plot">
      <div className="plot-heading">
        <strong>{series.name}</strong>
        <span>
          {series.unit} · {plot.count}/{series.points.length} valid
        </span>
      </div>
      <svg
        viewBox="0 0 710 200"
        role="img"
        aria-label={`${series.name} over time`}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect(),
            ratio = Math.max(
              0,
              Math.min(1, (((e.clientX - rect.left) / rect.width) * 710 - 65) / 620),
            );
          const t =
            (series.points[0]?.timestampMs ?? 0) +
            ratio *
              ((series.points.at(-1)?.timestampMs ?? 0) - (series.points[0]?.timestampMs ?? 0));
          let lo = 0,
            hi = series.points.length - 1;
          while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (series.points[mid]!.timestampMs < t) lo = mid + 1;
            else hi = mid;
          }
          if (
            lo > 0 &&
            Math.abs(series.points[lo - 1]!.timestampMs - t) <
              Math.abs(series.points[lo]!.timestampMs - t)
          )
            lo--;
          setCursor(lo);
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = plot.min + (plot.max - plot.min) * f;
          return (
            <g key={f}>
              <line className="grid-line" x1="65" x2="685" y1={plot.y(v)} y2={plot.y(v)} />
              <text x="58" y={plot.y(v) + 3} textAnchor="end">
                {displayNumber(v)}
              </text>
            </g>
          );
        })}
        <path className="output-path" d={plot.d} />
        {point && (
          <>
            <line
              className="cursor-line"
              x1={plot.x(point.timestampMs)}
              x2={plot.x(point.timestampMs)}
              y1="20"
              y2="170"
            />
            {point.value !== null && (
              <circle
                cx={plot.x(point.timestampMs)}
                cy={plot.y(point.value)}
                r="3.5"
                fill="#a5ecc8"
              />
            )}
          </>
        )}
        {series.points.length > 0 && (
          <>
            <text x="65" y="193">
              {displayTime(series.points[0]!.timestampMs)}
            </text>
            <text x="685" y="193" textAnchor="end">
              {displayTime(series.points.at(-1)!.timestampMs)}
            </text>
          </>
        )}
      </svg>
      <div className="point-readout">
        <span>{point ? displayTime(point.timestampMs) : "No observations"}</span>
        <strong>{displayNumber(point?.value)}</strong>
        <span className={`quality ${point?.status}`}>{point?.status ?? "empty"}</span>
        {point?.sampleCount !== undefined && <span>n = {point.sampleCount}</span>}
      </div>
      {series.points.length > 1 && (
        <input
          className="chart-cursor"
          type="range"
          aria-label={`Inspect ${series.name}`}
          min={0}
          max={series.points.length - 1}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
        />
      )}
      {point?.availableAtMs !== undefined && point.availableAtMs > point.timestampMs && (
        <p className="result-note">
          Available at {displayTime(point.availableAtMs)}. This value uses information from later
          than its observation time.
        </p>
      )}
    </div>
  );
}

export function DataView({ data, mode = "table" }: { data: DataValue; mode?: "chart" | "table" }) {
  const [page, setPage] = useState(0);
  const rows = useMemo(() => dataRows(data), [data]);
  useEffect(() => setPage(0), [data]);
  const columns = rows.length
    ? Object.keys(rows[0]!)
    : data.kind === "table"
      ? data.columns.map((c) => c.key)
      : [];
  if (mode === "chart" && data.kind !== "table")
    return (
      <div className="plot-group">
        {(data.kind === "series" ? [data] : frameSeries(data)).map((s, i) => (
          <SeriesChart key={i} series={s} />
        ))}
      </div>
    );
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  return (
    <div className="data-view">
      {data.kind === "frame" && (
        <div className="column-legend">
          {data.columns.map((c) => (
            <span key={c.key}>
              <b>{c.label}</b> · {c.unit} <small>{c.key}</small>
            </span>
          ))}
        </div>
      )}
      <div className="data-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 25, page * 25 + 25).map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td
                    key={c}
                    title={r[c] == null ? "Missing or undefined; see status" : String(r[c])}
                  >
                    {cellValue(c, r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="empty-state">No rows. Inspect filters and alignment settings.</p>
        )}
      </div>
      <div className="pagination">
        <span>
          {rows.length.toLocaleString()} rows · {columns.length} columns
        </span>
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          {page + 1} / {pages}
        </span>
        <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
