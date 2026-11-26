import { expect, test } from "@playwright/test";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";
const games = [
  { id: "snake", name: "SNAKE", control: "Steer up" },
  { id: "breakout", name: "BREAKOUT", control: "Launch" },
  { id: "flappy", name: "FLAPPY-STYLE FLYER", control: "Flap" },
  { id: "twenty48", name: "2048", control: "Slide left" },
  { id: "pong", name: "PONG", control: "Move up" },
  { id: "blockfall", name: "BLOCKFALL", control: "Rotate" },
  { id: "rockfall", name: "ROCKFALL BELT", control: "Fire" },
  { id: "dashline", name: "ENDLESS RUNNER", control: "Jump or hold to jump higher" },
  { id: "tictactoe", name: "NOUGHTS AND CROSSES", control: "Select left" },
  { id: "dropfour", name: "DROP FOUR", control: "Select left" },
  { id: "flipdisc", name: "FLIP DISC", control: "Select left" },
  { id: "drafts", name: "DRAFTS", control: "Select left" },
  { id: "dotsboxes", name: "DOTS AND BOXES", control: "Select right" },
  { id: "fleet", name: "FLEET", control: "Select right" },
  { id: "handsignals", name: "HAND SIGNALS", control: "Select right" },
] as const;

test("all games load, start, and respond to their on-screen controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== SITE) external.push(request.url());
  });
  await page.goto(SITE);
  const canvas = page.locator("#game-canvas");
  for (const game of games) {
    const choice = page.getByRole("button", { name: `Select ${game.name}`, exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(canvas).toHaveAttribute("data-game", game.id);
    await expect(canvas).toHaveAttribute("data-scene", "ready");
    await page.getByRole("button", { name: "START GAME", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-scene", "playing");
    const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
    await page.getByRole("button", { name: game.control, exact: true }).click();
    if (game.id === "twenty48") {
      // Either direction may be blocked by the initial random tiles, but both cannot be.
      await page.getByRole("button", { name: "Slide down", exact: true }).click();
    }
    await expect
      .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
      .not.toBe(before);
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("keyboard and buttons pause, resume, reset and switch games without trapping focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto(SITE);
  const canvas = page.locator("#game-canvas");
  await expect(canvas).toHaveAttribute("data-scene", "ready");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.keyboard.press("p");
  await expect(canvas).toHaveAttribute("data-scene", "paused");
  await page.keyboard.press("p");
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.getByRole("button", { name: "PAUSE", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-scene", "paused");
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.keyboard.press("Escape");
  await expect(canvas).not.toBeFocused();
  await page.getByRole("button", { name: "Reset game" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "ready");
  await page.getByRole("button", { name: "Select PONG" }).click();
  await expect(canvas).toHaveAttribute("data-game", "pong");
  await expect(canvas).toHaveAttribute("data-scene", "ready");
  const sound = page.getByRole("button", { name: "Turn sound on" });
  await sound.click();
  await expect(page.getByRole("button", { name: "Turn sound off" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Turn sound off" }).click();
  await expect(page.getByRole("button", { name: "Turn sound on" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("Pong offers five CPU levels, watch mode, speed choices and a focus marker without a screen border", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.addInitScript((key) => {
    Math.random = () => 0.2;
    localStorage.setItem(key, JSON.stringify({ pong: 123 }));
  }, WEB_SCORES_KEY);
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select PONG" }).click();
  const canvas = page.locator("#game-canvas");
  await expect(canvas).toHaveAttribute("data-game", "pong");
  await expect(page.locator("#pong-ai option")).toHaveCount(5);
  await expect(page.locator("#game-speed option")).toHaveCount(9);
  await page.locator("#pong-ai").selectOption("hard");
  await page.locator("#pong-adaptive").check();
  await page.locator("#pong-target").selectOption("1");
  await page.locator("#pong-mode").selectOption("watch");
  await expect(page.locator("#game-controls button")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-scene", "ready");
  await page.locator("#game-speed").selectOption("400");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await expect(page.locator("#game-focus")).toBeVisible();
  expect(await canvas.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
  await page.keyboard.press("Escape");
  await expect(page.locator("#game-focus")).toBeHidden();
  await expect(canvas).toHaveAttribute("data-scene", "gameover", { timeout: 20_000 });
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ pong: 123 });
  await page.reload();
  await page.getByRole("button", { name: "Select PONG" }).click();
  await expect(page.locator("#pong-ai")).toHaveValue("hard");
  await expect(page.locator("#pong-mode")).toHaveValue("watch");
  await expect(page.locator("#pong-adaptive")).toBeChecked();
  await expect(page.locator("#pong-target")).toHaveValue("1");
  await expect(page.locator("#game-speed")).toHaveValue("400");
  await page.locator("#pong-mode").selectOption("cpu");
  await expect(page.getByRole("button", { name: "Move up" })).toBeVisible();
});

test("a focused gamepad can start and control a game", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => {
        const action = document.querySelector<HTMLCanvasElement>("#game-canvas")?.dataset.testPad;
        return [
          {
            connected: true,
            axes: [action === "left" ? -1 : 0, action === "down" ? 1 : 0],
            buttons: Array.from({ length: 16 }, (_, i) => ({
              pressed: action === "start" && i === 0,
            })),
          },
        ];
      },
    });
  });
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select 2048" }).click();
  const canvas = page.locator("#game-canvas");
  await expect(canvas).toHaveAttribute("data-game", "twenty48");
  await canvas.focus();
  await canvas.evaluate((element: HTMLCanvasElement) => (element.dataset.testPad = "start"));
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await canvas.evaluate((element: HTMLCanvasElement) => (element.dataset.testPad = "left"));
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(before);
});

test("a completed run saves a website-only high score across reloads", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.addInitScript(() => {
    Math.random = () => 0.2;
  });
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select ENDLESS RUNNER" }).click();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator('#game-canvas[data-game="dashline"]')).toHaveAttribute(
    "data-scene",
    "gameover",
    { timeout: 20_000 },
  );
  const recorded = await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key) ?? "{}");
    return data.dashline as number | undefined;
  }, WEB_SCORES_KEY);
  expect(recorded).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole("button", { name: "Select ENDLESS RUNNER" }).click();
  await expect(page.locator("#game-high-score")).toHaveText(String(recorded).padStart(6, "0"));
});

test("a running game freezes offscreen and continues when scrolled back into view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select ENDLESS RUNNER" }).click();
  await page.getByRole("button", { name: "START GAME" }).click();
  const canvas = page.locator("#game-canvas");
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150); // Allow the intersection observer to stop the game loop.
  const frozen = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.waitForTimeout(350);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(frozen);
  await canvas.scrollIntoViewIfNeeded();
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(frozen);
});

test("the arcade stays playable if local storage is denied", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
  });
  await page.goto(SITE);
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "playing");
});

test.describe("touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("mobile players can select and start games with the on-screen controls", async ({
    page,
  }) => {
    await page.goto(SITE);
    await page.getByRole("button", { name: "Select FLAPPY-STYLE FLYER" }).tap();
    const canvas = page.locator("#game-canvas");
    await expect(canvas).toHaveAttribute("data-game", "flappy");
    await expect(canvas).toHaveAttribute("data-scene", "ready");
    await page.getByRole("button", { name: "Flap", exact: true }).tap();
    await expect(canvas).toHaveAttribute("data-scene", "playing");
    await page.getByRole("button", { name: "Select 2048" }).tap();
    await expect(canvas).toHaveAttribute("data-game", "twenty48");
    await page.getByRole("button", { name: "START GAME" }).tap();
    await expect(canvas).toHaveAttribute("data-scene", "playing");
    const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
    await page.getByRole("button", { name: "Slide left" }).tap();
    await page.getByRole("button", { name: "Slide down" }).tap();
    await expect
      .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
      .not.toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });
});
