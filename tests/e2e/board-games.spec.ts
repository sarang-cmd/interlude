import { expect, test, type Page } from "@playwright/test";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";
async function select(page: Page, name: string, id: string): Promise<void> {
  await page.getByRole("button", { name: `Select ${name}`, exact: true }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", id);
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
}
async function boardTap(page: Page, x: number, y: number, touch = false): Promise<void> {
  const canvas = page.locator("#game-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not visible");
  const px = box.x + (x / 640) * box.width,
    py = box.y + (y / 360) * box.height;
  if (touch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

test("both new boards use real local CPU workers and share a persisted difficulty", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const workers: string[] = [],
    errors: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(SITE);
  for (const [name, id, x, y] of [
    ["DROP FOUR", "dropfour", 320, 220],
    ["FLIP DISC", "flipdisc", 304, 129],
  ] as const) {
    await select(page, name, id);
    await expect(page.locator("#board-ai option")).toHaveCount(5);
    await page.locator("#board-ai").selectOption("veteran");
    await page.getByRole("button", { name: "START GAME" }).click();
    await boardTap(page, x, y);
    await expect(page.locator("#game-announcement")).toContainText("CPU played", { timeout: 7000 });
    await expect(page.locator("#game-announcement")).toContainText("using search");
    await page.keyboard.press("p");
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
  }
  expect(workers.filter((url) => /search-worker-.*\.js/.test(url)).length).toBeGreaterThanOrEqual(
    2,
  );
  await page.reload();
  await select(page, "DROP FOUR", "dropfour");
  await expect(page.locator("#board-ai")).toHaveValue("veteran");
  expect(errors).toEqual([]);
});

test.describe("shared board on a small touch screen", () => {
  test.use({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
  test("DROP FOUR alternates, requires four, and leaves solo scores alone", async ({ page }) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, JSON.stringify({ dropfour: 345 })),
      WEB_SCORES_KEY,
    );
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    await page.goto(SITE);
    await select(page, "DROP FOUR", "dropfour");
    await page.locator("#race-mode").selectOption("local");
    await expect(page.locator("#board-ai-field")).toBeHidden();
    await expect(page.getByRole("button", { name: "Drop disc" })).toBeVisible();
    await page.getByRole("button", { name: "START GAME" }).click();
    for (const [turn, col] of [3, 2, 3, 2, 3, 2, 3].entries()) {
      await boardTap(page, 166 + (col + 0.5) * 44, 65, true);
      await expect(page.locator("#game-announcement")).toContainText(
        `${turn % 2 ? "PLAYER 2 / O" : "PLAYER 1 / X"} played`,
      );
      if (turn === 4)
        await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "playing");
    }
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover");
    await expect(page.locator("#game-announcement")).toContainText("PLAYER 1 / X WINS");
    expect(workers).toEqual([]);
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
    ).toEqual({ dropfour: 345 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });

  test("FLIP DISC flips captured discs with shared touch controls", async ({ page }) => {
    await page.goto(SITE);
    await select(page, "FLIP DISC", "flipdisc");
    await page.locator("#race-mode").selectOption("local");
    await page.getByRole("button", { name: "START GAME" }).click();
    await boardTap(page, 192 + 3.5 * 32, 49 + 2.5 * 32, true);
    await expect(page.locator("#game-announcement")).toContainText(
      "PLAYER 1 / X played row 3, column 4",
    );
    await expect(page.locator("#game-announcement")).toContainText("X 4, O 1");
    await boardTap(page, 192 + 2.5 * 32, 49 + 2.5 * 32, true);
    await expect(page.locator("#game-announcement")).toContainText(
      "PLAYER 2 / O played row 3, column 3",
    );
    await expect(page.locator("#game-announcement")).toContainText("X 3, O 3");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });
});
