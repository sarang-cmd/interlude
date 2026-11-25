import type { Plugin } from "vite";
import type { Platform } from "../src/platform";

const BUDGETS: Record<Platform, { total: number; chunk: number }> = {
  extension: { total: 1024 * 1024, chunk: 256 * 1024 },
  web: { total: 768 * 1024, chunk: 256 * 1024 },
};

/** Fail the extension build if any local-match module reaches a chunk. */
export function surfaceGuard(surface: Platform): Plugin {
  return {
    name: `interlude-surface-guard-${surface}`,
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((entry) => entry.type === "chunk");
      const moduleIds = new Set(chunks.flatMap((chunk) => Object.keys(chunk.modules)));
      const webOnly = [...moduleIds].filter((id) => {
        const path = id.replace(/\\/g, "/").split("?")[0]!;
        return path.includes("/src/twoplayer/") || /\.2p\.[cm]?[jt]sx?$/.test(path);
      });
      if (surface === "extension" && webOnly.length) {
        this.error(`Web-only modules in extension build: ${webOnly.join(", ")}`);
      }
      // This makes the isolation check non-vacuous: the web build must really
      // include the registry, while the extension must exclude that module.
      if (surface === "web" && !webOnly.some((id) => id.includes("/src/twoplayer/registry.ts"))) {
        this.error("Web mode registry missing from the website build");
      }
      // Vite emits dedicated worker bundles as assets, not Rollup chunks.
      // Count them too so the reported JavaScript budget covers shipped code.
      const sizes = Object.values(bundle)
        .filter((entry) => entry.type === "chunk" || entry.fileName.endsWith(".js"))
        .map((entry) => ({
          file: entry.fileName,
          bytes:
            entry.type === "chunk"
              ? Buffer.byteLength(entry.code)
              : Buffer.byteLength(entry.source),
        }));
      const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
      const largest = sizes.reduce((max, item) => Math.max(max, item.bytes), 0);
      const budget = BUDGETS[surface];
      if (total > budget.total || largest > budget.chunk) {
        this.error(`${surface} JavaScript budget exceeded: ${total} total, ${largest} largest`);
      }
      const report = {
        surface,
        javascriptBytes: total,
        largestChunkBytes: largest,
        budgets: budget,
        webOnlyModuleCount: webOnly.length,
        chunks: sizes,
      };
      this.emitFile({
        type: "asset",
        fileName: "bundle-report.json",
        source: JSON.stringify(report, null, 2),
      });
      console.log(
        `[${surface}] ${total} JS bytes, ${largest} largest chunk, ${webOnly.length} web-only modules`,
      );
    },
  };
}
