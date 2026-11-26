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
