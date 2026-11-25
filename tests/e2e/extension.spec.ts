import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
  type CDPSession,
} from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

type Debug = {
  state: string;
  generating: boolean;
  signals: Record<"a" | "b" | "c" | "d", { active: boolean }>;
  lastSignalToFrameMs: number | null;
  panel: {
    visible: boolean;
    scene: string;
    gameId: string;
    loopRunning: boolean;
    lowRate: boolean;
    overheadMs: number | null;
  };
  activity: { timers: number; observers: number; scheduledFrames: number };
};
type DomNode = {
  nodeId: number;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
};
let context: BrowserContext, page: Page, worker: Worker;

async function openFixture(name = "idle"): Promise<void> {
  const html = fs.readFileSync(`test/fixtures/claude/${name}.html`, "utf8");
  await page.route("https://claude.ai/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await page.goto(`https://claude.ai/chat/${name}`);
  await expect(page.locator('[data-interlude="panel"]')).toHaveCount(1, { timeout: 12000 });
}
async function diagnostic(): Promise<Debug> {
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://claude.ai/*" });
    if (tab?.id === undefined) throw new Error("fixture tab not found");
    return chrome.tabs.sendMessage(tab.id, { type: "INTERLUDE_DIAGNOSTICS" });
  });
}
async function shadowNode(client: CDPSession, selector: string): Promise<number> {
  const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: true });
  const find = (node: DomNode): DomNode | undefined => {
    const attrs = node.attributes ?? [];
    const index = attrs.indexOf("data-interlude");
    if (index >= 0 && attrs[index + 1] === "panel") return node;
    for (const child of node.children ?? []) {
      const result = find(child);
      if (result) return result;
    }
    return undefined;
  };
  const host = find(root as DomNode);
  if (!host?.shadowRoots?.[0]) throw new Error("closed shadow root not found through CDP");
  const { nodeId } = await client.send("DOM.querySelector", {
    nodeId: host.shadowRoots[0].nodeId,
    selector,
  });
  if (!nodeId) throw new Error(`shadow selector not found: ${selector}`);
  return nodeId;
}
async function shadowClick(selector: string): Promise<void> {
  const cdp = await context.newCDPSession(page);
  const nodeId = await shadowNode(cdp, selector);
  await cdp.send("DOM.scrollIntoViewIfNeeded", { nodeId });
  const { model } = await cdp.send("DOM.getBoxModel", { nodeId });
  const quad = model.border;
  await page.mouse.click((quad[0]! + quad[4]!) / 2, (quad[1]! + quad[5]!) / 2);
  await cdp.detach();
}
async function selectGame(id: string): Promise<void> {
  const cdp = await context.newCDPSession(page);
  const nodeId = await shadowNode(cdp, "select");
  const { object } = await cdp.send("DOM.resolveNode", { nodeId });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: object.objectId!,
    functionDeclaration:
      "function(id) { this.value = id; this.dispatchEvent(new Event('change', {bubbles:true})); }",
    arguments: [{ value: id }],
  });
  await cdp.detach();
}

test.beforeEach(async () => {
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.local.set({
      "interlude.settings": { delayMs: 500, skipBoot: true, muted: true },
    }),
  );
  page = await context.newPage();
});
test.afterEach(async () => {
  await context?.close();
});

test("idle has no visible stub, no frame, no timer and no observer", async () => {
  await openFixture();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeHidden();
  expect(
    await host.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      shadow: el.shadowRoot,
    })),
  ).toEqual({ height: 0, shadow: null });
  await expect.poll(async () => (await diagnostic()).panel.gameId).toBe("snake");
  const state = await diagnostic();
  expect(state.state).toBe("idle");
  expect(state.panel.loopRunning).toBe(false);
  expect(state.activity).toEqual({ timers: 0, observers: 0, scheduledFrames: 0 });
});

test("inline reveal is beneath the indicator, timely and remains READY until input", async () => {
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("data-interlude-scene", "ready");
  const placement = await page.evaluate(() => {
    const indicator = document.querySelector('[data-testid="thinking-indicator"]')!;
    const panel = document.querySelector('[data-interlude="panel"]')!;
    return {
      adjacent: indicator.nextElementSibling === panel,
      indicatorWidth: indicator.parentElement!.getBoundingClientRect().width,
      panelWidth: panel.getBoundingClientRect().width,
    };
  });
  expect(placement.adjacent).toBe(true);
  expect(Math.abs(placement.panelWidth - placement.indicatorWidth)).toBeLessThan(1);
  const state = await diagnostic();
  expect(state.lastSignalToFrameMs).toBeGreaterThanOrEqual(490);
  expect(state.panel.overheadMs).toBeLessThan(80);
  await page.waitForTimeout(900);
  await expect(host).toHaveAttribute("data-interlude-scene", "ready");
  await page.screenshot({ path: "test-results/panel-preview.png" });
});

