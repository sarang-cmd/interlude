import { expect, test, type Page } from "@playwright/test";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";

async function choose(page: Page): Promise<void> {
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select TIC-TAC-TOE" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "tictactoe");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
}

async function playCell(page: Page, index: number, touch = false, occupied = false): Promise<void> {
  const canvas = page.locator("#game-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Game canvas not visible");
  const x = box.x + ((191 + ((index % 3) + 0.5) * 86) / 640) * box.width;
  const y = box.y + ((49 + (Math.floor(index / 3) + 0.5) * 86) / 360) * box.height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;
  await expect(page.locator("#game-announcement")).toContainText(
    occupied ? "That square is occupied" : `played row ${row}, column ${column}`,
  );
}

test("website CPU uses its real local worker and remembers the chosen difficulty", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const workers: string[] = [];
  const errors: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await choose(page);
  await expect(page.locator("#tictactoe-ai option")).toHaveCount(5);
  await expect(page.locator("#race-mode option")).toHaveCount(3);
  await page.locator("#tictactoe-ai").selectOption("veteran");
  await page.getByRole("button", { name: "START GAME" }).click();
  await page.keyboard.press("Space");
  await expect(page.locator("#game-announcement")).toContainText("CPU / O played", {
    timeout: 7000,
  });
  await expect(page.locator("#game-announcement")).toContainText("using search");
  expect(
    workers.some((url) => new URL(url).origin === SITE && /search-worker-.*\.js/.test(url)),
  ).toBe(true);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#game-announcement")).toContainText("Selected row 1, column 2");
  await page.keyboard.press("p");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
  const paused = await page.locator("#game-announcement").textContent();
  await page.waitForTimeout(350);
  expect(await page.locator("#game-announcement").textContent()).toBe(paused);
  await page.keyboard.press("p");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "playing");
  await page.reload();
  await page.getByRole("button", { name: "Select TIC-TAC-TOE" }).click();
  await expect(page.locator("#tictactoe-ai")).toHaveValue("veteran");
  expect(errors).toEqual([]);
});

test("two Veteran CPUs finish a watch match without touching human scores", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ tictactoe: 777 })),
    WEB_SCORES_KEY,
  );
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await choose(page);
  await page.locator("#tictactoe-ai").selectOption("veteran");
  await page.locator("#race-mode").selectOption("watch");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
  await expect(page.locator("#game-controls button")).toHaveCount(0);
  await page.locator("#game-speed").selectOption("400");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover", {
    timeout: 15_000,
  });
  await expect(page.locator("#game-announcement")).toContainText("DRAW");
  expect(workers.filter((url) => /search-worker-.*\.js/.test(url)).length).toBeGreaterThanOrEqual(
    5,
  );
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ tictactoe: 777 });
  await page.reload();
  await page.getByRole("button", { name: "Select TIC-TAC-TOE" }).click();
  await expect(page.locator("#race-mode")).toHaveValue("watch");
  await expect(page.locator("#tictactoe-ai")).toHaveValue("veteran");
});

test("a stalled worker is terminated on pause and the game falls back without locking up", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.addInitScript(() => {
    class StalledWorker extends EventTarget {
      constructor() {
        super();
        document.documentElement.dataset.workers = String(
          Number(document.documentElement.dataset.workers ?? 0) + 1,
        );
      }
      postMessage(): void {}
      terminate(): void {
        document.documentElement.dataset.terminations = String(
          Number(document.documentElement.dataset.terminations ?? 0) + 1,
        );
      }
    }
    window.Worker = StalledWorker as unknown as typeof Worker;
  });
  await choose(page);
  await page.getByRole("button", { name: "START GAME" }).click();
  await page.keyboard.press("Space");
  await expect.poll(() => page.locator("html").getAttribute("data-workers")).toBe("1");
  await page.keyboard.press("p");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
  await expect.poll(() => page.locator("html").getAttribute("data-terminations")).toBe("1");
  const frozen = await page.locator("#game-announcement").textContent();
  await page.waitForTimeout(300);
  expect(await page.locator("#game-announcement").textContent()).toBe(frozen);
  await page.keyboard.press("p");
  await expect(page.locator("#game-announcement")).toContainText("using fallback", {
    timeout: 5000,
  });
  expect(
    Number(await page.locator("html").getAttribute("data-terminations")),
  ).toBeGreaterThanOrEqual(2);
});

test("a focused gamepad navigates and places a mark", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => {
        const action = document.querySelector<HTMLCanvasElement>("#game-canvas")?.dataset.testPad;
        return [
          {
            connected: true,
            axes: [action === "left" ? -1 : 0, 0],
            buttons: Array.from({ length: 16 }, (_, index) => ({
              pressed: action === "mark" && index === 0,
            })),
          },
        ];
      },
    });
  });
  await choose(page);
  await page.getByRole("button", { name: "START GAME" }).click();
  const canvas = page.locator("#game-canvas");
  await canvas.evaluate((element: HTMLCanvasElement) => (element.dataset.testPad = "left"));
  await expect(page.locator("#game-announcement")).toContainText("Selected row 2, column 1");
  await canvas.evaluate((element: HTMLCanvasElement) => (element.dataset.testPad = "mark"));
  await expect(page.locator("#game-announcement")).toContainText("row 2: X");
});

test.describe("same-device mobile hot-seat", () => {
  test.use({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
  test("takes turns on the shared board with taps, ends correctly and does not save a solo score", async ({
    page,
  }) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, JSON.stringify({ tictactoe: 456 })),
      WEB_SCORES_KEY,
    );
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    await choose(page);
    await page.locator("#race-mode").selectOption("local");
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
    await expect(page.locator("#tictactoe-settings")).toBeHidden();
    await expect(page.getByRole("button", { name: "Place mark" })).toBeVisible();
    await page.getByRole("button", { name: "START GAME" }).click();
    await playCell(page, 0, true);
    await playCell(page, 0, true, true);
    await expect(page.locator("#game-announcement")).toContainText("PLAYER 2 / O turn");
    for (const cell of [3, 1, 4, 2]) await playCell(page, cell, true);
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover");
    await expect(page.locator("#game-announcement")).toContainText("PLAYER 1 / X WINS");
    expect(workers).toEqual([]);
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
    ).toEqual({ tictactoe: 456 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });
});
