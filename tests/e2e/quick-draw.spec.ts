import { expect, test } from "@playwright/test";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";
test("QUICK DRAW duel shares one cue, detects early presses and uses separate controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 380, height: 900 });
  await page.addInitScript((key) => {
    Math.random = () => 0.5;
    localStorage.setItem(key, JSON.stringify({ quickdraw: 123 }));
  }, WEB_SCORES_KEY);
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select QUICK DRAW", exact: true }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "quickdraw");
  await page.locator("#race-mode").selectOption("local");
  const first = page.getByRole("button", { name: "Player 1 draw", exact: true }),
    second = page.getByRole("button", { name: "Player 2 draw", exact: true });
  await expect(first).toBeDisabled();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(first).toBeEnabled();
  await first.click();
  await expect(page.locator("#game-announcement")).toContainText("PLAYER 2 WINS · P1 FALSE START");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover");
  await page.locator("#game-speed").selectOption("400");
  await page.getByRole("button", { name: "PLAY AGAIN" }).click();
  await expect(page.locator("#game-announcement")).toContainText("GO!", { timeout: 6000 });
  await second.click();
  await expect(page.locator("#game-announcement")).toContainText("PLAYER 2 WINS");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover");
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ quickdraw: 123 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
});
