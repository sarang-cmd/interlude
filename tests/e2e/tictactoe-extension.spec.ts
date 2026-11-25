import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type CDPSession,
  type Worker,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type Node = { nodeId: number; attributes?: string[]; children?: Node[]; shadowRoots?: Node[] };
async function shadowNode(cdp: CDPSession, selector: string): Promise<number> {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const find = (node: Node): Node | undefined => {
    const index = (node.attributes ?? []).indexOf("data-interlude");
    if (index >= 0 && node.attributes?.[index + 1] === "panel") return node;
    for (const child of node.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  };
  const host = find(root as Node);
  if (!host?.shadowRoots?.[0]) throw new Error("Panel not found");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: host.shadowRoots[0].nodeId,
    selector,
  });
  return nodeId;
}
async function callOn(
  cdp: CDPSession,
  selector: string,
  fn: string,
  args: unknown[] = [],
): Promise<unknown> {
  const nodeId = await shadowNode(cdp, selector);
  if (!nodeId) throw new Error(`Missing ${selector}`);
  const { object } = await cdp.send("DOM.resolveNode", { nodeId });
  const reply = await cdp.send("Runtime.callFunctionOn", {
    objectId: object.objectId!,
    functionDeclaration: fn,
    arguments: args.map((value) => ({ value })),
    returnByValue: true,
  });
  return reply.result.value;
}

let context: BrowserContext;
let background: Worker;
let temporaryExtension: string | undefined;
test.afterEach(async () => {
  await context?.close();
  if (temporaryExtension) fs.rmSync(temporaryExtension, { recursive: true, force: true });
  temporaryExtension = undefined;
});

test("extension Tic-Tac-Toe uses a real local worker even with restrictive host CSP", async () => {
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  background = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await background.evaluate(() =>
    chrome.storage.sync.set({
      "interlude.settings.v2": {
        version: 2,
        global: {
          delayMs: 0,
          skipBoot: true,
          muted: true,
          updateChecks: false,
          autoClose: false,
          game: "tictactoe",
          tictactoeDifficulty: "veteran",
        },
        sites: {},
      },
    }),
  );
  const page = await context.newPage();
  const workers: string[] = [];
  const errors: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  const html = fs.readFileSync("test/fixtures/claude/idle.html", "utf8");
  await page.route("https://claude.ai/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: {
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'none'; worker-src 'none'",
      },
      body: html,
    }),
  );
  await page.goto("https://claude.ai/chat/idle");
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("data-interlude-game", "tictactoe");
  await expect(host).toHaveAttribute("data-interlude-scene", "ready");
  const cdp = await context.newCDPSession(page);
  await callOn(cdp, "canvas", "function() { this.focus(); }");
  await page.keyboard.press("Space");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.keyboard.press("Space");
  await expect
    .poll(() => callOn(cdp, ".announcement", "function() { return this.textContent; }"), {
      timeout: 7000,
    })
    .toContain("using search");
  expect(
    workers.some((url) => /^chrome-extension:\/\/[^/]+\/assets\/search-worker-.*\.js$/.test(url)),
  ).toBe(true);
  await expect.poll(() => shadowNode(cdp, "iframe")).toBe(0);
  await callOn(cdp, ".gear", "function() { this.click(); }");
  await callOn(
    cdp,
    '[aria-label="Tic-Tac-Toe watch mode"]',
    "function(value) { this.value=value; this.dispatchEvent(new Event('change',{bubbles:true})); }",
    ["true"],
  );
  await expect
    .poll(() => callOn(cdp, ".controls .caption", "function() { return this.textContent; }"))
    .toBe("WATCH CPU / NO RECORDS");
  await expect
    .poll(() =>
      background.evaluate(async () => {
        const doc = (await chrome.storage.sync.get("interlude.settings.v2"))[
          "interlude.settings.v2"
        ];
        return doc?.sites?.claude?.tictactoeWatch;
      }),
    )
    .toBe(true);
  const picker = String(
    await callOn(
      cdp,
      'select[aria-label="Choose game"]',
      "function() { return this.textContent; }",
    ),
  );
  expect(picker).not.toMatch(/two.players|shared board/i);
  expect(errors).toEqual([]);
  await cdp.detach();
});

test("pausing an extension match terminates a stalled dedicated worker", async () => {
  fs.mkdirSync("test-results", { recursive: true });
  temporaryExtension = fs.mkdtempSync(path.resolve("test-results/stalled-extension-"));
  fs.cpSync("dist", temporaryExtension, { recursive: true });
  const assets = path.join(temporaryExtension, "assets");
  const workerFile = fs.readdirSync(assets).find((name) => /^search-worker-.*\.js$/.test(name));
  if (!workerFile) throw new Error("Packaged search worker missing");
  // A test-only copy lets the real browser worker stay pending until pause.
  fs.writeFileSync(path.join(assets, workerFile), "globalThis.onmessage = () => {};");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1100, height: 900 },
    args: [
      `--disable-extensions-except=${temporaryExtension}`,
      `--load-extension=${temporaryExtension}`,
    ],
  });
  background = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await background.evaluate(() =>
    chrome.storage.sync.set({
      "interlude.settings.v2": {
        version: 2,
        global: {
          delayMs: 0,
          skipBoot: true,
          muted: true,
          updateChecks: false,
          autoClose: false,
          game: "tictactoe",
        },
        sites: {},
      },
    }),
  );
  const page = await context.newPage();
  const html = fs.readFileSync("test/fixtures/claude/idle.html", "utf8");
  await page.route("https://claude.ai/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await page.goto("https://claude.ai/chat/idle");
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("data-interlude-game", "tictactoe");
  const cdp = await context.newCDPSession(page);
  await callOn(cdp, "canvas", "function() { this.focus(); }");
  await page.keyboard.press("Space");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  const workerReady = page.waitForEvent("worker", { timeout: 5000 });
  await page.keyboard.press("Space");
  const worker = await workerReady;
  const closed = worker.waitForEvent("close", { timeout: 1500 });
  await page.keyboard.press("p");
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  await closed;
  await expect.poll(() => shadowNode(cdp, "iframe")).toBe(0);
  await cdp.detach();
});
