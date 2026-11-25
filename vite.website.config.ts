import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { surfaceGuard } from "./scripts/surface-guard";

const siteRoot = resolve(__dirname, "deployment");
const outDir = resolve(siteRoot, "web-dist");

export default defineConfig({
  root: siteRoot,
  base: "/",
  define: { __PLATFORM__: JSON.stringify("web") },
  publicDir: false,
  plugins: [
    surfaceGuard("web"),
    {
      name: "include-static-services-and-fonts",
      writeBundle() {
        // Copy only the intended public assets. The signing key and selector
        // source payload are deliberately not part of the website output.
        mkdirSync(outDir, { recursive: true });
        for (const directory of ["fonts", "selectors", "updates"]) {
          cpSync(resolve(siteRoot, directory), resolve(outDir, directory), { recursive: true });
        }
      },
    },
  ],
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2022",
    modulePreload: false,
  },
  server: { host: "0.0.0.0", allowedHosts: true },
  preview: { host: "0.0.0.0", allowedHosts: true },
});
