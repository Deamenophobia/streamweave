/** A format encoder produces bytes or text; delivery is a separate platform concern. */
export type ExportFile = {
  name: string;
  mediaType: string;
  content: string | Uint8Array<ArrayBuffer>;
};
