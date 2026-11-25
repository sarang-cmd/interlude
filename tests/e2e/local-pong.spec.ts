import { expect, test, type Locator } from "@playwright/test";
import { LOCAL_PONG_RECORDS_KEY } from "../../src/twoplayer/pong-settings";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";

async function paddleCenter(canvas: Locator, x: number): Promise<number> {
  return canvas.evaluate((element: HTMLCanvasElement, column) => {
    const data = element.getContext("2d")!.getImageData(column, 35, 1, 310).data;
    let total = 0,
      count = 0;
    for (let row = 0; row < 310; row++) {
      if (data[row * 4]! > 70 && data[row * 4 + 1]! > 35) {
        total += row + 35;
        count++;
      }
    }
    return count ? total / count : -1;
  }, x);
}

test("local Pong supports simultaneous keys, remaps, a series, rematches and local-only records", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== SITE) external.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.addInitScript((key) => {
    Math.random = () => 0.2;
    localStorage.setItem(key, JSON.stringify({ pong: 123 }));
  }, WEB_SCORES_KEY);
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select PONG" }).click();
  const canvas = page.locator("#game-canvas");
  await expect(canvas).toHaveAttribute("data-game", "pong");
  await expect(page.locator('#pong-mode option[value="local"]')).toHaveCount(1);
  await page.locator("#pong-target").selectOption("1");
  await page.locator("#pong-mode").selectOption("local");
  await expect(page.locator("#local-pong")).toBeVisible();
  await expect(page.locator("#pong-ai-field")).toBeHidden();
  await page.getByLabel("Player 1 name").fill("ANA");
  await page.getByLabel("Player 1 name").press("Tab");
  await page.getByLabel("Player 2 name").fill("BO");
  await page.getByLabel("Player 2 name").press("Tab");
  await page.getByLabel("Series length").selectOption("1");

  const p2up = page.getByLabel("player 2 up key");
  await p2up.focus();
  await page.keyboard.press("w");
  await expect(page.locator("#local-pong")).toContainText("Each action needs a different key");
  await expect(p2up).toHaveValue("ArrowUp");
  await page.keyboard.press("i");
  await expect(p2up).toHaveValue("KeyI");
  await expect(page.locator("#local-pong")).toContainText("Key saved");

  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.waitForTimeout(1100);
  const before = [await paddleCenter(canvas, 8), await paddleCenter(canvas, 629)];
  expect(before[0]).toBeGreaterThan(0);
  expect(before[1]).toBeGreaterThan(0);
  await page.keyboard.down("w");
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(300);
  const after = [await paddleCenter(canvas, 8), await paddleCenter(canvas, 629)];
  await page.keyboard.up("w");
  await page.keyboard.up("ArrowDown");
  expect(after[0]!).toBeLessThan(before[0]! - 35);
  expect(after[1]!).toBeGreaterThan(before[1]! + 35);

  await page.locator("#game-speed").selectOption("400");
  await expect(canvas).toHaveAttribute("data-scene", "gameover", { timeout: 20_000 });
  await expect(page.locator("#local-pong .local-history li")).toHaveCount(1);
  await expect(page.locator("#local-pong")).toContainText(/wins the series/i);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ pong: 123 });
  const records = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
    LOCAL_PONG_RECORDS_KEY,
  );
  expect(records).toHaveLength(1);
  expect(records[0].names).toEqual(["ANA", "BO"]);
  await page.getByRole("button", { name: "PLAY AGAIN" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.locator("#pong-mode").selectOption("cpu");
  await expect(page.locator("#local-pong")).toBeHidden();
  await expect(page.getByRole("button", { name: "Move up" })).toBeVisible();
  expect(external).toEqual([]);
});

test("local Pong controls fit a narrow touch screen", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select PONG" }).tap();
  await page.locator("#pong-mode").selectOption("local");
  await expect(page.locator("#local-pong")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "START GAME" }).tap();
  const canvas = page.locator("#game-canvas");
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.waitForTimeout(1050);
  const before = await paddleCenter(canvas, 629);
  await page.getByRole("button", { name: "Player 2 move up" }).tap();
  await expect.poll(() => paddleCenter(canvas, 629)).toBeLessThan(before - 10);
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await context.close();
});
