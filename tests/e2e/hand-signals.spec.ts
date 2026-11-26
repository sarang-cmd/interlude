import { expect, test } from "@playwright/test";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";

test("HAND SIGNALS persists Lizard Spock and permits secret hand-offs", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ handsignals: 987 })),
    WEB_SCORES_KEY,
  );
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select HAND SIGNALS", exact: true }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "handsignals");
  await expect(page.locator("#board-ai option")).toHaveCount(5);
  await page.locator("#hand-mode").selectOption("extended");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game-announcement")).toContainText("Lizard Spock is on");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Select right" }).click();
  await expect(page.locator("#game-announcement")).toContainText("Selected SPOCK");
  await page.getByRole("button", { name: "Choose signal" }).click();
  await expect(page.locator("#game-announcement")).toContainText("YOU chose SPOCK. CPU chose");
  await page.locator("#race-mode").selectOption("local");
  await expect(page.locator("#board-ai-field")).toBeHidden();
  await page.getByRole("button", { name: "START GAME" }).click();
  const announcement = page.locator("#game-announcement");
  await expect(announcement).toContainText("privacy screen");
  await page.getByRole("button", { name: "Choose signal" }).click();
  await page.getByRole("button", { name: "Select right" }).click();
  await expect(announcement).toContainText("Selected PAPER");
  await page.getByRole("button", { name: "Choose signal" }).click();
  await expect(announcement).toContainText("PLAYER 2");
  await expect(announcement).not.toContainText("PAPER");
  await page.getByRole("button", { name: "Choose signal" }).click();
  await expect(announcement).not.toContainText("PAPER");
  await page.getByRole("button", { name: "Choose signal" }).click();
  await expect(announcement).toContainText("PLAYER 1 PAPER");
  await expect(announcement).toContainText("PLAYER 2 ROCK");
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ handsignals: 987 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.reload();
  await page.getByRole("button", { name: "Select HAND SIGNALS", exact: true }).click();
  await expect(page.locator("#hand-mode")).toHaveValue("extended");
});

test("HAND SIGNALS covers private choices on pause and hiding, and a completed local match never writes solo scores", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ handsignals: 987 })),
    WEB_SCORES_KEY,
  );
  await page.goto(SITE);
  await page.evaluate((scoreKey) => {
    const original = Storage.prototype.setItem;
    (window as unknown as { scoreWrites: number }).scoreWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === scoreKey) (window as unknown as { scoreWrites: number }).scoreWrites++;
      return original.call(this, key, value);
    };
  }, WEB_SCORES_KEY);
  await page.getByRole("button", { name: "Select HAND SIGNALS", exact: true }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "handsignals");
  await page.locator("#race-mode").selectOption("local");
  await page.getByRole("button", { name: "START GAME" }).click();
  const status = page.locator("#game-announcement");
  const canvas = page.locator("#game-canvas");
  const choose = page.getByRole("button", { name: "Choose signal" });
  for (let round = 0; round < 5; round++) {
    await expect(status).toContainText("Pass the device to PLAYER 1");
    await choose.click();
    await page.getByRole("button", { name: "Select right" }).click();
    await expect(status).toContainText("Selected PAPER");
    if (round === 0) {
      await page.keyboard.press("p");
      await expect(canvas).toHaveAttribute("data-scene", "paused");
      await expect(status).toContainText("privacy screen");
      await expect(status).not.toContainText("PAPER");
      await page.keyboard.press("p");
      await expect(canvas).toHaveAttribute("data-scene", "playing");
      await expect(status).toContainText("privacy screen");
      await choose.click();
      await expect(status).toContainText("Selected PAPER");
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(status).toContainText("privacy screen");
      await expect(status).not.toContainText("PAPER");
      await page.evaluate(() => {
        Reflect.deleteProperty(document, "hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await choose.click();
      await expect(status).toContainText("Selected PAPER");
    }
    await choose.click(); // Commit PAPER, then hand off to player two.
    await expect(status).toContainText("Pass the device to PLAYER 2");
    await expect(status).not.toContainText("PAPER");
    await choose.click(); // Reveal the second player's choices.
    await choose.click(); // ROCK loses to PAPER.
    await expect(status).toContainText("PLAYER 1 PAPER");
    await expect(status).toContainText(`Score PLAYER 1 ${round + 1}, PLAYER 2 0`);
    if (round < 4) await choose.click();
  }
  await expect(canvas).toHaveAttribute("data-scene", "gameover");
  await expect(status).toContainText("PLAYER 1 WINS");
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ handsignals: 987 });
  expect(
    await page.evaluate(() => (window as unknown as { scoreWrites: number }).scoreWrites),
  ).toBe(0);
});
