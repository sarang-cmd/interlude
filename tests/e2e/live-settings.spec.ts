import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
  type CDPSession,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
let context: BrowserContext, page: Page, worker: Worker;
type DomNode = {
  nodeId: number;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
};
test.beforeEach(async () => {
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
        global: {
          delayMs: 5000,
          preload: "none",
          skipBoot: true,
          muted: true,
          autoClose: false,
          updateChecks: false,
        },
        sites: {},
      },
    }),
  );
  page = await context.newPage();
  const html = fs.readFileSync("test/fixtures/chatgpt/conversation.html", "utf8");
  await page.route("https://chatgpt.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await page.goto("https://chatgpt.com/chat/live-settings");
  await expect(page.locator('[data-interlude="panel"]')).toHaveCount(1);
});
test.afterEach(async () => {
  await context.close();
});
const set = (patch: Record<string, unknown>) =>
  worker.evaluate(async (patch) => {
    const doc = (await chrome.storage.sync.get("interlude.settings.v2"))["interlude.settings.v2"];
    Object.assign(doc.global, patch);
    await chrome.storage.sync.set({ "interlude.settings.v2": doc });
  }, patch);
const diagnostic = () =>
  worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
    return chrome.tabs.sendMessage(tab!.id!, { type: "INTERLUDE_DIAGNOSTICS" });
  });
async function shadowAttr(
  client: CDPSession,
  selector: string,
  attribute: string,
): Promise<string | null> {
  const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: true });
  const find = (node: DomNode): DomNode | undefined => {
    const attrs = node.attributes ?? [],
      index = attrs.indexOf("data-interlude");
    if (index >= 0 && attrs[index + 1] === "panel") return node;
    for (const child of node.children ?? []) {
      const result = find(child);
      if (result) return result;
    }
  };
  const host = find(root as DomNode)!;
  const { nodeId } = await client.send("DOM.querySelector", {
    nodeId: host.shadowRoots![0]!.nodeId,
    selector,
  });
  const { attributes } = await client.send("DOM.getAttributes", { nodeId });
  const index = attributes.indexOf(attribute);
  return index < 0 ? null : attributes[index + 1]!;
}

test("preload and pending reveal delay change without a tab reload", async () => {
  expect((await diagnostic()).panel.gameId).toBe("");
  await set({ game: "pong" });
  await page.waitForTimeout(150);
  expect((await diagnostic()).panel.gameId).toBe("");
  await set({ preload: "last" });
  await expect.poll(async () => (await diagnostic()).panel.gameId).toBe("pong");
  await page.locator('[data-testid="send-button"]').click();
  const panel = page.locator('[data-interlude="panel"]');
  await expect(panel).toBeHidden();
  await set({ delayMs: 0 });
  await expect(panel).toBeVisible({ timeout: 3000 });
});

test("first-response policy and host theme update while the panel is running", async () => {
  await set({ delayMs: 0 });
  await page.locator('[data-testid="send-button"]').click();
  const panel = page.locator('[data-interlude="panel"]');
  await expect(panel).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await expect.poll(() => shadowAttr(cdp, ".machine", "data-theme")).toBe("light");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect.poll(() => shadowAttr(cdp, ".machine", "data-theme")).toBe("dark");
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect(panel).toHaveAttribute("data-interlude-scene", "paused");
  await page.locator('[data-testid="send-button"]').click();
  await expect.poll(async () => (await diagnostic()).generating).toBe(true);
  await set({ firstMessageOnly: true });
  await expect(panel).toBeHidden();
  await set({ firstMessageOnly: false });
  await expect(panel).toBeVisible();
  await cdp.detach();
});
