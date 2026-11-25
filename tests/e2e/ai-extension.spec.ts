import {
  chromium,
  expect,
  test,
  type CDPSession,
  type BrowserContext,
  type Worker,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type Node = { nodeId: number; attributes?: string[]; children?: Node[]; shadowRoots?: Node[] };

async function findShadowNode(cdp: CDPSession, selector: string): Promise<number> {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const find = (node: Node): Node | undefined => {
    const attributes = node.attributes ?? [];
    const index = attributes.indexOf("data-interlude");
    if (index >= 0 && attributes[index + 1] === "panel") return node;
    for (const child of node.children ?? []) {
      const result = find(child);
      if (result) return result;
    }
    return undefined;
  };
  const host = find(root as Node);
  if (!host?.shadowRoots?.[0]) throw new Error("Panel not found");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: host.shadowRoots[0].nodeId,
    selector,
  });
  if (!nodeId) throw new Error(`Missing ${selector}`);
  return nodeId;
}

async function callOn(cdp: CDPSession, selector: string, fn: string, args: unknown[] = []) {
  const nodeId = await findShadowNode(cdp, selector);
  const { object } = await cdp.send("DOM.resolveNode", { nodeId });
  return cdp.send("Runtime.callFunctionOn", {
    objectId: object.objectId!,
    functionDeclaration: fn,
    arguments: args.map((value) => ({ value })),
    returnByValue: true,
  });
}

let context: BrowserContext;
let worker: Worker;
test.afterEach(async () => context?.close());

test("extension Pong settings and focus indicator remain inside the generation panel", async () => {
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "interlude.settings.v2": {
        version: 2,
        global: { delayMs: 0, skipBoot: true, muted: true, updateChecks: false, autoClose: false },
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
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeHidden();
  await page.locator('[data-testid="send-button"]').click();
  await expect(host).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await callOn(
    cdp,
    'select[aria-label="Choose game"]',
    "function() { this.value='pong'; this.dispatchEvent(new Event('change',{bubbles:true})); }",
  );
  await expect(host).toHaveAttribute("data-interlude-game", "pong");
  await callOn(cdp, ".gear", "function() { this.click(); }");
  for (const [label, value] of [
    ["Pong CPU level", "hard"],
    ["Pong watch mode", "true"],
    ["Game speed", "400"],
  ]) {
    await callOn(
      cdp,
      `[aria-label="${label}"]`,
      "function(value) { this.value=value; this.dispatchEvent(new Event('change',{bubbles:true})); }",
      [value],
    );
  }
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const document = (await chrome.storage.sync.get("interlude.settings.v2"))[
          "interlude.settings.v2"
        ];
        return document?.sites?.claude;
      }),
    )
    .toMatchObject({ pongDifficulty: "hard", pongWatch: true, "game.pong.speed": 400 });
  await expect
    .poll(
      async () =>
        (await callOn(cdp, ".controls .caption", "function() { return this.textContent; }")).result
          .value,
    )
    .toBe("WATCH CPU / NO RECORDS");
  const drawerText = (await callOn(cdp, ".drawer", "function() { return this.textContent; }"))
    .result.value as string;
  expect(drawerText).not.toMatch(/two.player|player 2/i);
  await callOn(cdp, ".gear", "function() { this.click(); }");
  const focus = await callOn(
    cdp,
    "canvas",
    "function() { this.focus(); return getComputedStyle(this).outlineStyle; }",
  );
  expect(focus.result.value).toBe("none");
  expect(
    (await callOn(cdp, ".focus-indicator", "function() { return this.hidden; }")).result.value,
  ).toBe(false);
  await page.keyboard.press("Escape");
  expect(
    (await callOn(cdp, ".focus-indicator", "function() { return this.hidden; }")).result.value,
  ).toBe(true);
  await cdp.detach();
});
