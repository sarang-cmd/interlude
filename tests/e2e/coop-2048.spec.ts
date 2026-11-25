import { expect, test, type Page } from "@playwright/test";
import { COOP_RECORDS_KEY } from "../../src/twoplayer/coop-settings";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";

async function selectCoop(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Select 2048" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "twenty48");
  await expect(page.locator("#race-mode")).toBeEnabled();
  await page.locator("#race-mode").selectOption("coop");
  await expect(page.locator("#local-race h4")).toContainText("SHARED BOARD CO-OP");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
}

test("shared 2048 alternates turns, undoes a move and saves only a team result", async ({
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
  await selectCoop(page);
  const canvas = page.locator("#game-canvas");
  await page.getByLabel("Co-op player 1 name").fill("ANA");
  await page.getByLabel("Co-op player 1 name").press("Tab");
  await page.getByLabel("Co-op player 2 name").fill("BO");
  await page.getByLabel("Co-op player 2 name").press("Tab");
  await page.getByLabel("Co-op target tile").selectOption("128");
  await page.getByLabel("Co-op round length").selectOption("30");
  const p2up = page.getByLabel("Co-op player 2 slide up key");
  await p2up.focus();
  await page.keyboard.press("w");
  await expect(page.locator("#local-race")).toContainText("Each action needs a different key");
  await page.keyboard.press("i");
  await expect(p2up).toHaveValue("KeyI");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  const live = page.getByLabel("Co-op match status");
  const p1 = page.getByRole("button", { name: "Co-op player 1 slide left", exact: true });
  const p2 = page.getByRole("button", { name: "Co-op player 2 slide right", exact: true });
  await expect(live).toContainText("ANA MOVES NEXT");
  await expect(p1).toBeEnabled();
  await expect(p2).toBeDisabled();
  await expect(page.getByLabel("Co-op target tile")).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#local-race")).toContainText("ANA moves next.");
  await page.keyboard.press("a");
  await expect(live).toContainText("BO MOVES NEXT");
  await expect(p1).toBeDisabled();
  await expect(p2).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await expect(live).toContainText("ANA MOVES NEXT");
  await page.keyboard.press("q");
  await expect(live).toContainText("BO MOVES NEXT");
  await expect(live).toContainText("2 UNDOS");
  await page.locator("#game-speed").selectOption("400");
  await expect(canvas).toHaveAttribute("data-scene", "gameover", { timeout: 18_000 });
  await expect(page.getByLabel("Co-op target tile")).toBeEnabled();
  await expect(page.locator("#local-race .local-history li")).toHaveCount(1);
  const records = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
    COOP_RECORDS_KEY,
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ names: ["ANA", "BO"], seed: 2026, goal: 128, won: false });
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ twenty48: 123 });
  await page.getByRole("button", { name: "PLAY AGAIN" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  expect(external).toEqual([]);
});

test("shared 2048 gives each player an accessible touch turn on mobile", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(SITE);
  await selectCoop(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "START GAME" }).tap();
  const p1 = page.getByRole("button", { name: "Co-op player 1 slide left", exact: true });
  const p2 = page.getByRole("button", { name: "Co-op player 2 slide right", exact: true });
  await expect(p1).toBeEnabled();
  await expect(p2).toBeDisabled();
  await p1.tap();
  await expect(p2).toBeEnabled();
  await p2.tap();
  await expect(p1).toBeEnabled();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "playing");
  await context.close();
});