test("short replies end before the reveal delay and never show a panel", async () => {
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  await page.waitForTimeout(80);
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-interlude="panel"]')).toBeHidden();
  const state = await diagnostic();
  expect(state.state).toBe("idle");
  expect(state.activity.timers).toBe(0);
});

test("generation finishes by freezing; RESUME restores the exact run", async () => {
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await shadowClick("canvas");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect(host).toHaveAttribute("data-interlude-scene", "paused", { timeout: 3000 });
  expect((await diagnostic()).panel.loopRunning).toBe(false);
  await shadowClick(".resume");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  expect((await diagnostic()).panel.loopRunning).toBe(true);
});

test("composer keys are never captured; hotkey and Escape move focus", async () => {
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { keyFlags: boolean[] }).keyFlags = [];
    const field = document.querySelector('[data-testid="chat-input"]')!;
    field.addEventListener("keydown", (event) => {
      (window as unknown as { keyFlags: boolean[] }).keyFlags.push(event.defaultPrevented);
    });
  });
  const field = page.locator('[data-testid="chat-input"]');
  await field.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  expect(
    await page.evaluate(() => (window as unknown as { keyFlags: boolean[] }).keyFlags),
  ).toEqual([false, false]);
  await page.keyboard.press("Alt+g");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-interlude"))).toBe(
    "panel",
  );
  expect(
    (await page.evaluate(() => (window as unknown as { keyFlags: boolean[] }).keyFlags)).every(
      (flag) => !flag,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(field).toBeFocused();
});

test("reparents the original closed host when the latest turn is replaced", async () => {
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { fixture: { replace(): void } }).fixture.replace(),
  );
  await expect(host).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector('[data-testid="thinking-indicator"]')
          ?.nextElementSibling?.getAttribute("data-interlude"),
      ),
    )
    .toBe("panel");
  await expect(host).toHaveCount(1);
});

test("all eight lazy-loaded games start from the picker", async () => {
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  for (const id of [
    "snake",
    "breakout",
    "flappy",
    "twenty48",
    "pong",
    "blockfall",
    "rockfall",
    "dashline",
  ]) {
    await selectGame(id);
    await expect(host).toHaveAttribute("data-interlude-game", id);
    await expect(host).toHaveAttribute("data-interlude-scene", "ready");
    await shadowClick("canvas");
    await expect(host).toHaveAttribute("data-interlude-scene", "playing");
    await page.waitForTimeout(180);
    await host.screenshot({ path: `test-results/game-${id}.png` });
  }
});

test("already generating fixtures are recognised on load", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture("regenerating");
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  expect(await page.locator('[data-testid="assistant-turn"]').count()).toBe(2);
  expect(await diagnostic()).toMatchObject({ state: "generating", generating: true });
});

test("current structural fallbacks detect an assistant streaming attribute", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture("modern");
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  expect(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="assistant-message"]')
        ?.nextElementSibling?.getAttribute("data-interlude"),
    ),
  ).toBe("panel");
});

test("other placements remount and overlay drag position persists", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  const setPlacement = async (placement: string) =>
    worker.evaluate(async (value) => {
      const current = (await chrome.storage.local.get("interlude.settings"))["interlude.settings"];
      await chrome.storage.local.set({ "interlude.settings": { ...current, placement: value } });
    }, placement);
  await setPlacement("docked-composer");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector('[data-testid="chat-composer"]')
          ?.previousElementSibling?.getAttribute("data-interlude"),
      ),
    )
    .toBe("panel");
  await setPlacement("side-panel");
  await expect.poll(() => host.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  await setPlacement("overlay");
  await expect.poll(() => host.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  const cdp = await context.newCDPSession(page);
  const header = await shadowNode(cdp, "header");
  const { model } = await cdp.send("DOM.getBoxModel", { nodeId: header });
  const x = model.border[0]! + 70,
    y = model.border[1]! + 20;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 90, y + 30);
  await page.mouse.up();
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.local.get("interlude.overlayPositions"))[
            "interlude.overlayPositions"
          ]?.claude?.x,
      ),
    )
    .toBeTruthy();
  const saved = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get("interlude.overlayPositions"))["interlude.overlayPositions"]
        .claude as { x: number; y: number },
  );
  expect(Math.round(await host.evaluate((el) => el.getBoundingClientRect().x))).toBe(
    Math.round(saved.x),
  );
  await cdp.detach();
  await page.reload();
  await expect(host).toHaveCount(1);
  await expect(host).toBeHidden();
  await expect.poll(async () => (await diagnostic()).panel.gameId).toBe("snake");
  await page.locator('[data-testid="send-button"]').click();
  await expect(host).toBeVisible();
  await expect
    .poll(async () => Math.round(await host.evaluate((el) => el.getBoundingClientRect().x)))
    .toBe(Math.round(saved.x));
});

