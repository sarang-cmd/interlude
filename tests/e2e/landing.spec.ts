import { expect, test } from "@playwright/test";
import { GAME_IDS } from "../../src/games/catalog";

const SITE = "http://127.0.0.1:4173";

test("the playable landing page remains usable on desktop and mobile without external resources", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(SITE);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#game-canvas[data-scene="ready"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: /A little arcade/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /VIEW RELEASE/ })).toHaveAttribute(
    "href",
    "https://github.com/sarang-cmd/interlude/releases/latest",
  );
  await expect(page.getByText(/optional selector feed uses a staging signing key/i)).toBeVisible();
  await expect(page.locator("#game-list button")).toHaveCount(GAME_IDS.length);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await expect(page.getByRole("heading", { name: "Load the cabinet." })).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(requests.filter((url) => new URL(url).origin !== SITE)).toEqual([]);
});

test("the built site retains both JSON services and their CORS configuration", async ({
  request,
}) => {
  for (const path of ["/selectors/v1.json", "/updates/latest.json"]) {
    const response = await request.get(`${SITE}${path}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(typeof (await response.json())).toBe("object");
  }
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile("deployment/vercel.json", "utf8")) as {
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  for (const source of ["/selectors/:path*", "/updates/:path*"]) {
    const route = config.headers.find((entry) => entry.source === source);
    expect(route?.headers).toContainEqual({ key: "Access-Control-Allow-Origin", value: "*" });
  }
});
