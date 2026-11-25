/** Conservative audit of the shipped MV3 files, not just TypeScript source. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { JSDOM } from "jsdom";

const root = path.resolve(process.argv[2] ?? "dist");
const hosts = ["https://claude.ai/*", "https://chatgpt.com/*", "https://gemini.google.com/*"];
const selectorUrl = "https://interlude-sepia.vercel.app/selectors/v1.json";
const updateUrl = "https://interlude-sepia.vercel.app/updates/latest.json";
const issueUrl = "https://github.com/sarang-cmd/interlude/issues/new";
const releasePrefix = "https://github.com/sarang-cmd/interlude/releases/download/v";
const violations = [];
let fetchCount = 0,
  selectorCalls = 0,
  updateCalls = 0,
  nativeForwardCount = 0;
let foundSelectorUrl = false,
  foundUpdateUrl = false;
function fail(file, text) {
  violations.push(`${file}: ${text}`);
}
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(dir, entry.name))
        : entry.isFile()
          ? [path.join(dir, entry.name)]
          : [],
    );
}
function sameSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every((item) => actual.includes(item))
  );
}
function allowedURL(url) {
  return (
    url === selectorUrl ||
    url === updateUrl ||
    url === issueUrl ||
    url.startsWith(releasePrefix) ||
    url.startsWith("http://www.w3.org/")
  );
}
function localResource(url) {
  return !!url && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url);
}
function validateCSS(file, text) {
  if (/@import\b/i.test(text)) fail(file, "CSS @import is forbidden");
  for (const match of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gis)) {
    const value = match[2].trim();
    if (!localResource(value) && !/^data:/i.test(value))
      fail(file, `external CSS resource: ${value}`);
  }
}
function ancestorFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isFunctionExpression(current) && current.name) return current.name.text;
    if (
      ts.isArrowFunction(current) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    )
      return current.parent.name.text;
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText();
  }
  return "";
}
function staticString(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = staticString(node.left),
      b = staticString(node.right);
    return a === null || b === null ? null : a + b;
  }
  return null;
}
function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) return staticString(node.argumentExpression);
  return null;
}
function forbiddenSink(name) {
  return new Set([
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "WebTransport",
    "RTCPeerConnection",
    "sendBeacon",
    "importScripts",
    "Worker",
    "SharedWorker",
    "eval",
    "Function",
  ]).has(name);
}
function auditJS(filename, contents) {
  const file = path.relative(root, filename),
    source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    const text = node.getText(source);
    if (ts.isStringLiteralLike(node)) {
      const value = node.text;
      if (value === selectorUrl) foundSelectorUrl = true;
      if (value === updateUrl) foundUpdateUrl = true;
      if (/^https?:\/\//i.test(value) && !allowedURL(value))
        fail(file, `unapproved absolute URL ${value}`);
    }
    if (ts.isTemplateExpression(node)) {
      const head = node.head.text;
      if (
        /^https?:\/\//i.test(head) &&
        !(
          head.startsWith(releasePrefix) ||
          head === `${issueUrl}?` ||
          (head === "https://" &&
            text.includes("profiles[site].host") &&
            ancestorFunction(node) === "tabs")
        )
      )
        fail(file, "unapproved dynamic absolute URL");
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteralLike(specifier) && !localResource(specifier.text))
        fail(file, `nonlocal module ${specifier.text}`);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      const extensionBootstrap =
        file === "content.js" &&
        arg?.getText(source) === 'chrome.runtime.getURL("content-entry.js")';
      if (!extensionBootstrap && (!arg || !ts.isStringLiteralLike(arg) || !localResource(arg.text)))
        fail(file, "dynamic import is not a static local module");
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const expression = node.expression;
      const name = ts.isIdentifier(expression) ? expression.text : propertyName(expression);
      if (name && forbiddenSink(name)) fail(file, `forbidden network/dynamic API ${name}`);
      if (name === "fetch") {
        fetchCount++;
        const args = node.arguments ?? [];
        const init = args[1];
        if (!(
          ts.isIdentifier(expression) &&
          ancestorFunction(node) === "fetchStaticJSON" &&
          args[0]?.getText(source) === "target.href" &&
          init &&
          ts.isObjectLiteralExpression(init)
        ))
          fail(file, "fetch outside the sole guarded transport");
        else {
          const fields = Object.fromEntries(
            init.properties
              .filter(ts.isPropertyAssignment)
              .map((p) => [p.name.getText(source), p.initializer.getText(source)]),
          );
          const expected = {
            method: '"GET"',
            mode: '"cors"',
            credentials: '"omit"',
            referrerPolicy: '"no-referrer"',
            redirect: '"error"',
            signal: "controller.signal",
          };
          if (
            !sameSet(Object.keys(fields), Object.keys(expected)) ||
            Object.entries(expected).some(([key, value]) => fields[key] !== value)
          )
            fail(file, "fetch is not the approved credential-free GET");
          let owner = node.parent;
          while (
            owner &&
            !(ts.isFunctionDeclaration(owner) && owner.name?.text === "fetchStaticJSON")
          )
            owner = owner.parent;
          const guard = owner?.getText(source) ?? "";
          if (
            ![
              "new URL(url)",
              'target.protocol !== "https:"',
              "target.username",
              "target.password",
              "target.search",
              "target.hash",
            ].every((part) => guard.includes(part))
          )
            fail(file, "transport URL guard is missing");
        }
      }
      if (ts.isIdentifier(expression) && expression.text === "fetchStaticJSON") {
        const arg = node.arguments?.[0]?.getText(source);
        if (
          ancestorFunction(node) === "runCheck" &&
          contents.includes("SELECTOR_CACHE_KEY") &&
          arg === "url"
        )
          selectorCalls++;
        else if (
          ancestorFunction(node) === "runCheck" &&
          contents.includes("UPDATE_URL") &&
          arg === "UPDATE_URL"
        )
          updateCalls++;
        else fail(file, "extra or unapproved JSON transport call");
      }
      if (
        propertyName(expression) === "apply" &&
        ts.isPropertyAccessExpression(expression) &&
        expression.expression.getText(source) === "nativeFetch"
      ) {
        if (
          file === "page-bridge.js" &&
          node.arguments?.map((a) => a.getText(source)).join(",") === "this,args"
        )
          nativeForwardCount++;
        else fail(file, "unexpected page-fetch forwarding");
      }
      if (
        name === "createElement" &&
        node.arguments?.[0] &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        /^(?:script|iframe|img|image|audio|video|source|object|embed)$/i.test(
          node.arguments[0].text,
        )
      )
        fail(file, `dynamic network element ${node.arguments[0].text}`);
      if (ts.isIdentifier(expression) && expression.text === "__vitePreload") {
        const deps = node.arguments?.[1]?.getText(source);
        if (deps !== "true ? [] : void 0" && deps !== "[]")
          fail(file, "nonempty Vite preload dependencies");
      }
    }
    if (ts.isIdentifier(node) && forbiddenSink(node.text))
      fail(file, `forbidden network/dynamic API reference ${node.text}`);
    if (ts.isIdentifier(node) && node.text === "fetchStaticJSON") {
      const parent = node.parent;
      const allowed =
        (ts.isFunctionDeclaration(parent) && parent.name === node) ||
        (ts.isCallExpression(parent) && parent.expression === node) ||
        ts.isImportSpecifier(parent) ||
        ts.isExportSpecifier(parent);
      if (!allowed) fail(file, "JSON transport alias or unapproved reference");
    }
    if (ts.isIdentifier(node) && node.text === "nativeFetch") {
      const parent = node.parent;
      const declaration =
        file === "page-bridge.js" &&
        ts.isVariableDeclaration(parent) &&
        parent.name === node &&
        parent.initializer?.getText(source) === "window.fetch";
      const forward =
        file === "page-bridge.js" &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        parent.name.text === "apply" &&
        ts.isCallExpression(parent.parent);
      if (!declaration && !forward) fail(file, "unapproved native fetch alias");
    }
    if (ts.isIdentifier(node) && node.text === "fetch") {
      const parent = node.parent;
      const allowedCall =
        ts.isCallExpression(parent) &&
        parent.expression === node &&
        ancestorFunction(parent) === "fetchStaticJSON";
      const bridgeProperty =
        file === "page-bridge.js" &&
        ts.isPropertyAccessExpression(parent) &&
        parent.name === node &&
        parent.expression.getText(source) === "window";
      if (!allowedCall && !bridgeProperty) fail(file, "fetch alias or unapproved reference");
    }
    if (ts.isElementAccessExpression(node) && propertyName(node) === "fetch")
      fail(file, "computed fetch access");
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ["src", "srcset", "href"].includes(propertyName(node.left))
    ) {
      const left = node.left.getText(source),
        right = node.right.getText(source);
      const vite = left === "link.href" && right === "dep" && contents.includes("__vitePreload");
      const exportDownload =
        file === "options.js" &&
        left === "link.href" &&
        right === "url" &&
        ancestorFunction(node) === "download";
      const issue =
        file === "diagnostics.js" &&
        left === 'byId("issue").href' &&
        right.startsWith("`https://github.com/sarang-cmd/interlude/issues/new?");
      if (!vite && !exportDownload && !issue)
        fail(file, `unapproved resource/navigation assignment ${left}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (!fs.existsSync(root)) {
  console.error(`Built privacy audit: ${root} does not exist; build first.`);
  process.exit(1);
}
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
} catch {
  console.error("Built privacy audit: missing or invalid manifest.json");
  process.exit(1);
}
if (manifest.manifest_version !== 3) fail("manifest.json", "expected MV3");
if (!sameSet(manifest.permissions, ["storage", "alarms"]))
  fail("manifest.json", "permissions must be exactly storage and alarms");
if (!sameSet(manifest.host_permissions, hosts))
  fail("manifest.json", "unexpected host permissions");
for (const key of ["optional_permissions", "optional_host_permissions", "externally_connectable"])
  if (manifest[key] && (Array.isArray(manifest[key]) ? manifest[key].length : true))
    fail("manifest.json", `${key} is forbidden`);
for (const script of manifest.content_scripts ?? [])
  if (!Array.isArray(script.matches) || script.matches.some((host) => !hosts.includes(host)))
    fail("manifest.json", "unexpected content-script matches");
for (const item of manifest.web_accessible_resources ?? [])
  if (!Array.isArray(item.matches) || item.matches.some((host) => !hosts.includes(host)))
    fail("manifest.json", "unexpected resource matches");
const analytics =
  /google-analytics|googletagmanager|mixpanel|segment\.io|amplitude\.com|sentry\.io|posthog|doubleclick|telemetry|analytics/i;
for (const filename of files(root)) {
  const file = path.relative(root, filename);
  if (!/\.(?:js|html|css)$/i.test(file)) continue;
  const contents = fs.readFileSync(filename, "utf8");
  if (analytics.test(contents)) fail(file, "analytics or telemetry marker");
  if (file.endsWith(".js")) auditJS(filename, contents);
  else if (file.endsWith(".css")) validateCSS(file, contents);
  else {
    const document = new JSDOM(contents).window.document;
    for (const node of document.querySelectorAll(
      "script[src],link[href],img[src],iframe[src],audio[src],video[src],source[src],object[data],embed[src]",
    )) {
      const value =
        node.getAttribute("src") ?? node.getAttribute("href") ?? node.getAttribute("data") ?? "";
      if (!localResource(value) && !/^data:/i.test(value)) fail(file, `external resource ${value}`);
    }
    for (const node of document.querySelectorAll("a[href]")) {
      const value = node.getAttribute("href") ?? "";
      if (!localResource(value) && value !== issueUrl && !value.startsWith("#"))
        fail(file, `unapproved user navigation ${value}`);
    }
    for (const style of document.querySelectorAll("style"))
      validateCSS(file, style.textContent ?? "");
  }
}
if (fetchCount !== 1) fail("bundle", `expected exactly one guarded fetch, found ${fetchCount}`);
if (selectorCalls !== 1 || updateCalls !== 1)
  fail(
    "bundle",
    `expected one selector and one release transport call, found ${selectorCalls}/${updateCalls}`,
  );
if (!foundSelectorUrl || !foundUpdateUrl) fail("bundle", "documented default endpoint missing");
if (nativeForwardCount > 1) fail("page-bridge.js", "more than one page-owned fetch forward");
if (violations.length) {
  console.error(
    `Built privacy audit failed (${violations.length}):\n${violations.map((v) => `  ${v}`).join("\n")}`,
  );
  process.exitCode = 1;
} else
  console.log(
    "Built privacy audit passed: exact permissions, no analytics, two guarded credential-free GET call sites.",
  );