test("auto-close freezes before closing after the configured grace", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      "interlude.settings": {
        delayMs: 0,
        skipBoot: true,
        muted: true,
        autoClose: true,
        autoCloseGraceMs: 600,
      },
    }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await shadowClick("canvas");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  expect((await diagnostic()).panel.loopRunning).toBe(false);
  await expect(host).toBeHidden({ timeout: 3000 });
});

test("settings and diagnostic selector bench operate inside the built extension", async () => {
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  await expect(page.locator('[data-interlude="panel"]')).toBeVisible();
  const id = new URL(worker.url()).hostname;
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await expect(options.getByRole("heading", { name: /OPERATOR/ })).toBeVisible();
  await options.selectOption("#pongDifficulty", "rookie");
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.local.get("interlude.settings"))["interlude.settings"]
            ?.pongDifficulty,
      ),
    )
    .toBe("rookie");
  await options.screenshot({ path: "test-results/options-preview.png", fullPage: true });
  const diagnostics = await context.newPage();
  await diagnostics.goto(`chrome-extension://${id}/diagnostics.html`);
  await expect(diagnostics.locator("#phase")).toHaveText(/GENERATING|FINISHING/);
  await expect(diagnostics.locator("#selectorRows tr").first()).toBeVisible();
  await diagnostics.locator("#save").click();
  await expect(diagnostics.locator("#editorStatus")).toContainText("APPLIED");
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          !!(await chrome.storage.local.get("interlude.claudeSelectors"))[
            "interlude.claudeSelectors"
          ],
      ),
    )
    .toBe(true);
});

test("optional stream hook observes only open and close while preserving bytes", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      "interlude.settings": { delayMs: 0, skipBoot: true, muted: true, streamHookEnabled: true },
    }),
  );
  await openFixture();
  await page.waitForFunction(
    () => !!(window as unknown as { __interludeStreamTiming?: unknown }).__interludeStreamTiming,
  );
  await page.route("https://claude.ai/stream-test", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "data: fixture-only\n\n",
    }),
  );
  const delivered = await page.evaluate(async () => {
    const response = await fetch("/stream-test");
    const reader = response.body!.getReader();
    (window as unknown as { testReader: ReadableStreamDefaultReader<Uint8Array> }).testReader =
      reader;
    const first = await reader.read();
    return new TextDecoder().decode(first.value);
  });
  expect(delivered).toBe("data: fixture-only\n\n");
  await expect
    .poll(
      async () =>
        (
          await worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({ url: "https://claude.ai/*" });
            return chrome.tabs.sendMessage(tab!.id!, { type: "INTERLUDE_DIAGNOSTICS" });
          })
        ).streamHook.active,
    )
    .toBe(true);
  await page.evaluate(async () => {
    await (
      window as unknown as { testReader: ReadableStreamDefaultReader<Uint8Array> }
    ).testReader.read();
  });
  await expect
    .poll(
      async () =>
        (
          await worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({ url: "https://claude.ai/*" });
            return chrome.tabs.sendMessage(tab!.id!, { type: "INTERLUDE_DIAGNOSTICS" });
          })
        ).streamHook.active,
    )
    .toBe(false);
});

test("any key instantly restarts after game over", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await shadowClick("canvas");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await expect(host).toHaveAttribute("data-interlude-scene", "gameover", { timeout: 5000 });
  await page.keyboard.press("q");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing", { timeout: 1000 });
});

test("out-of-view cabinets use the low-rate loop", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await page.setViewportSize({ width: 1000, height: 400 });
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "1500px";
    document.body.append(spacer);
    window.scrollTo(0, document.body.scrollHeight);
  });
  await expect.poll(async () => (await diagnostic()).panel.lowRate).toBe(true);
  expect((await diagnostic()).panel.loopRunning).toBe(true);
});

