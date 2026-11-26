import { expect, test, type Locator } from "@playwright/test";
import { RACE_RECORDS_KEY } from "../../src/twoplayer/race-settings";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";

async function boardHash(canvas: Locator, player: 1 | 2): Promise<number> {
  return canvas.evaluate((node: HTMLCanvasElement, side) => {
    const x = side === 1 ? 70 : 388;
    const data = node.getContext("2d")!.getImageData(x, 85, 180, 155).data;
    let hash = 2166136261;
    for (const value of data) hash = Math.imul(hash ^ value, 16777619);
    return hash >>> 0;
  }, player);
}

async function selectRace(
  page: import("@playwright/test").Page,
  id: string,
  name: string,
): Promise<void> {
  const canvas = page.locator("#game-canvas");
  await page.getByRole("button", { name: `Select ${name}` }).click();
  await expect(canvas).toHaveAttribute("data-game", id);
  await expect(page.locator("#race-mode")).toBeEnabled();
  await page.locator("#race-mode").selectOption("local");
  await expect(page.locator("#local-race h4")).toContainText(name);
  await expect(canvas).toHaveAttribute("data-scene", "ready");
}

test("all seven original solo cabinets offer a real split-screen local race", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(SITE);
  const canvas = page.locator("#game-canvas");
  for (const [id, name] of [
    ["snake", "SNAKE"],
    ["breakout", "BREAKOUT"],
    ["flappy", "FLAPPY-STYLE FLYER"],
    ["twenty48", "2048"],
    ["blockfall", "BLOCKFALL"],
    ["rockfall", "ROCKFALL BELT"],
    ["dashline", "ENDLESS RUNNER"],
  ]) {
    await selectRace(page, id!, name!);
    await expect(page.locator("#local-race-controls")).toBeVisible();
    await expect(page.locator("#game-controls")).toBeHidden();
    await page.getByRole("button", { name: "START GAME" }).click();
    await expect(canvas).toHaveAttribute("data-scene", "playing");
    await expect(page.getByLabel("Live match score")).toContainText("GAME SECONDS");
  }
  expect(errors).toEqual([]);
});

test("a seeded 2048 race supports two keyboards, remaps, pause, results and separate records", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== SITE) external.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ twenty48: 123 })),
    WEB_SCORES_KEY,
  );
  await page.goto(SITE);
  await selectRace(page, "twenty48", "2048");
  const canvas = page.locator("#game-canvas");
  await page.getByLabel("Race player 1 name").fill("ANA");
  await page.getByLabel("Race player 1 name").press("Tab");
  await page.getByLabel("Race player 2 name").fill("BO");
  await page.getByLabel("Race player 2 name").press("Tab");
  await page.getByLabel("Race series length").selectOption("1");
  await page.getByLabel("Round length").selectOption("30");
  const p2up = page.getByLabel("Player 2 slide up key");
  await p2up.focus();
  await page.keyboard.press("w");
  await expect(page.locator("#local-race")).toContainText("Each action needs a different key");
  await expect(p2up).toHaveValue("ArrowUp");
  await page.keyboard.press("i");
  await expect(p2up).toHaveValue("KeyI");
  await page.locator("#game-speed").selectOption("400");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await expect(page.getByLabel("Round length")).toBeDisabled();
  const before = [await boardHash(canvas, 1), await boardHash(canvas, 2)];
  await page.keyboard.down("a");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.up("a");
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(300);
  expect(await boardHash(canvas, 1)).not.toBe(before[0]);
  expect(await boardHash(canvas, 2)).not.toBe(before[1]);
  await page.keyboard.press("p");
  await expect(canvas).toHaveAttribute("data-scene", "paused");
  const paused = await page.getByLabel("Live match score").textContent();
  await page.waitForTimeout(400);
  expect(await page.getByLabel("Live match score").textContent()).toBe(paused);
  await page.keyboard.press("p");
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await expect(canvas).toHaveAttribute("data-scene", "gameover", { timeout: 18_000 });
  await expect(page.getByLabel("Round length")).toBeEnabled();
  await expect(page.locator("#local-race .local-history li")).toHaveCount(1);
  const records = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
    RACE_RECORDS_KEY,
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ game: "twenty48", names: ["ANA", "BO"], seed: 2026 });
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ twenty48: 123 });
  await page.getByRole("button", { name: "PLAY AGAIN" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  expect(external).toEqual([]);
});

