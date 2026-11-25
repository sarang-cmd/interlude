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

const sites = [
  { id: "chatgpt", host: "chatgpt.com", turn: "[data-message-author-role='assistant']" },
  { id: "gemini", host: "gemini.google.com", turn: "model-response" },
] as const;
for (const site of sites) {
  test.describe(`${site.id} beta fixture`, () => {
    let context: BrowserContext, page: Page, worker: Worker;
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
            global: { delayMs: 0, skipBoot: true, muted: true, autoClose: false },
            sites: {},
          },
        }),
      );
      page = await context.newPage();
      const html = fs.readFileSync(`test/fixtures/${site.id}/conversation.html`, "utf8");
      await page.route(`https://${site.host}/**`, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: html }),
      );
      await page.goto(`https://${site.host}/chat/fixture`);
      await expect(page.locator('[data-interlude="panel"]')).toHaveCount(1);
    });
    test.afterEach(async () => {
      await context?.close();
    });
    async function diagnostic() {
      return worker.evaluate(async (host) => {
        const [tab] = await chrome.tabs.query({ url: `https://${host}/*` });
        return chrome.tabs.sendMessage(tab!.id!, { type: "INTERLUDE_DIAGNOSTICS" });
      }, site.host);
    }
    test("detects and anchors, freezes on completion, and tears down cleanly", async () => {
      const panel = page.locator('[data-interlude="panel"]');
      await expect(panel).toBeHidden();
      await page.locator('[data-testid="send-button"]').click();
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("data-interlude-scene", "ready");
      const next = await page.evaluate(() =>
        document
          .querySelector('[data-testid="thinking-indicator"]')
          ?.nextElementSibling?.getAttribute("data-interlude"),
      );
      expect(next).toBe("panel");
      const status = await diagnostic();
      expect(status.adapterId).toBe(site.id);
      expect(status.generating).toBe(true);
      expect(status.signals.a.active).toBe(true);
      expect(status.signals.b.active).toBe(true);
      await page.evaluate(() =>
        (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
      );
      await expect(panel).toHaveAttribute("data-interlude-scene", "paused");
      await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
      await expect(panel).toBeHidden();
      expect((await diagnostic()).activity.observers).toBe(0);
    });
    test("site override and regenerate switch take effect without reloading", async () => {
      const panel = page.locator('[data-interlude="panel"]');
      const setSite = (patch: Record<string, unknown>) =>
        worker.evaluate(
          async ({ id, patch }) => {
            const data = (await chrome.storage.sync.get("interlude.settings.v2"))[
              "interlude.settings.v2"
            ];
            data.sites[id] = { ...(data.sites[id] ?? {}), ...patch };
            await chrome.storage.sync.set({ "interlude.settings.v2": data });
          },
          { id: site.id, patch },
        );
      await setSite({ showOnRegenerate: false });
      await page.waitForTimeout(150);
      await page.locator('[data-testid="regenerate-button"]').click();
      await page.waitForTimeout(250);
      await expect(panel).toBeHidden();
      expect((await diagnostic()).state).toBe("idle");
      await page.evaluate(() =>
        (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
      );
      await setSite({ enabled: false, showOnRegenerate: true });
      await page.waitForTimeout(150);
      await page.locator('[data-testid="send-button"]').click();
      await page.waitForTimeout(200);
      await expect(panel).toBeHidden();
      await page.evaluate(() =>
        (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
      );
      await setSite({ enabled: true, signals: ["a"] });
      await page.waitForTimeout(150);
      await page.locator('[data-testid="regenerate-button"]').click();
      await expect(panel).toBeVisible();
      expect((await diagnostic()).reasons).toEqual(["A"]);
    });
    test("moves the original host when the assistant turn is replaced", async () => {
      const panel = page.locator('[data-interlude="panel"]');
      await page.locator('[data-testid="send-button"]').click();
      await expect(panel).toBeVisible();
      await page.evaluate(() =>
        (window as unknown as { fixture: { replace(): void } }).fixture.replace(),
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            document
              .querySelector('[data-testid="thinking-indicator"]')
              ?.nextElementSibling?.getAttribute("data-interlude"),
          ),
        )
        .toBe("panel");
      await expect(panel).toHaveCount(1);
    });
  });
}