test("only the selected game chunk loads until the picker changes", async () => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const chunks = new Set<string>();
  cdp.on("Network.requestWillBeSent", ({ request }) => {
    if (request.url.startsWith("chrome-extension:") && /\/game-[^/]+\.js/.test(request.url))
      chunks.add(request.url);
  });
  await openFixture();
  await expect.poll(async () => (await diagnostic()).panel.gameId).toBe("snake");
  expect(chunks.size).toBe(1);
  await page.locator('[data-testid="send-button"]').click();
  await expect(page.locator('[data-interlude="panel"]')).toBeVisible();
  await selectGame("pong");
  await expect(page.locator('[data-interlude="panel"]')).toHaveAttribute(
    "data-interlude-game",
    "pong",
  );
  expect(chunks.size).toBe(2);
  await cdp.detach();
});

test("SPA navigation tears down the old conversation rather than reopening stale controls", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await page.evaluate(() => history.pushState({}, "", "/chat/other"));
  await expect(host).toBeHidden({ timeout: 5000 });
  await page.waitForTimeout(300);
  await expect(host).toBeHidden();
  expect((await diagnostic()).state).toBe("idle");
});

test("small cabinets downscale in whole source-pixel groups", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await page.setViewportSize({ width: 500, height: 800 });
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  await expect(page.locator('[data-interlude="panel"]')).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const canvas = await shadowNode(cdp, "canvas");
  const { object } = await cdp.send("DOM.resolveNode", { nodeId: canvas });
  const { result } = await cdp.send("Runtime.callFunctionOn", {
    objectId: object.objectId!,
    functionDeclaration:
      "function() { return { logical: this.width, displayed: this.getBoundingClientRect().width, rendering: getComputedStyle(this).imageRendering }; }",
    returnByValue: true,
  });
  const metrics = result.value as { logical: number; displayed: number; rendering: string };
  expect(metrics.logical).toBe(640);
  expect(metrics.logical / metrics.displayed).toBe(2);
  expect(metrics.rendering).toBe("pixelated");
  await cdp.detach();
});

test("P resumes both a manual pause and the completion freeze without pausing again", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await shadowClick("canvas");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.keyboard.down("p");
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  const cdp = await context.newCDPSession(page);
  const canvas = await shadowNode(cdp, "canvas");
  const { object } = await cdp.send("DOM.resolveNode", { nodeId: canvas });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: object.objectId!,
    functionDeclaration:
      "function() { this.dispatchEvent(new KeyboardEvent('keydown', {key:'p',code:'KeyP',repeat:true,bubbles:true,cancelable:true})); }",
  });
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  await page.keyboard.up("p");
  await page.keyboard.press("p");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.waitForTimeout(250);
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  await page.keyboard.press("p");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.waitForTimeout(250);
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await cdp.detach();
});

test("re-enabling keeps structural remount subscriptions alive", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  const setEnabled = async (enabled: boolean) =>
    worker.evaluate(async (value) => {
      const current = (await chrome.storage.local.get("interlude.settings"))["interlude.settings"];
      await chrome.storage.local.set({ "interlude.settings": { ...current, enabled: value } });
    }, enabled);
  await setEnabled(false);
  await expect(host).toBeHidden();
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await setEnabled(true);
  await page.locator('[data-testid="send-button"]').click();
  await expect(host).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { fixture: { replace(): void } }).fixture.replace(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector('[data-testid="thinking-indicator"]')
          ?.nextElementSibling?.getAttribute("data-interlude"),
      ),
    )
    .toBe("panel");
});

test("back navigation closes the old session rather than presenting a completion prompt", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.evaluate(() => history.pushState({}, "", "/chat/next"));
  await page.waitForTimeout(200);
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await page.goBack();
  await expect(host).toBeHidden({ timeout: 3000 });
  expect((await diagnostic()).state).toBe("idle");
});

test("changing games during a completion freeze preserves a resumable READY scene", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await shadowClick("canvas");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  await selectGame("pong");
  await expect(host).toHaveAttribute("data-interlude-game", "pong");
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  expect((await diagnostic()).panel.loopRunning).toBe(false);
  await shadowClick(".resume");
  await expect(host).toHaveAttribute("data-interlude-scene", "ready");
  expect((await diagnostic()).panel.loopRunning).toBe(true);
  await shadowClick("canvas");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
});

