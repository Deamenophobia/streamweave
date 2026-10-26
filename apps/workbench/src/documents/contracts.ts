export type ProjectActions = {
  save: () => void;
  download: () => void;
  open: (file: File) => Promise<void>;
  import: (files: File[]) => Promise<void>;
};
