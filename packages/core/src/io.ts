import { validateEvent, type StreamEvent } from "./pressure.js";
import { validatePipeline, type Pipeline } from "./graph.js";

/** CSV reader with quoted fields, escaped quotes, CRLF, and embedded newlines. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === '"' && field === "" && !closed) quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
      closed = false;
    } else {
      if (closed || c === '"') throw new Error("Malformed CSV quoting.");
      field += c;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

export function parseEvents(text: string, format: "json" | "jsonl" | "csv"): StreamEvent[] {
  if (text.length > 5_000_000) throw new Error("Recordings are limited to 5 MB.");
  text = text.replace(/^\uFEFF/, "");
  let rows: unknown[];
  if (format === "json") rows = JSON.parse(text) as unknown[];
  else if (format === "jsonl")
    rows = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line, i) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          throw new Error(`Invalid JSON on line ${i + 1}.`);
        }
      });
  else {
    const [header, ...records] = csvRows(text);
    const required = ["id", "stream", "timestampMs", "direction", "weight"];
    if (
      !header ||
      new Set(header).size !== header.length ||
      required.some((key) => !header.includes(key))
    )
      throw new Error(`CSV requires columns: ${required.join(", ")}; value is optional.`);
    rows = records.map((record, i) => {
      if (record.length !== header.length)
        throw new Error(`CSV row ${i + 2} has the wrong number of columns.`);
      const fields = Object.fromEntries(header.map((name, index) => [name, record[index]!]));
      if (["timestampMs", "direction", "weight"].some((key) => !fields[key]?.trim()))
        throw new Error(`CSV row ${i + 2} has an empty numeric field.`);
      return {
        id: fields.id,
        stream: fields.stream,
        timestampMs: Number(fields.timestampMs),
        direction: Number(fields.direction),
        weight: Number(fields.weight),
        ...(fields.value?.trim() ? { value: Number(fields.value) } : {}),
      };
    });
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 20_000)
    throw new Error("Import 1 to 20,000 events.");
  const ids = new Set<string>();
  return rows.map((row, i) => {
    try {
      validateEvent(row as StreamEvent);
    } catch (e) {
      throw new Error(`Event ${i + 1}: ${(e as Error).message}`);
    }
    const event = row as StreamEvent,
      key = JSON.stringify([event.stream, event.id]);
    if (ids.has(key)) throw new Error(`Duplicate event id in stream ${event.stream}: ${event.id}`);
    ids.add(key);
    return {
      id: event.id,
      stream: event.stream,
      timestampMs: event.timestampMs,
      direction: event.direction,
      weight: event.weight,
      ...(event.value !== undefined ? { value: event.value } : {}),
    };
  });
}

export function parsePipeline(text: string): Pipeline {
  if (text.length > 100_000) throw new Error("Pipeline file exceeds 100 KB.");
  const graph = JSON.parse(text) as Pipeline;
  const errors = validatePipeline(graph);
  if (errors.length) throw new Error(errors.join(" "));
  return graph;
}

export function toCsv(rows: readonly Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? "" : String(value);
    // Text cells starting with formulas are escaped for spreadsheet viewers.
    const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return (
    [
      keys.map(escape).join(","),
      ...rows.map((row) => keys.map((key) => escape(row[key])).join(",")),
    ].join("\n") + "\n"
  );
}