test("a popstate event closes synchronously without mistaking navigation for completion", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  const visible = await page.evaluate(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return document
      .querySelector('[data-interlude="panel"]')
      ?.getAttribute("data-interlude-visible");
  });
  expect(visible).toBe("false");
  expect((await diagnostic()).state).toBe("idle");
});

test("concurrent game records from different extension tabs retain every best", async () => {
  const id = new URL(worker.url()).hostname;
  const first = await context.newPage(),
    second = await context.newPage();
  await first.goto(`chrome-extension://${id}/options.html`);
  await second.goto(`chrome-extension://${id}/options.html`);
  await Promise.all([
    first.evaluate(() =>
      chrome.runtime.sendMessage({ type: "INTERLUDE_SAVE_SCORE", gameId: "snake", score: 50 }),
    ),
    second.evaluate(() =>
      chrome.runtime.sendMessage({ type: "INTERLUDE_SAVE_SCORE", gameId: "pong", score: 200 }),
    ),
    first.evaluate(() =>
      chrome.runtime.sendMessage({ type: "INTERLUDE_SAVE_SCORE", gameId: "snake", score: 25 }),
    ),
    second.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "INTERLUDE_SAVE_SCORE",
        gameId: "twenty48:tile",
        score: 64,
      }),
    ),
  ]);
  const scores = await worker.evaluate(
    async () => (await chrome.storage.local.get("interlude.highscores"))["interlude.highscores"],
  );
  expect(scores).toMatchObject({ snake: 50, pong: 200, "twenty48:tile": 64 });
  await first.close();
  await second.close();
});

test("branch switches ignore hidden stale turns and re-anchor to the active turn", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await page.evaluate(() => {
    const current = document.querySelector('[data-testid="assistant-turn"]')!;
    const stale = document.createElement("div");
    stale.dataset.testid = "assistant-turn";
    stale.dataset.branch = "alternative";
    stale.hidden = true;
    const marker = document.createElement("div");
    marker.dataset.testid = "thinking-indicator";
    marker.textContent = "Thinking";
    stale.append(marker);
    current.after(stale);
  });
  await page.waitForTimeout(250);
  await expect(host).toBeVisible();
  expect(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="assistant-turn"] [data-testid="thinking-indicator"]')
        ?.nextElementSibling?.getAttribute("data-interlude"),
    ),
  ).toBe("panel");
  await page.evaluate(() => {
    const current = document.querySelector('[data-testid="assistant-turn"]') as HTMLElement;
    const alternative = document.querySelector('[data-branch="alternative"]') as HTMLElement;
    current.hidden = true;
    alternative.hidden = false;
  });
  await expect(host).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector('[data-branch="alternative"] [data-testid="thinking-indicator"]')
          ?.nextElementSibling?.getAttribute("data-interlude"),
      ),
    )
    .toBe("panel");
});

test("regeneration and edited composer submissions re-arm discovery, then disconnect on idle", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  const host = page.locator('[data-interlude="panel"]');
  await page.locator('[data-testid="regenerate-button"]').click();
  await expect(host).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  await shadowClick(".done button:not(.resume)");
  await expect(host).toBeHidden();
  await expect.poll(async () => (await diagnostic()).state).toBe("idle");
  const idle = await diagnostic();
  expect(idle.activity).toEqual({ observers: 0, timers: 0, scheduledFrames: 0 });
  expect([idle.signals.a.active, idle.signals.b.active, idle.signals.c.active]).toEqual([
    false,
    false,
    false,
  ]);
  // Model a site handling Enter on an edited composer without reading the text.
  await page.evaluate(() => {
    const field = document.querySelector('[data-testid="chat-input"]')!;
    field.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter")
        (window as unknown as { fixture: { start(): void } }).fixture.start();
    });
  });
  await page.locator('[data-testid="chat-input"]').focus();
  await page.keyboard.press("Enter");
  await expect(host).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
});

