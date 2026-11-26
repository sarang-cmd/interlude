import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { GAME_IDS } from "../../src/games/catalog";

let context: BrowserContext;
let worker: Worker;
let page: Page;
let extensionOrigin: string;
let temporaryExtension: string | undefined;

async function settings(patch: Record<string, unknown>): Promise<void> {
  await worker.evaluate(async (changes) => {
    const key = "interlude.settings.v2";
    const doc = (await chrome.storage.sync.get(key))[key];
    Object.assign(doc.global, changes);
    await chrome.storage.sync.set({ [key]: doc });
  }, patch);
}
async function openArcade(): Promise<void> {
  await page.getByRole("button", { name: "PLAY A GAME" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function dayStats(day: string): Promise<{ games: Record<string, number>; sessions: number }> {
  return worker.evaluate(async (key) => {
    const all = (await chrome.storage.local.get("interlude.playStats"))["interlude.playStats"];
    return all?.days?.[key] ?? { games: {}, sessions: 0 };
  }, day);
}

test.beforeEach(async () => {
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 380, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  extensionOrigin = `chrome-extension://${new URL(worker.url()).hostname}`;
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "interlude.settings.v2": {
        version: 2,
        global: { game: "snake", skipBoot: true, muted: true, updateChecks: false },
        sites: {},
      },
    }),
  );
  page = await context.newPage();
});
test.afterEach(async () => {
  await context?.close();
  if (temporaryExtension) fs.rmSync(temporaryExtension, { recursive: true, force: true });
  temporaryExtension = undefined;
});

