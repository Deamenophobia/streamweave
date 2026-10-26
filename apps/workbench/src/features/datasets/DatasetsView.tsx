import { useState } from "react";
import type { Dataset } from "@streamweave/core";
import { DataView } from "../../DataView";
import { csvExport } from "../../adapters/resultFormats";
import { downloadFile } from "../../platform/browserFiles";
import { DatasetImport, type DatasetImportProps } from "./DatasetImport";
import { DatasetSchema } from "./DatasetSchema";
import { DatasetSummary } from "./DatasetSummary";

type Props = DatasetImportProps & {
  datasets: Dataset[];
  id?: string;
  useSource: (dataset: Dataset) => void;
};

function DatasetDetails({ dataset, useSource }: Pick<Props, "useSource"> & { dataset: Dataset }) {
  const [tab, setTab] = useState<"preview" | "schema">("preview");
  return (
    <>
      <DatasetSummary dataset={dataset} useSource={useSource} />
      <div className="document-toolbar">
        <div className="view-tabs" role="tablist" aria-label="Dataset details">
          <button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
            Preview
          </button>
          <button role="tab" aria-selected={tab === "schema"} onClick={() => setTab("schema")}>
            Columns & units
          </button>
        </div>
        <button
          className="text-button"
          onClick={() => downloadFile(csvExport(dataset.id, dataset))}
        >
          Download CSV ↓
        </button>
      </div>
      <div className="dataset-preview">
        {tab === "preview" ? (
          <DataView key={dataset.id} data={dataset} />
        ) : (
          <DatasetSchema dataset={dataset} />
        )}
      </div>
    </>
  );
}

function DatasetUnavailable({ missing }: { missing: boolean }) {
  return (
    <div className="view-empty">
      <span>▤</span>
      <h2>{missing ? "Dataset unavailable" : "Bring your data into the workspace"}</h2>
      <p>
        {missing
          ? "Choose another dataset from the sidebar."
          : "Import CSV, JSON, or JSONL files. Each source stays independent until you connect it on the canvas."}
      </p>
    </div>
  );
}

export function DatasetsView({ datasets, id, importFiles, importing, useSource }: Props) {
  const dataset = datasets.find((dataset) => dataset.id === id) ?? (!id ? datasets[0] : undefined);
  return (
    <section className="document-view dataset-view" aria-label="Datasets view">
      <header className="view-heading">
        <div>
          <span className="tiny-label">DATASETS / SOURCE DATA</span>
          <h1>{dataset?.name ?? "Project datasets"}</h1>
          <p>Inspect a source before using it in a calculation.</p>
        </div>
        <DatasetImport importFiles={importFiles} importing={importing} />
      </header>
      {dataset ? (
        <DatasetDetails dataset={dataset} useSource={useSource} />
      ) : (
        <DatasetUnavailable missing={!!id} />
      )}
    </section>
  );
}
