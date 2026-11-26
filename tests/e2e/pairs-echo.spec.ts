import { expect, test, type Page } from "@playwright/test";
import { PairsBoard } from "../../src/games/pairs/logic";
import { RNG } from "../../src/shared/rng";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";
async function tapCard(page: Page, index: number): Promise<void> {
  const canvas = page.locator("#game-canvas"),
    box = await canvas.boundingBox();
  if (!box) throw new Error("Missing canvas");
  await page.touchscreen.tap(
    box.x + ((192 + ((index % 4) + 0.5) * 64) / 640) * box.width,
    box.y + ((49 + (Math.floor(index / 4) + 0.5) * 64) / 360) * box.height,
  );
}
test.use({ viewport: { width: 320, height: 850 }, isMobile: true, hasTouch: true });
test("PAIRS alternates on mismatches and keeps a turn after a match", async ({ page }) => {
  await page.addInitScript((key) => {
    Math.random = () => 0.2;
    localStorage.setItem(key, JSON.stringify({ pairs: 999 }));
  }, WEB_SCORES_KEY);
  const cards = new PairsBoard(new RNG((0.2 * 0xffffffff) >>> 0)).cards;
  const match = cards.findIndex((card, i) => i > 0 && card === cards[0]);
  const first = cards.findIndex((_, i) => i !== 0 && i !== match);
  const second = cards.findIndex((card, i) => i !== 0 && i !== match && card !== cards[first]);
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select PAIRS", exact: true }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "pairs");
  await page.locator("#race-mode").selectOption("local");
  await page.getByRole("button", { name: "START GAME" }).click();
  await tapCard(page, 0);
  await expect(page.locator("#game-announcement")).toContainText("Choose another card");
  await tapCard(page, match);
  await expect(page.locator("#game-announcement")).toContainText("PLAYER 1 1, PLAYER 2 0");
  await expect(page.locator("#game-announcement")).toContainText("PLAYER 1 turn");
  await tapCard(page, first);
  await tapCard(page, second);
  await expect(page.locator("#game-announcement")).toContainText("Not a pair");
  await expect(page.locator("#game-announcement")).toContainText("PLAYER 2 turn");
  await expect(page.locator("#game-announcement")).toContainText("Cards hidden again");
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ pairs: 999 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("ECHO local mode repeats and extends before determining a winner", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ echo: 321 })),
    WEB_SCORES_KEY,
  );
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select ECHO", exact: true }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "echo");
  await page.locator("#race-mode").selectOption("local");
  await page.getByRole("button", { name: "START GAME" }).click();
  const status = page.locator("#game-announcement");
  await page.getByRole("button", { name: "Echo up", exact: true }).click();
  await expect(status).toContainText("Player 2, repeat 0 of 1");
  await page.getByRole("button", { name: "Echo up", exact: true }).click();
  await expect(status).toContainText("Player 2, add a signal");
  await page.getByRole("button", { name: "Echo right", exact: true }).click();
  await expect(status).toContainText("Player 1, repeat 0 of 2");
  await page.getByRole("button", { name: "Echo up", exact: true }).click();
  await expect(status).toContainText("1 of 2");
  await page.getByRole("button", { name: "Echo left", exact: true }).click();
  await expect(status).toContainText("PLAYER 2 WINS");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover");
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ echo: 321 });
});
