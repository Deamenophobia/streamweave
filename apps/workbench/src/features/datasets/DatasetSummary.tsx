import type { Dataset } from "@streamweave/core";
import { displayTime } from "../../DataView";

export function DatasetSummary({
  dataset,
  useSource,
}: {
  dataset: Dataset;
  useSource: (dataset: Dataset) => void;
}) {
  const start = dataset.rows[0]?.timestampMs;
  const end = dataset.rows.at(-1)?.timestampMs;
  const time = (value: unknown) =>
    typeof value === "number" ? displayTime(value).replace(" UTC", "") : "—";
  return (
    <div className="dataset-summary">
      <div>
        <span>ROWS</span>
        <strong>{dataset.rows.length.toLocaleString()}</strong>
      </div>
      <div>
        <span>COLUMNS</span>
        <strong>{dataset.columns.length}</strong>
      </div>
      <div className="time-extent">
        <span>TIME RANGE · UTC</span>
        <strong>{time(start)}</strong>
        <small>to {time(end)}</small>
      </div>
      <button className="secondary-action" onClick={() => useSource(dataset)}>
        Use on canvas ↗
      </button>
    </div>
  );
}
