import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@goodnight/runtime-client": fileURLToPath(new URL("./packages/runtime-client/src/index.ts", import.meta.url)),
      "@goodnight/runtime-protocol": fileURLToPath(new URL("./packages/runtime-protocol/src/index.ts", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
          timeout: 10000,
        }
      : {
          timeout: 10000,
        },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // The desktop workbench already lazy-loads major pages; the remaining
    // initial chunk is expected to sit above Vite's web-default 500 kB limit.
    chunkSizeWarningLimit: 900,
  },
}));
