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
    viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  await worker.evaluate(
    async ({ day }) => {
      await chrome.storage.local.set({
        "interlude.playStats": {
          version: 1,
          days: { [day]: { games: { snake: 58500 }, sessions: 1 } },
        },
      });
      await chrome.storage.sync.set({
        "interlude.settings.v2": {
          version: 2,
          global: {
            delayMs: 0,
            game: "twenty48",
            skipBoot: true,
            muted: true,
            autoClose: false,
            budgetEnabled: true,
            budgetMinutes: 1,
            budgetLockout: true,
            updateChecks: false,
          },
          sites: {},
        },
      });
    },
    { day },
  );
});
test.afterEach(async () => {
  await context.close();
});
async function open(site: "chatgpt" | "gemini"): Promise<Page> {
  const host = site === "chatgpt" ? "chatgpt.com" : "gemini.google.com";
  const tab = await context.newPage();
  const html = fs.readFileSync(`test/fixtures/${site}/conversation.html`, "utf8");
  await tab.route(`https://${host}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await tab.goto(`https://${host}/chat/concurrent`);
  await expect(tab.locator('[data-interlude="panel"]')).toHaveCount(1);
  await tab.locator('[data-testid="send-button"]').click();
  await expect(tab.locator('[data-interlude="panel"]')).toBeVisible();
  return tab;
}
async function startGame(tab: Page): Promise<void> {
  const panel = tab.locator('[data-interlude="panel"]');
  const box = (await panel.boundingBox())!;
  await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panel).toHaveAttribute("data-interlude-scene", "playing");
}
test("concurrent tabs merge active play and enforce a shared budget without losing increments", async () => {
  const first = await open("chatgpt");
  const second = await open("gemini");
  await startGame(first);
  await startGame(second);
  await expect(first.locator('[data-interlude="panel"]')).toHaveAttribute(
    "data-interlude-scene",
    "locked",
    { timeout: 7000 },
  );
  await expect(second.locator('[data-interlude="panel"]')).toHaveAttribute(
    "data-interlude-scene",
    "locked",
    { timeout: 7000 },
  );
  const readDay = async () => {
    const stats = await worker.evaluate(
      async () => (await chrome.storage.local.get("interlude.playStats"))["interlude.playStats"],
    );
    return Object.values(stats.days)[0] as { games: Record<string, number>; sessions: number };
  };
  await expect.poll(async () => (await readDay()).games.twenty48).toBeGreaterThanOrEqual(1500);
  await expect.poll(async () => (await readDay()).sessions).toBe(3);
  const day = await readDay();
  expect(day.games.snake).toBe(58500);
  expect(day.games.twenty48).toBeLessThan(6000);
});
