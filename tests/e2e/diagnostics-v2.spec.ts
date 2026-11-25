import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
let context: BrowserContext, worker: Worker;
test.beforeEach(async () => {
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1400, height: 950 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "interlude.settings.v2": {
        version: 2,
        global: { delayMs: 0, skipBoot: true, muted: true, autoClose: false, updateChecks: false },
        sites: {},
      },
    }),
  );
});
test.afterEach(async () => {
  await context.close();
});

test("options diagnostics inspect all three site adapters and share only clean reports", async () => {
  const hosts = [
    { site: "claude", host: "claude.ai", fixture: "idle" },
    { site: "chatgpt", host: "chatgpt.com", fixture: "conversation" },
    { site: "gemini", host: "gemini.google.com", fixture: "conversation" },
  ] as const;
  const pages: Page[] = [];
  const secret = "SECRET_CONVERSATION_9481";
  for (const entry of hosts) {
    const tab = await context.newPage();
    pages.push(tab);
    const html = fs.readFileSync(`test/fixtures/${entry.site}/${entry.fixture}.html`, "utf8");
    await tab.route(`https://${entry.host}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: html }),
    );
    await tab.goto(`https://${entry.host}/chat/${secret}`);
    await expect(tab.locator('[data-interlude="panel"]')).toHaveCount(1);
    await tab.evaluate((value) => {
      document.title = value;
      const p = document.createElement("p");
      p.textContent = value;
      document.body.append(p);
    }, secret);
    await tab.locator('[data-testid="send-button"]').click();
    await expect(tab.locator('[data-interlude="panel"]')).toBeVisible();
  }
  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).hostname}/options.html`);
  await options.getByRole("button", { name: /^DIAGNOSTICS/ }).click();
  const embedded = options.frameLocator('iframe[title="Live diagnostics"]');
  await expect(embedded.locator("#tab option")).toHaveCount(3);
  for (const { site } of hosts) {
    const option = embedded.locator("#tab option").filter({ hasText: site.toUpperCase() });
    await embedded.locator("#tab").selectOption((await option.getAttribute("value"))!);
    await expect(embedded.locator("#phase")).toHaveText(/GENERATING|FINISHING/);
    await expect(embedded.locator("#selectorSite")).toHaveValue(site);
    await expect(embedded.locator("#theme")).toHaveText(/LIGHT|DARK/);
    await expect(embedded.locator("#source")).toHaveText("BUNDLED");
    await expect(embedded.locator("#timeline li").first()).toBeVisible();
    await expect(embedded.locator("#selectorRows tr").first()).toBeVisible();
  }
  // Free-form selectors and page content must never enter a copied or linked report.
  const text = await embedded.locator("#editor").inputValue();
  const edited = JSON.parse(text) as { stopControl: string[] };
  edited.stopControl.push(`[data-test='${secret}']`);
  await embedded.locator("#editor").fill(JSON.stringify(edited, null, 2));
  await embedded.locator("#save").click();
  await expect(embedded.locator("#editorStatus")).toContainText("APPLIED");
  await expect(embedded.locator("#source")).toHaveText("LOCAL OVERRIDE");
  const frame = options.frames().find((item) => item.url().includes("diagnostics.html"))!;
  await frame.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (globalThis as typeof globalThis & { copied: string }).copied = text;
        },
      },
    });
  });
  await embedded.locator("#copyReport").click();
  await expect(embedded.locator("#copyStatus")).toContainText("COPIED");
  const copied = await frame.evaluate(
    () => (globalThis as typeof globalThis & { copied: string }).copied,
  );
  expect(copied).toContain("Adapter: gemini");
  expect(copied).toContain("Browser:");
  expect(copied).toContain("Selector matches");
  expect(copied).not.toContain(secret);
  const link = new URL((await embedded.locator("#issue").getAttribute("href"))!);
  expect(link.hostname).toBe("github.com");
  expect(link.searchParams.get("body")).toContain("Adapter: gemini");
  expect(link.searchParams.get("body")).not.toContain(secret);
  await expect(embedded.locator("#remoteStatus")).toContainText("OFF");
});
