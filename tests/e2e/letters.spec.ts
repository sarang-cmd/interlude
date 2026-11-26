import { expect, test, type Page } from "@playwright/test";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";
async function chooseLetters(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Select LETTERS", exact: true }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "letters");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
}
async function tapLetter(page: Page, index: number): Promise<void> {
  const canvas = page.locator("#game-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not visible");
  const x = 180 + (index % 7) * 40 + 20;
  const y = 142 + Math.floor(index / 7) * 40 + 20;
  await page.touchscreen.tap(box.x + (x / 640) * box.width, box.y + (y / 360) * box.height);
}

test("LETTERS offers general, study and validated session-only custom lists", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== SITE) external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(SITE);
  await chooseLetters(page);
  const list = page.getByLabel("LETTERS word list"),
    textarea = page.getByLabel("Paste your word list"),
    status = page.locator("#game-announcement"),
    canvas = page.locator("#game-canvas");
  await expect(list).toHaveValue("general");
  await expect(list.locator("option")).toHaveCount(3);
  await list.selectOption("study");
  await expect(page.locator("#letters-list")).toContainText("STUDY list ready");
  await list.selectOption("custom");
  await textarea.fill("bad word");
  await page.getByRole("button", { name: "APPLY LIST" }).click();
  await expect(page.locator("#letters-list")).toContainText("2–24 letters A–Z");
  await textarea.fill("abba\nABBA");
  await page.getByRole("button", { name: "APPLY LIST" }).click();
  await expect(page.locator("#letters-list")).toContainText("CUSTOM list ready: 1 word");
  await expect(textarea).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain(
    "ABBA",
  );
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(status).toContainText("Word: _ _ _ _");
  await page.getByRole("button", { name: "Guess letter" }).click();
  await expect(status).toContainText("Word: A _ _ A");
  await page.getByRole("button", { name: "Guess letter" }).click();
  await expect(status).toContainText("already guessed");
  await expect(status).toContainText("6 guesses left");
  await page.getByRole("button", { name: "Select letter right" }).click();
  await page.getByRole("button", { name: "Guess letter" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "gameover");
  await expect(status).toContainText("WORD FOUND / ABBA");
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
    )
    .toMatchObject({ letters: 1900 });
  await list.selectOption("study");
  await expect(status).toContainText("WORD FOUND / ABBA");
  await page.getByRole("button", { name: "PLAY AGAIN" }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await expect(status).toContainText("Guess the word");
  await expect(status).not.toContainText("ABBA");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("private same-device word match on touch", () => {
  test.use({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
  test("uses a masked input and privacy hand-off without writing a solo record", async ({
    page,
  }) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, JSON.stringify({ letters: 875 })),
      WEB_SCORES_KEY,
    );
    await page.goto(SITE);
    await chooseLetters(page);
    await page.locator("#race-mode").selectOption("local");
    await expect(page.locator("#game-description")).toContainText("hidden word");
    await expect(page.locator("#letters-list")).toBeHidden();
    const input = page.getByLabel("Hidden word"),
      status = page.locator("#game-announcement");
    await expect(input).toBeHidden();
    await page.getByRole("button", { name: "START GAME" }).click();
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("type", "password");
    await input.fill("bad word");
    await page.getByRole("button", { name: "SET WORD" }).click();
    await expect(page.locator("#local-race")).toContainText("2–24 letters A to Z");
    await input.fill("BEE");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(input).toHaveValue("");
    await page.evaluate(() => {
      Reflect.deleteProperty(document, "hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await input.fill("BEE");
    await page.getByRole("button", { name: "SET WORD" }).click();
    await expect(input).toBeHidden();
    await expect(input).toHaveValue("");
    await expect(status).toContainText("privacy screen");
    await expect(status).not.toContainText("BEE");
    expect(await page.evaluate(() => document.body.innerText)).not.toContain("BEE");
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain(
      "BEE",
    );
    await tapLetter(page, 1); // Reveal only; the hand-off tap must not also guess.
    await expect(status).toContainText("Word: _ _ _");
    await tapLetter(page, 1);
    await expect(status).toContainText("Word: B _ _");
    await page.keyboard.press("p");
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
    await expect(status).toContainText("privacy screen");
    await page.keyboard.press("p");
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "playing");
    await expect(status).toContainText("privacy screen");
    await tapLetter(page, 4);
    await expect(status).toContainText("Word: B _ _");
    await tapLetter(page, 4);
    await expect(status).toContainText("WORD FOUND / BEE");
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover");
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
    ).toEqual({ letters: 875 });
    await page.getByRole("button", { name: "PLAY AGAIN" }).click();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });
});

test("starting LETTERS with Space does not consume the first guess", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto(SITE);
  await chooseLetters(page);
  await page.getByLabel("LETTERS word list").selectOption("custom");
  await page.getByLabel("Paste your word list").fill("BEE");
  await page.getByRole("button", { name: "APPLY LIST" }).click();
  const canvas = page.locator("#game-canvas"),
    status = page.locator("#game-announcement");
  await canvas.focus();
  await page.keyboard.press("Space");
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.waitForTimeout(100);
  await expect(status).toContainText("6 guesses left");
  await expect(status).toContainText("Guessed: none");
  await page.keyboard.press("Space");
  await expect(status).toContainText("A: not in the word");
  await expect(status).toContainText("5 guesses left");
});
