import { useRef, useState } from "react";
import type { Dataset } from "@streamweave/core";
import { DataView, displayTime } from "./DataView";
import { downloadCsv, type ProjectActions } from "./projectFiles";

type Props = {
  datasets: Dataset[];
  id?: string;
  importFiles: ProjectActions["import"];
  importing: boolean;
  useSource: (dataset: Dataset) => void;
};

function ImportButton({ importFiles, importing }: Pick<Props, "importFiles" | "importing">) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className="primary-action"
        disabled={importing}
        onClick={() => input.current?.click()}
      >
        {importing ? "Importing…" : "＋ Import datasets"}
      </button>
      <input
        ref={input}
        className="hidden"
        type="file"
        multiple
        accept=".csv,.json,.jsonl"
        aria-label="Import datasets"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) void importFiles(files);
        }}
      />
    </>
  );
}

export function DatasetsView({ datasets, id, importFiles, importing, useSource }: Props) {
  const [tab, setTab] = useState<"preview" | "schema">("preview");
  const dataset = datasets.find((dataset) => dataset.id === id) ?? (!id ? datasets[0] : undefined);
  const start = dataset?.rows[0]?.timestampMs;
  const end = dataset?.rows.at(-1)?.timestampMs;
  return (
    <section className="document-view dataset-view" aria-label="Datasets view">
      <header className="view-heading">
        <div>
          <span className="tiny-label">DATASETS / SOURCE DATA</span>
          <h1>{dataset?.name ?? "Project datasets"}</h1>
          <p>Inspect a source before using it in a calculation.</p>
        </div>
        <ImportButton importFiles={importFiles} importing={importing} />
      </header>
      {!dataset ? (
        <div className="view-empty">
          <span>▤</span>
          <h2>{id ? "Dataset unavailable" : "Bring your data into the workspace"}</h2>
          <p>
            {id
              ? "Choose another dataset from the sidebar."
              : "Import CSV, JSON, or JSONL files. Each source stays independent until you connect it on the canvas."}
          </p>
        </div>
      ) : (
        <>
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
              <strong>
                {typeof start === "number" ? displayTime(start).replace(" UTC", "") : "—"}
              </strong>
              <small>
                to {typeof end === "number" ? displayTime(end).replace(" UTC", "") : "—"}
              </small>
            </div>
            <button className="secondary-action" onClick={() => useSource(dataset)}>
              Use on canvas ↗
            </button>
          </div>
          <div className="document-toolbar">
            <div className="view-tabs" role="tablist" aria-label="Dataset details">
              <button
                role="tab"
                aria-selected={tab === "preview"}
                onClick={() => setTab("preview")}
              >
                Preview
              </button>
              <button role="tab" aria-selected={tab === "schema"} onClick={() => setTab("schema")}>
                Columns & units
              </button>
            </div>
            <button className="text-button" onClick={() => downloadCsv(dataset.id, dataset)}>
              Download CSV ↓
            </button>
          </div>
          <div className="dataset-preview">
            {tab === "preview" ? (
              <DataView key={dataset.id} data={dataset} />
            ) : (
              <div className="data-view schema-table">
                <div className="data-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Type</th>
                        <th>Unit</th>
                        <th>Missing cells</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataset.columns.map((column) => (
                        <tr key={column.key}>
                          <td>{column.label}</td>
                          <td>{column.type}</td>
                          <td>{column.unit ?? "—"}</td>
                          <td>{dataset.rows.filter((row) => row[column.key] == null).length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="result-note">
                  Assign a value column and unit on each source module. The imported dataset remains
                  reusable.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