test("Escape releases focus from the picker, and composer clicks stop capture", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.focus", { nodeId: await shadowNode(cdp, "select") });
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="chat-input"]')).toBeFocused();
  await shadowClick("canvas");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.locator('[data-testid="chat-input"]').click();
  const prevented = await page.evaluate(() => {
    const field = document.querySelector('[data-testid="chat-input"]')!;
    const key = new KeyboardEvent("keydown", {
      code: "ArrowUp",
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(key);
    return key.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await cdp.detach();
});

test("power-on is brief, appears only once, and is never replayed on the next generation", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      "interlude.settings": { delayMs: 0, skipBoot: false, muted: true },
    }),
  );
  await openFixture();
  await expect.poll(async () => (await diagnostic()).panel.gameId).toBe("snake");
  await page.evaluate(() => {
    const changes: { scene: string | null; at: number }[] = [];
    (window as unknown as { scenes: typeof changes }).scenes = changes;
    const host = document.querySelector('[data-interlude="panel"]')!;
    new MutationObserver(() =>
      changes.push({ scene: host.getAttribute("data-interlude-scene"), at: performance.now() }),
    ).observe(host, { attributes: true, attributeFilter: ["data-interlude-scene"] });
  });
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("data-interlude-scene", "ready");
  const first = await page.evaluate(
    () => (window as unknown as { scenes: { scene: string | null; at: number }[] }).scenes,
  );
  const boot = first.find((change) => change.scene === "boot");
  const ready = first.find((change) => change.scene === "ready");
  expect(boot).toBeDefined();
  expect(ready).toBeDefined();
  expect(ready!.at - boot!.at).toBeLessThan(250);
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  await shadowClick(".done button:not(.resume)");
  await expect(host).toBeHidden();
  await page.locator('[data-testid="regenerate-button"]').click();
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("data-interlude-scene", "ready");
  const scenes = await page.evaluate(
    () => (window as unknown as { scenes: { scene: string | null }[] }).scenes,
  );
  expect(scenes.filter((change) => change.scene === "boot")).toHaveLength(1);
});

test("each cabinet can start from its touch controls", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  for (const id of [
    "snake",
    "breakout",
    "flappy",
    "twenty48",
    "pong",
    "blockfall",
    "rockfall",
    "dashline",
  ]) {
    await selectGame(id);
    await expect(host).toHaveAttribute("data-interlude-game", id);
    const button = await shadowNode(cdp, ".controls button");
    await cdp.send("DOM.scrollIntoViewIfNeeded", { nodeId: button });
    const { model } = await cdp.send("DOM.getBoxModel", { nodeId: button });
    const x = (model.border[0]! + model.border[4]!) / 2,
      y = (model.border[1]! + model.border[5]!) / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 0 }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  }
  await cdp.detach();
});

test("closing a running cabinet returns focus and dismisses it for that generation", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await shadowClick(".close");
  await expect(host).toBeHidden();
  await expect(page.locator('[data-testid="chat-input"]')).toBeFocused();
  await page.waitForTimeout(250);
  await expect(host).toBeHidden();
  await page.evaluate(() =>
    (window as unknown as { fixture: { finish(): void } }).fixture.finish(),
  );
  await expect.poll(async () => (await diagnostic()).state).toBe("idle");
  await page.locator('[data-testid="regenerate-button"]').click();
  await expect(host).toBeVisible();
});

test("completion survives replacement of the entire assistant turn", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.settings": { delayMs: 0, skipBoot: true, muted: true } }),
  );
  await openFixture();
  await page.locator('[data-testid="send-button"]').click();
  const host = page.locator('[data-interlude="panel"]');
  await expect(host).toBeVisible();
  await shadowClick("canvas");
  await expect(host).toHaveAttribute("data-interlude-scene", "playing");
  await page.evaluate(() => {
    const old = document.querySelector('[data-testid="assistant-turn"]')!;
    const completed = document.createElement("div");
    completed.dataset.testid = "assistant-turn";
    completed.dataset.finishedTurn = "true";
    completed.textContent = "Finished fixture.";
    old.replaceWith(completed);
    document.querySelector('[data-testid="stop-button"]')?.remove();
  });
  await expect(host).toBeVisible({ timeout: 3000 });
  await expect(host).toHaveAttribute("data-interlude-scene", "paused");
  expect(
    await page.evaluate(() =>
      document
        .querySelector("[data-finished-turn]")
        ?.nextElementSibling?.getAttribute("data-interlude"),
    ),
  ).toBe("panel");
  expect((await diagnostic()).panel.loopRunning).toBe(false);
  for (const placement of ["overlay", "inline"]) {
    await worker.evaluate(async (value) => {
      const current = (await chrome.storage.local.get("interlude.settings"))["interlude.settings"];
      await chrome.storage.local.set({ "interlude.settings": { ...current, placement: value } });
    }, placement);
    await expect
      .poll(() => host.evaluate((element) => getComputedStyle(element).position))
      .toBe(placement === "overlay" ? "fixed" : "relative");
  }
  expect(
    await page.evaluate(() =>
      document
        .querySelector("[data-finished-turn]")
        ?.nextElementSibling?.getAttribute("data-interlude"),
    ),
  ).toBe("panel");
});
