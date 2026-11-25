import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "include-project-license",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "LICENSE",
          source: readFileSync(resolve(__dirname, "LICENSE"), "utf8"),
        });
      },
    },
  ],
  build: {
    modulePreload: false,
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/serviceWorker.ts"),
        "content-entry": resolve(__dirname, "src/content/main.ts"),
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
