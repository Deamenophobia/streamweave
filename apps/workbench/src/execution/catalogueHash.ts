import catalogue from "../../../../protocol/modules.json?raw";

let hash: Promise<string> | undefined;
export function contractHash(): Promise<string> {
  hash ??= crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(catalogue.replace(/\r\n/g, "\n")))
    .then((bytes) =>
      Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join(""),
    );
  return hash;
}
