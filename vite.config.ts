import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/serviceWorker.ts"),
        content: resolve(__dirname, "src/content/main.ts"),
        popup: resolve(__dirname, "src/popup/popup.ts"),
        options: resolve(__dirname, "src/options/options.ts"),
        diagnostics: resolve(__dirname, "src/diagnostics/diagnostics.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  publicDir: "public",
});