test("both players have usable touch controls on a narrow screen", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(SITE);
  await selectRace(page, "twenty48", "2048");
  const canvas = page.locator("#game-canvas");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "START GAME" }).tap();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  const before = [await boardHash(canvas, 1), await boardHash(canvas, 2)];
  await page.getByRole("button", { name: "Player 1 slide left", exact: true }).tap();
  await page.getByRole("button", { name: "Player 2 slide right", exact: true }).tap();
  await page.waitForTimeout(400);
  expect(await boardHash(canvas, 1)).not.toBe(before[0]);
  expect(await boardHash(canvas, 2)).not.toBe(before[1]);
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await context.close();
});

test("two simultaneous touch points drive both race boards independently", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 1000 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(SITE);
    await selectRace(page, "twenty48", "2048");
    const canvas = page.locator("#game-canvas");
    await page.getByRole("button", { name: "START GAME" }).tap();
    await expect(canvas).toHaveAttribute("data-scene", "playing");
    const left = page.getByRole("button", { name: "Player 1 slide left", exact: true });
    const right = page.getByRole("button", { name: "Player 2 slide right", exact: true });
    await right.scrollIntoViewIfNeeded();
    const a = await left.boundingBox();
    const b = await right.boundingBox();
    if (!a || !b) throw new Error("Both touch controls must be visible");
    for (const box of [a, b]) {
      expect(box.x + box.width / 2).toBeGreaterThan(0);
      expect(box.x + box.width / 2).toBeLessThan(390);
      expect(box.y + box.height / 2).toBeGreaterThan(0);
      expect(box.y + box.height / 2).toBeLessThan(1000);
    }
    const before = [await boardHash(canvas, 1), await boardHash(canvas, 2)];
    await page.evaluate(() => {
      const trace: Array<{ type: string; id: number; pointerType: string }> = [];
      (window as unknown as { raceTouchTrace: typeof trace }).raceTouchTrace = trace;
      for (const label of ["Player 1 slide left", "Player 2 slide right"]) {
        const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
        for (const type of ["pointerdown", "pointerup"] as const)
          button.addEventListener(type, (event) =>
            trace.push({ type, id: event.pointerId, pointerType: event.pointerType }),
          );
      }
    });
    const cdp = await context.newCDPSession(page);
    const points = [
      { x: a.x + a.width / 2, y: a.y + a.height / 2, id: 1 },
      { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points });
    // Check while both contacts are still down, not after sequential taps.
    await expect.poll(() => boardHash(canvas, 1)).not.toBe(before[0]);
    await expect.poll(() => boardHash(canvas, 2)).not.toBe(before[1]);
    let trace = await page.evaluate(
      () =>
        (
          window as unknown as {
            raceTouchTrace: Array<{ type: string; id: number; pointerType: string }>;
          }
        ).raceTouchTrace,
    );
    expect(trace.filter((event) => event.type === "pointerdown")).toHaveLength(2);
    expect(new Set(trace.map((event) => event.id)).size).toBe(2);
    expect(trace.every((event) => event.pointerType === "touch")).toBe(true);
    expect(trace.some((event) => event.type === "pointerup")).toBe(false);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [points[1]!] });
    trace = await page.evaluate(
      () =>
        (
          window as unknown as {
            raceTouchTrace: Array<{ type: string; id: number; pointerType: string }>;
          }
        ).raceTouchTrace,
    );
    expect(trace.filter((event) => event.type === "pointerup")).toHaveLength(1);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect(canvas).toHaveAttribute("data-scene", "playing");
  } finally {
    await context.close();
  }
});
