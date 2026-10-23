import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  resolve: { alias: { "@streamweave/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)) } },
  server: { strictPort: true },
});
