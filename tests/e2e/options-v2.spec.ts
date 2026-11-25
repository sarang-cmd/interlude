import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
let context: BrowserContext, page: Page, worker: Worker;
test.beforeEach(async () => {
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).hostname}/options.html`);
  await expect(page.getByRole("heading", { name: /OPERATOR/ })).toBeVisible();
});
test.afterEach(async () => {
  await context?.close();
});

test("search, per-site overrides, changed-only reset, key conflicts and the live preview", async () => {
  await expect(page.getByRole("button", { name: /CHATGPT.*BETA/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /GEMINI.*BETA/ })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search settings" });
  await page.getByRole("button", { name: "CLAUDE", exact: true }).click();
  await search.fill("scanline");
  await expect(page.getByText("Scanline strength", { exact: true })).toBeVisible();
  await page.locator("#scanlineStrength").fill("48");
  await page.locator("#scanlineStrength").press("Tab");
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.sync.get("interlude.settings.v2"))["interlude.settings.v2"]?.sites
            ?.claude?.scanlineStrength,
      ),
    )
    .toBe(48);
  await page.getByLabel("ONLY CHANGED").check();
  await expect(page.getByText("Scanline strength", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset Scanline strength" }).click();
  await expect(page.getByText("Scanline strength", { exact: true })).toHaveCount(0);
  await page.getByLabel("ONLY CHANGED").uncheck();
  await search.fill("snake left");
  const key = page.locator('input[id="key.snake.left"]');
  await expect(key).toBeVisible();
  await key.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("ALREADY ASSIGNED");
  await page.keyboard.press("KeyQ");
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.sync.get("interlude.settings.v2"))["interlude.settings.v2"]?.sites
            ?.claude?.["key.snake.left"],
      ),
    )
    .toBe("KeyQ");
  await search.fill("default game");
  await page.selectOption("#game", "pong");
  const canvas = page.locator(".preview canvas");
  await expect(canvas).toHaveAttribute("data-game", "pong");
  await expect(canvas).toHaveAttribute("data-scene", /ready|boot/);
  await page.waitForTimeout(300);
  await canvas.click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.screenshot({ path: "test-results/options-v2.png" });
});

test("data screen exports, imports validated records, and confirms wipe", async () => {
  await page.getByRole("button", { name: /^DATA/ }).click();
  await expect(page.getByRole("heading", { name: "LAST 7 DAYS" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT JSON" }).click();
  const download = await downloadPromise;
  const file = path.resolve("test-results/settings-backup.json");
  await download.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(exported).toMatchObject({
    format: "interlude-backup",
    version: 1,
    settings: { version: 2 },
  });
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const backup = {
    format: "interlude-backup",
    version: 1,
    settings: {
      version: 2,
      global: { volume: 54, delayMs: -12 },
      sites: { gemini: { placement: "overlay" } },
    },
    local: {
      "interlude.highscores": { snake: 42, pong: -1 },
      "interlude.playStats": {
        version: 1,
        days: { [day]: { games: { snake: 120000 }, sessions: 1 } },
      },
    },
  };
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(page.getByRole("status")).toContainText("BACKUP IMPORTED");
  await expect(page.getByText("2 MIN TODAY", { exact: false })).toBeVisible();
  expect(
    await worker.evaluate(
      async () => (await chrome.storage.local.get("interlude.highscores"))["interlude.highscores"],
    ),
  ).toEqual({ snake: 42 });
  const saved = await worker.evaluate(
    async () => (await chrome.storage.sync.get("interlude.settings.v2"))["interlude.settings.v2"],
  );
  expect(saved.global.volume).toBe(54);
  expect(saved.global.delayMs).toBeUndefined();
  expect(saved.sites.gemini.placement).toBe("overlay");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "WIPE EVERYTHING" }).click();
  await expect(page.getByRole("status")).toContainText("WIPED");
  expect(
    (await worker.evaluate(() => chrome.storage.local.get("interlude.highscores")))[
      "interlude.highscores"
    ],
  ).toBeUndefined();
});
