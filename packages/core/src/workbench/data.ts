import { csvRows } from "../io.js";

export type Cell = string | number | null;
export interface Column { key: string; label: string; type: "number" | "string"; unit?: string }
export interface DataTable { kind: "table"; columns: Column[]; rows: Record<string, Cell>[] }
export interface Dataset extends DataTable { id: string; name: string }
export type ValueStatus = "valid" | "missing" | "warming" | "stale" | "undefined";
export interface Point { timestampMs: number; value: number | null; status: ValueStatus; availableAtMs?: number; sampleCount?: number }
export interface Series { kind: "series"; name: string; unit: string; points: Point[] }
export interface FrameRow { timestampMs: number; values: Record<string, number | null>; statuses: Record<string, ValueStatus> }
export interface AlignedFrame { kind: "frame"; columns: Column[]; rows: FrameRow[] }
export type DataValue = DataTable | Series | AlignedFrame;
export const MAX_ROWS = 20_000;
const identifier = (s: unknown, max = 120): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= max;

export function numeric(value: unknown, label: string, min = -1e12, max = 1e12): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a finite number from ${min} to ${max}.`);
  return value;
}

function time(value: unknown, label: string): number {
  let result = value;
  if (typeof value === "string" && value.trim()) {
    if (/^\d+$/.test(value)) result = Number(value);
    else if (/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) result = Date.parse(value);
  }
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 0 || result > 8.64e15) throw new Error(`${label} needs valid integer epoch milliseconds or an ISO timestamp with a timezone.`);
  return result;
}

/** Import generic timestamped tables. Direction and weight are not required. */
export function parseDataset(text: string, format: "csv" | "json" | "jsonl", id: string, name: string): Dataset {
  if (text.length > 5_000_000) throw new Error("Dataset exceeds 5 MB.");
  text = text.replace(/^\uFEFF/, "");
  let records: unknown;
  if (format === "csv") {
    const [header, ...rows] = csvRows(text);
    if (!header?.length || header.length > 40 || new Set(header).size !== header.length || header.some(k => !identifier(k))) throw new Error("CSV needs unique, non-empty column names (at most 40 columns).");
    records = rows.map((row, i) => {
      if (row.length !== header.length) throw new Error(`Row ${i + 2} has the wrong column count.`);
      return Object.fromEntries(header.map((key, j) => {
        const s = row[j]!.trim();
        return [key, s === "" ? null : /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(s) ? Number(s) : row[j]!];
      }));
    });
  } else if (format === "jsonl") records = text.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
  else records = JSON.parse(text);
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_ROWS) throw new Error(`Import 1 to ${MAX_ROWS.toLocaleString()} rows.`);
  const keys = new Set<string>();
  const rows = records.map((record, i) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`Row ${i + 1} must be an object.`);
    const entries = Object.entries(record as Record<string, unknown>);
    const row: Record<string, Cell> = Object.create(null);
    for (const [key, value] of entries) {
      if (!identifier(key) || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Invalid column name.");
      if (key === "timestamp" && !Object.hasOwn(record, "timestampMs")) continue;
      if (key === "timestampMs" || key === "availableAtMs") row[key] = time(value, `Row ${i + 1} ${key}`);
      else if (value === null || value === "") row[key] = null;
      else if (typeof value === "number") row[key] = numeric(value, key);
      else if (typeof value === "string" && value.length <= 1000) row[key] = value;
      else throw new Error(`Column ${key} must contain numbers, text, or null.`);
      keys.add(key);
    }
    row.timestampMs = time(record.timestampMs ?? record.timestamp, `Row ${i + 1} timestamp`);
    keys.add("timestampMs");
    if (typeof row.availableAtMs === "number" && row.availableAtMs < row.timestampMs) throw new Error("availableAtMs cannot precede timestampMs.");
    return row;
  });
  if (keys.size > 40) throw new Error("Datasets support at most 40 columns.");
  rows.sort((a, b) => Number(a.timestampMs) - Number(b.timestampMs));
  for (let i = 1; i < rows.length; i++) if (rows[i]!.timestampMs === rows[i - 1]!.timestampMs) throw new Error("Duplicate timestamps: aggregate or separate simultaneous observations before import.");
  const columns: Column[] = [...keys].map(key => {
    const kinds = new Set(rows.map(r => r[key]).filter(v => v != null).map(v => typeof v));
    if (kinds.size > 1) throw new Error(`Column ${key} mixes numbers and text.`);
    return { key, label: key, type: kinds.has("string") ? "string" : "number" };
  });
  for (const row of rows) for (const key of keys) row[key] ??= null;
  const data: Dataset = { id, name, kind: "table", columns, rows };
  validateDataset(data);
  return data;
}

export function validateDataset(data: Dataset): void {
  if (!data || !identifier(data.id) || !identifier(data.name) || data.kind !== "table" || !Array.isArray(data.columns) || !Array.isArray(data.rows)) throw new Error("Malformed dataset.");
  if (!data.rows.length || data.rows.length > MAX_ROWS || !data.columns.length || data.columns.length > 40) throw new Error("Dataset size exceeds limits.");
  const keys = new Set<string>();
  for (const c of data.columns) {
    if (!c || !identifier(c.key) || !identifier(c.label) || !["number", "string"].includes(c.type) || keys.has(c.key) || ["__proto__", "constructor", "prototype"].includes(c.key)) throw new Error("Malformed or duplicate dataset column.");
    if (c.unit !== undefined && (typeof c.unit !== "string" || c.unit.length > 60)) throw new Error("Invalid column unit.");
    keys.add(c.key);
  }
  if (!data.columns.some(c => c.key === "timestampMs" && c.type === "number")) throw new Error("Dataset requires numeric timestampMs.");
  if (keys.has("availableAtMs") && !data.columns.some(c => c.key === "availableAtMs" && c.type === "number")) throw new Error("availableAtMs must be numeric.");
  let previous = -1;
  for (const row of data.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Malformed row.");
    if (Object.keys(row).some(key => !keys.has(key))) throw new Error("Row contains an undeclared column.");
    const ts = time(row.timestampMs, "timestampMs");
    if (ts <= previous) throw new Error("Dataset timestamps must be unique and increasing.");
    previous = ts;
    if (row.availableAtMs != null && time(row.availableAtMs, "availableAtMs") < ts) throw new Error("availableAtMs cannot precede timestampMs.");
    for (const c of data.columns) {
      const value = row[c.key];
      if (value == null) continue;
      if (typeof value !== c.type) throw new Error(`Invalid value in ${c.key}.`);
      if (typeof value === "number") numeric(value, c.key, c.key.endsWith("AtMs") || c.key === "timestampMs" ? 0 : -1e12, c.key.endsWith("AtMs") || c.key === "timestampMs" ? Number.MAX_SAFE_INTEGER : 1e12);
      if (typeof value === "string" && value.length > 1000) throw new Error("Text cell exceeds 1,000 characters.");
    }
  }
}

export function selectSeries(table: DataTable | AlignedFrame, key: string, name: string, unit: string): Series {
  const column = table.columns.find(c => c.key === key);
  if (!column || column.type !== "number" || ["timestampMs", "availableAtMs"].includes(key)) throw new Error("Select a numeric value column.");
  if (table.kind === "frame") return { ...frameSeries(table)[table.columns.indexOf(column)]!, name: name || column.label, unit: unit || column.unit || "value" };
  if (!table.columns.some(c => c.key === "timestampMs" && c.type === "number")) throw new Error("A series requires a timestamped table; model coefficients are not a time series.");
  return { kind: "series", name: name || column.label, unit: unit || column.unit || "value", points: table.rows.map(row => {
    const value = row[key];
    return { timestampMs: Number(row.timestampMs), availableAtMs: Number(row.availableAtMs ?? row.timestampMs), value: typeof value === "number" ? value : null, status: typeof value === "number" ? "valid" : "missing" };
  }) };
}

export function dataRows(data: DataValue): Record<string, Cell>[] {
  if (data.kind === "table") return data.rows;
  if (data.kind === "series") return data.points.map(p => ({ timestampMs: p.timestampMs, availableAtMs: p.availableAtMs ?? p.timestampMs, measurement: data.name, value: p.value, unit: data.unit, status: p.status, sampleCount: p.sampleCount ?? null }));
  return data.rows.map(row => Object.fromEntries([["timestampMs", row.timestampMs], ...data.columns.flatMap(c => [[c.key, row.values[c.key] ?? null], [`${c.key}__status`, row.statuses[c.key] ?? "missing"]])])) as Record<string, Cell>[];
}

export function frameSeries(frame: AlignedFrame): Series[] {
  return frame.columns.map(c => ({ kind: "series", name: c.label, unit: c.unit ?? "value", points: frame.rows.map(r => ({ timestampMs: r.timestampMs, value: r.values[c.key] ?? null, status: r.statuses[c.key] ?? "missing" })) }));
}
