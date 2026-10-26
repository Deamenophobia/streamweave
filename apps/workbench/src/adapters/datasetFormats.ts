import { parseDataset, type Dataset } from "@streamweave/core";

export type DatasetFile = Pick<File, "name" | "size" | "text" | "arrayBuffer">;
export type DatasetReader = {
  extensions: readonly string[];
  read: (file: DatasetFile, id: string) => Promise<Dataset>;
};

// Register file readers here. Retrieval and UI actions stay outside this catalogue.
export const datasetReaders: readonly DatasetReader[] = (["csv", "json", "jsonl"] as const).map(
  (format) => ({
    extensions: [`.${format}`],
    read: async (file, id) => parseDataset(await file.text(), format, id, file.name.slice(0, 120)),
  }),
);

export const datasetFileAccept = datasetReaders.flatMap((reader) => reader.extensions).join(",");

export function datasetReaderFor(name: string): DatasetReader {
  const extension = `.${name.split(".").at(-1)?.toLowerCase()}`;
  const reader = datasetReaders.find((candidate) => candidate.extensions.includes(extension));
  if (!reader) {
    const supported = datasetReaders.flatMap((candidate) => candidate.extensions).join(", ");
    throw new Error(`Choose a supported dataset file: ${supported}.`);
  }
  return reader;
}