test("the popup lazy-loads and plays every enabled extension cabinet without a network connection", async () => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${extensionOrigin}/popup.html`);
  await expect(page.getByRole("button", { name: "PLAY A GAME" })).toBeVisible();
  expect(requests.some((url) => /\/chunks\/(?:arcade|engine|game)-/.test(url))).toBe(false);
  await page.screenshot({ path: "test-results/popup-home.png" });
  await openArcade();
  expect(new Set(requests.filter((url) => /\/chunks\/game-[^/]+\.js/.test(url))).size).toBe(1);
  const canvas = page.locator("#game-canvas");
  const picker = page.getByLabel("Choose game");
  await expect(picker.locator("option")).toHaveCount(GAME_IDS.length);
  for (const id of GAME_IDS) {
    await picker.selectOption(id);
    await expect(canvas).toHaveAttribute("data-game", id);
    await expect(canvas).toHaveAttribute("data-scene", "ready");
    await expect(page.locator("#game-controls button").first()).toBeEnabled();
    await page.getByRole("button", { name: "START GAME" }).click();
    await expect(canvas).toHaveAttribute("data-scene", "playing");
  }
  await expect.poll(async () => (await dayStats(today())).sessions).toBe(GAME_IDS.length);
  expect(
    new Set(requests.filter((url) => /\/chunks\/game-[^/]+\.js/.test(url))).size,
  ).toBeGreaterThanOrEqual(GAME_IDS.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
  await page.screenshot({ path: "test-results/popup-tictactoe.png" });
  expect(requests.filter((url) => /^https?:/i.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});

test("remapped keys, focus release, and pause/resume work in the popup", async () => {
  await settings({
    game: "tictactoe",
    "key.tictactoe.left": "KeyQ",
    "key.tictactoe.pause": "KeyY",
  });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  const canvas = page.locator("#game-canvas");
  const announcement = page.locator("#game-announcement");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(canvas).toBeFocused();
  await expect(page.locator("#game-focus")).toBeVisible();
  await page.keyboard.press("q");
  await expect(announcement).toContainText("Selected row 2, column 1");
  await page.keyboard.press("Space");
  await expect(announcement).toContainText("YOU / X played row 2, column 1");
  await expect(announcement).toContainText("CPU / O played", { timeout: 8000 });
  await page.keyboard.press("p");
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.keyboard.press("y");
  await expect(canvas).toHaveAttribute("data-scene", "paused");
  await expect(page.locator("#game-focus")).toBeHidden();
  const frozen = await announcement.textContent();
  await page.waitForTimeout(350);
  expect(await announcement.textContent()).toBe(frozen);
  await page.keyboard.press("y");
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "← BACK" })).toBeFocused();
  await expect(page.locator("#game-focus")).toBeHidden();
  const before = await announcement.textContent();
  await page.keyboard.press("q");
  await page.waitForTimeout(250);
  expect(await announcement.textContent()).toBe(before);
});

test("popup CPU settings persist, a real worker plays, and watch mode does not save a solo record", async () => {
  await settings({ game: "tictactoe", "game.tictactoe.speed": 400 });
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.highscores": { tictactoe: 777 } }),
  );
  const workers: string[] = [];
  page.on("worker", (running) => workers.push(running.url()));
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await expect(page.getByLabel("CPU level").locator("option")).toHaveCount(5);
  await page.getByLabel("CPU level").selectOption("veteran");
  await page.getByLabel("CPU mode").selectOption("watch");
  await expect(page.locator("#game-controls button").first()).toBeDisabled();
  await expect(page.locator("#game-hint")).toContainText("NO SOLO RECORDS");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover", {
    timeout: 15_000,
  });
  await expect(page.locator("#game-announcement")).toContainText("DRAW");
  expect(
    workers.some((url) => url.startsWith(extensionOrigin) && /search-worker-.*\.js/.test(url)),
  ).toBe(true);
  expect(
    (await worker.evaluate(() => chrome.storage.local.get("interlude.highscores")))[
      "interlude.highscores"
    ],
  ).toEqual({ tictactoe: 777 });
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const doc = (await chrome.storage.sync.get("interlude.settings.v2"))[
          "interlude.settings.v2"
        ];
        return [doc.global.tictactoeDifficulty, doc.global.tictactoeWatch];
      }),
    )
    .toEqual(["veteran", true]);
  await page.getByRole("button", { name: "← BACK" }).click();
  await openArcade();
  await expect(page.getByLabel("CPU level")).toHaveValue("veteran");
  await expect(page.getByLabel("CPU mode")).toHaveValue("watch");
});

test("pause-all freezes popup play and active-time accounting; resuming is explicit", async () => {
  const day = today();
  await settings({ game: "tictactoe" });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  const canvas = page.locator("#game-canvas");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect.poll(async () => (await dayStats(day)).games.tictactoe ?? 0).toBeGreaterThan(700);
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.pauseUntil": Date.now() + 3600000 }),
  );
  await expect(page.locator("#gate")).toContainText("CABINETS PAUSED");
  await expect(canvas).toHaveAttribute("data-scene", "paused");
  await expect(page.getByRole("button", { name: "RESUME", exact: true })).toBeDisabled();
  await expect.poll(async () => (await dayStats(day)).games.tictactoe ?? 0).toBeGreaterThan(700);
  await page.waitForTimeout(250);
  const stopped = (await dayStats(day)).games.tictactoe;
  await page.waitForTimeout(1200);
  expect((await dayStats(day)).games.tictactoe).toBe(stopped);
  await worker.evaluate(() => chrome.storage.local.remove("interlude.pauseUntil"));
  await expect(page.locator("#gate")).toBeHidden();
  await expect(canvas).toHaveAttribute("data-scene", "paused");
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-scene", "playing");
  await page.getByRole("button", { name: "← BACK" }).click();
  await expect(page.getByRole("button", { name: "PLAY A GAME" })).toBeVisible();
  await page.waitForTimeout(300);
  const afterBack = (await dayStats(day)).games.tictactoe;
  await page.waitForTimeout(1200);
  expect((await dayStats(day)).games.tictactoe).toBe(afterBack);
});

test("a shared Focus Guard budget locks the popup after another extension window records play", async () => {
  const day = today();
  await settings({ game: "tictactoe", budgetEnabled: true, budgetMinutes: 1, budgetLockout: true });
  await worker.evaluate(
    (key) =>
      chrome.storage.local.set({
        "interlude.playStats": {
          version: 1,
          days: { [key]: { games: { snake: 58000 }, sessions: 1 } },
        },
      }),
    day,
  );
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect.poll(async () => (await dayStats(day)).games.tictactoe ?? 0).toBeGreaterThan(400);
  const other = await context.newPage();
  await other.goto(`${extensionOrigin}/ai-worker-host.html`);
  await page.bringToFront();
  await other.evaluate(
    (key) =>
      chrome.runtime.sendMessage({
        type: "INTERLUDE_PLAY_DELTAS",
        deltas: [{ day: key, game: "snake", ms: 2000, sessions: 0 }],
      }),
    day,
  );
  await expect(page.locator("#gate")).toContainText("OUT OF COINS. BACK TO WORK.", {
    timeout: 7000,
  });
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
  await expect.poll(async () => (await dayStats(day)).games.snake).toBe(60000);
  const stats = await dayStats(day);
  expect(stats.games.tictactoe).toBeGreaterThan(0);
  expect(stats.games.tictactoe).toBeLessThan(5000);
  expect(stats.sessions).toBe(2);
  await settings({ budgetLockout: false });
  await expect(page.locator("#gate")).toBeHidden();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
});

test("disabled games and live changes cannot be bypassed from the popup", async () => {
  await settings({ "game.tictactoe.enabled": false });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  const picker = page.getByLabel("Choose game");
  await expect(picker.locator("option")).toHaveCount(GAME_IDS.length - 1);
  await expect(picker.locator('option[value="tictactoe"]')).toHaveCount(0);
  await page.getByRole("button", { name: "START GAME" }).click();
  await settings(Object.fromEntries(GAME_IDS.map((id) => [`game.${id}.enabled`, false])));
  await expect(page.locator("#gate")).toContainText("NO GAMES ENABLED");
  await expect(picker).toBeDisabled();
  await expect(page.getByRole("button", { name: /START GAME|PAUSE|RESUME/ })).toBeDisabled();
  await settings({ "game.tictactoe.enabled": true });
  await expect(picker).toBeEnabled();
  await expect(picker.locator("option")).toHaveCount(1);
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "tictactoe");
  await expect(page.locator("#gate")).toBeHidden();
});

test("a completed popup run writes the ordinary extension high score", async () => {
  await settings({ game: "dashline", "game.dashline.speed": 400 });
  await page.addInitScript(() => {
    Math.random = () => 0.2;
  });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "gameover", {
    timeout: 20_000,
  });
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.local.get("interlude.highscores"))["interlude.highscores"]
            ?.dashline ?? 0,
      ),
    )
    .toBeGreaterThan(0);
});

test("study and quiet schedules block popup play, including live changes", async () => {
  const everyDay = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  await settings({
    game: "tictactoe",
    studyMode: true,
    studyDays: everyDay,
    studyStart: "00:00",
    studyEnd: "00:00",
  });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await expect(page.locator("#gate")).toContainText("STUDY MODE");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeDisabled();
  expect((await dayStats(today())).sessions).toBe(0);
  await settings({ studyMode: false });
  await expect(page.locator("#gate")).toBeHidden();
  await page.getByRole("button", { name: "START GAME" }).click();
  await settings({ quietHours: true, quietDays: everyDay, quietStart: "00:00", quietEnd: "00:00" });
  await expect(page.locator("#gate")).toContainText("QUIET HOURS");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
  await settings({ quietHours: false });
  await expect(page.locator("#gate")).toBeHidden();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
  await expect(page.getByRole("button", { name: "RESUME" })).toBeEnabled();
});

test("a simulated hidden popup stops the loop and play-time clock until visible again", async () => {
  const day = today();
  await settings({ game: "tictactoe" });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect.poll(async () => (await dayStats(day)).games.tictactoe ?? 0).toBeGreaterThan(600);
  // Headless Chromium keeps extension-page tabs visible even after bringToFront.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => document.hidden)).toBe(true);
  await page.waitForTimeout(300);
  const stopped = (await dayStats(day)).games.tictactoe;
  await page.waitForTimeout(1200);
  expect((await dayStats(day)).games.tictactoe).toBe(stopped);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => document.hidden)).toBe(false);
  await expect
    .poll(async () => (await dayStats(day)).games.tictactoe ?? 0)
    .toBeGreaterThan(stopped!);
});

test("pagehide delivers the last partial second to the worker without duplicate sessions", async () => {
  const day = today();
  await settings({ game: "tictactoe" });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "playing");
  await page.waitForTimeout(400);
  await page.goto("about:blank");
  await expect.poll(async () => (await dayStats(day)).games.tictactoe ?? 0).toBeGreaterThan(200);
  const stats = await dayStats(day);
  expect(stats.games.tictactoe).toBeLessThan(2000);
  expect(stats.sessions).toBe(1);
  await page.waitForTimeout(1100);
  expect(await dayStats(day)).toEqual(stats);
});

test("touch controls and keyboard-activated buttons are independent of mouse input", async () => {
  await settings({ game: "tictactoe", pointerEnabled: false });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await page.getByRole("button", { name: "START GAME" }).click();
  const announcement = page.locator("#game-announcement");
  const left = page.getByRole("button", { name: "Select left" });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  const box = await left.boundingBox();
  if (!box) throw new Error("Touch control not visible");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(announcement).toContainText("Selected row 2, column 1");
  const mark = page.getByRole("button", { name: "Place mark" });
  await mark.focus();
  await page.keyboard.press("Enter");
  await expect(announcement).toContainText("YOU / X played row 2, column 1");
  await expect(announcement).toContainText("CPU / O played", { timeout: 8000 });
  await cdp.detach();
});

test("pause expiry updates the home screen and a missing play-stats store fails closed", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.pauseUntil": Date.now() + 1200 }),
  );
  await page.goto(`${extensionOrigin}/popup.html`);
  await expect(page.getByRole("button", { name: "PLAY A GAME" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "RESUME NOW" })).toBeVisible();
  await expect(page.getByRole("button", { name: "PLAY A GAME" })).toBeEnabled({ timeout: 4000 });
  await page.addInitScript(() => {
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = ((keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === "interlude.playStats") return Promise.reject(new Error("test storage failure"));
      return Reflect.apply(original, chrome.storage.local, [keys]);
    }) as typeof chrome.storage.local.get;
  });
  await page.reload();
  await page.getByRole("button", { name: "PLAY A GAME" }).click();
  await expect(page.locator("#gate")).toContainText("STORAGE UNAVAILABLE");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeDisabled();
  await expect(page.getByLabel("Choose game")).toBeDisabled();
});

test("back tears down a stalled popup AI worker before returning to the menu", async () => {
  await context.close();
  fs.mkdirSync("test-results", { recursive: true });
  temporaryExtension = fs.mkdtempSync(path.resolve("test-results/popup-stalled-"));
  fs.cpSync("dist", temporaryExtension, { recursive: true });
  const assets = path.join(temporaryExtension, "assets");
  const workerFile = fs.readdirSync(assets).find((name) => /^search-worker-.*\.js$/.test(name));
  if (!workerFile) throw new Error("Packaged worker missing");
  fs.writeFileSync(path.join(assets, workerFile), "globalThis.onmessage = () => {};");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 380, height: 600 },
    args: [
      `--disable-extensions-except=${temporaryExtension}`,
      `--load-extension=${temporaryExtension}`,
    ],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  extensionOrigin = `chrome-extension://${new URL(worker.url()).hostname}`;
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      "interlude.settings.v2": {
        version: 2,
        global: { game: "tictactoe", skipBoot: true, muted: true, updateChecks: false },
        sites: {},
      },
    }),
  );
  page = await context.newPage();
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await page.getByRole("button", { name: "START GAME" }).click();
  const waiting = page.waitForEvent("worker", { timeout: 5000 });
  await page.keyboard.press("Space");
  const searchWorker = await waiting;
  const closed = searchWorker.waitForEvent("close", { timeout: 1500 });
  await page.getByRole("button", { name: "← BACK" }).click();
  await closed;
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PLAY A GAME" })).toBeVisible();
});

