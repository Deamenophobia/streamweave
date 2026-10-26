import { useRef } from "react";
import { datasetFileAccept } from "../../adapters/datasetFormats";
import type { ProjectActions } from "../../documents/contracts";

export type DatasetImportProps = {
  importFiles: ProjectActions["import"];
  importing: boolean;
};

export function DatasetImport({ importFiles, importing }: DatasetImportProps) {
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
        accept={datasetFileAccept}
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
