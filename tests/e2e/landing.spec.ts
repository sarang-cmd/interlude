import { expect, test } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("the static landing page remains usable at desktop and mobile widths", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(pathToFileURL(path.resolve("deployment/index.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { name: /A little arcade/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /VIEW RELEASE/ })).toHaveAttribute(
    "href",
    "https://github.com/sarang-cmd/interlude/releases/latest",
  );
  await expect(page.getByText(/optional selector feed uses a staging signing key/i)).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await expect(page.getByRole("heading", { name: "Load the cabinet." })).toBeVisible();
  }
  expect(requests.filter((url) => /^https?:/i.test(url))).toEqual([]);
});