test("startup retries a stale guard snapshot instead of opening past a new lock", async () => {
  const day = today();
  await settings({ game: "tictactoe", budgetEnabled: true, budgetMinutes: 1, budgetLockout: true });
  await page.addInitScript(() => {
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    let delayed = false;
    chrome.storage.local.get = ((keys: string | string[] | Record<string, unknown> | null) => {
      const result = Reflect.apply(original, chrome.storage.local, [keys]) as Promise<
        Record<string, unknown>
      >;
      if (keys !== "interlude.playStats" || delayed) return result;
      delayed = true;
      document.documentElement.dataset.statsReadStarted = "true";
      return result.then(
        (value) =>
          new Promise<Record<string, unknown>>((resolve) => setTimeout(() => resolve(value), 500)),
      );
    }) as typeof chrome.storage.local.get;
  });
  await page.goto(`${extensionOrigin}/popup.html`);
  await page.getByRole("button", { name: "PLAY A GAME" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-stats-read-started", "true");
  await worker.evaluate(
    (key) =>
      chrome.storage.local.set({
        "interlude.playStats": {
          version: 1,
          days: { [key]: { games: { snake: 61000 }, sessions: 1 } },
        },
      }),
    day,
  );
  await expect(page.locator("#gate")).toContainText("OUT OF COINS. BACK TO WORK.");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeDisabled();
  expect((await dayStats(day)).sessions).toBe(1);
});

test("rapid game changes do not mount a stale selection and last played survives reopening", async () => {
  await settings({ game: "last" });
  await worker.evaluate(() => chrome.storage.local.set({ "interlude.lastPlayed": "snake" }));
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  const picker = page.getByLabel("Choose game");
  await picker.evaluate((select: HTMLSelectElement) => {
    for (const id of ["breakout", "tictactoe", "pong"]) {
      select.value = id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "pong");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.local.get("interlude.lastPlayed"))["interlude.lastPlayed"],
      ),
    )
    .toBe("pong");
  await page.getByRole("button", { name: "← BACK" }).click();
  await openArcade();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", "pong");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "playing");
  await expect.poll(async () => (await dayStats(today())).sessions).toBe(1);
});

test("popup active play reaches its own daily budget and stops at the lock", async () => {
  const day = today();
  await settings({ game: "tictactoe", budgetEnabled: true, budgetMinutes: 1, budgetLockout: true });
  await worker.evaluate(
    (key) =>
      chrome.storage.local.set({
        "interlude.playStats": {
          version: 1,
          days: { [key]: { games: { snake: 59500 }, sessions: 1 } },
        },
      }),
    day,
  );
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#gate")).toContainText("OUT OF COINS. BACK TO WORK.", {
    timeout: 6000,
  });
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "paused");
  await expect
    .poll(async () => (await dayStats(day)).games.tictactoe ?? 0)
    .toBeGreaterThanOrEqual(500);
  const stats = await dayStats(day);
  expect(stats.games.snake).toBe(59500);
  expect(stats.games.tictactoe).toBeLessThan(4000);
  expect(stats.sessions).toBe(2);
});

