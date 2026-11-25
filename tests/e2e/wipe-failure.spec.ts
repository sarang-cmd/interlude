import { chromium, expect, test } from "@playwright/test";
import path from "node:path";

test("reports a partial wipe if Chrome sync fails and does not restore old settings locally", async () => {
  const extension = path.resolve("dist");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await worker.evaluate(async () => {
      await chrome.storage.sync.set({
        "interlude.settings.v2": {
          version: 2,
          global: { volume: 7, updateChecks: false },
          sites: {},
        },
      });
      await chrome.storage.local.set({ "interlude.highscores": { snake: 123 } });
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).hostname}/options.html`);
    await expect(page.getByRole("heading", { name: /OPERATOR/ })).toBeVisible();
    await page.evaluate(() => {
      chrome.storage.sync.clear = async () => {
        throw new Error("simulated sync failure");
      };
    });
    await page.getByRole("button", { name: /^DATA/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "WIPE EVERYTHING" }).click();
    await expect(page.getByRole("status")).toContainText("SYNC COULD NOT BE CLEARED");
    const state = await worker.evaluate(async () => ({
      local: await chrome.storage.local.get([
        "interlude.highscores",
        "interlude.settings.localPreferred",
        "interlude.settings.v2",
      ]),
      sync: await chrome.storage.sync.get("interlude.settings.v2"),
    }));
    expect(state.local["interlude.highscores"]).toBeUndefined();
    expect(state.local["interlude.settings.localPreferred"]).toBe(true);
    expect(state.local["interlude.settings.v2"]).toEqual({ version: 2, global: {}, sites: {} });
    expect(state.sync["interlude.settings.v2"].global.volume).toBe(7);
    await page.getByRole("button", { name: /^SOUND/ }).click();
    await expect(page.locator("#volume")).toHaveValue("35");
  } finally {
    await context.close();
  }
});
