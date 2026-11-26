import { expect, test } from "@playwright/test";
import { WEB_SCORES_KEY } from "../../src/web/scores";

const SITE = "http://127.0.0.1:4173";
test("CODEBREAK lets one player set a hidden, unsaved code and another crack it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ codebreak: 777 })),
    WEB_SCORES_KEY,
  );
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== SITE) external.push(request.url());
  });
  await page.goto(SITE);
  await page.getByRole("button", { name: "Select CODEBREAK", exact: true }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "codebreak");
  await page.locator("#race-mode").selectOption("local");
  const input = page.getByLabel("Hidden code"),
    status = page.locator("#game-announcement");
  await expect(input).toBeHidden();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("type", "password");
  await input.fill("7777");
  await page.getByRole("button", { name: "SET CODE" }).click();
  await expect(page.locator("#local-race")).toContainText("Use exactly four digits");
  await input.fill("2222");
  await page.getByRole("button", { name: "SET CODE" }).click();
  await expect(input).toBeHidden();
  await expect(input).toHaveValue("");
  await expect(status).toContainText("privacy screen");
  await expect(status).not.toContainText("2222");
  expect(await page.evaluate(() => document.body.innerText)).not.toContain("2222");
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain("2222");
  await page.getByRole("button", { name: "Submit code guess" }).click();
  await expect(status).toContainText("Current guess 1111");
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Increase digit" }).click();
    const guess = "2".repeat(i + 1) + "1".repeat(3 - i);
    await expect(status).toContainText(`Current guess ${guess}`);
    if (i < 3) await page.getByRole("button", { name: "Select digit right" }).click();
  }
  await page.getByRole("button", { name: "Submit code guess" }).click();
  await expect(status).toContainText("4 exact, 0 misplaced");
  await expect(status).toContainText("CODE CRACKED");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover");
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), WEB_SCORES_KEY),
  ).toEqual({ codebreak: 777 });
  await page.getByRole("button", { name: "PLAY AGAIN" }).click();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("");
  expect(external).toEqual([]);
});