test("the compact cabinet remains reachable in a 320-pixel viewport", async () => {
  await page.setViewportSize({ width: 320, height: 600 });
  await settings({ game: "blockfall" });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.getByRole("button", { name: "Hard drop" })).toBeVisible();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "playing");
  await page.getByRole("button", { name: "Hard drop" }).click();
  await page.screenshot({ path: "test-results/popup-320.png" });
});

test("popup supports and persists larger NOUGHTS AND CROSSES boards", async () => {
  await settings({ game: "tictactoe" });
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  const size = page.getByLabel("NOUGHTS AND CROSSES board size");
  await size.selectOption("5");
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
  await page.getByRole("button", { name: "START GAME" }).click();
  await page.keyboard.press("Space");
  await expect(page.locator("#game-announcement")).toContainText("CPU / O played", {
    timeout: 7000,
  });
  await expect(page.locator("#game-announcement")).toContainText("row 5:");
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const doc = (await chrome.storage.sync.get("interlude.settings.v2"))[
          "interlude.settings.v2"
        ];
        return doc.global.tictactoeSize;
      }),
    )
    .toBe("5");
  await page.reload();
  await openArcade();
  await expect(size).toHaveValue("5");
});

test("popup board cabinets use the shared CPU setting and packaged worker", async () => {
  await settings({ game: "dropfour" });
  const workers: string[] = [];
  page.on("worker", (running) => workers.push(running.url()));
  await page.goto(`${extensionOrigin}/popup.html`);
  await openArcade();
  await page.getByLabel("CPU level").selectOption("veteran");
  await expect(page.getByLabel("CPU mode")).toBeHidden();
  for (const id of ["dropfour", "flipdisc", "dotsboxes"]) {
    await page.getByLabel("Choose game").selectOption(id);
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-game", id);
    await expect(page.locator("#game-canvas")).toHaveAttribute("data-scene", "ready");
    await expect(page.getByLabel("CPU level")).toHaveValue("veteran");
    await page.getByRole("button", { name: "START GAME" }).click();
    await page.keyboard.press("Space");
    await expect(page.locator("#game-announcement")).toContainText(
      id === "dotsboxes" ? "CPU drew" : "CPU played",
      { timeout: 7000 },
    );
    await expect(page.locator("#game-announcement")).toContainText("using search");
  }
  expect(workers.filter((url) => /^chrome-extension:\/\//.test(url)).length).toBeGreaterThanOrEqual(
    2,
  );
  expect(await page.locator("#arcade").textContent()).not.toMatch(/two.players|player 2/i);
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const doc = (await chrome.storage.sync.get("interlude.settings.v2"))[
          "interlude.settings.v2"
        ];
        return doc.global.boardDifficulty;
      }),
    )
    .toBe("veteran");
});
