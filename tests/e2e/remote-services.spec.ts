import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const signed = JSON.parse(fs.readFileSync("test/fixtures/selectors/custom.json", "utf8")) as {
  payload: { sites: { chatgpt: { stopControl: string[] } } };
  signature: string;
};

let context: BrowserContext, page: Page, worker: Worker;
test.beforeEach(async () => {
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  page = await context.newPage();
});
test.afterEach(async () => {
  await context.close();
});
const initial = {
  version: 2,
  global: {
    delayMs: 0,
    skipBoot: true,
    muted: true,
    autoClose: false,
    updateChecks: false,
    remoteSelectors: false,
  },
  sites: {},
};

test("verified selectors apply live, local overrides win, and tampering falls back", async () => {
  await worker.evaluate(async (settings) => {
    await chrome.storage.local.set({
      "interlude.remoteSelectorStatus": { lastCheck: Date.now(), result: "CHECKED" },
    });
    await chrome.storage.sync.set({ "interlude.settings.v2": settings });
  }, initial);
  const fixture = fs.readFileSync("test/fixtures/chatgpt/conversation.html", "utf8");
  await page.route("https://chatgpt.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: fixture }),
  );
  await page.goto("https://chatgpt.com/chat/fixture");
  const panel = page.locator('[data-interlude="panel"]');
  await expect(panel).toHaveCount(1);
  await page.locator('[data-testid="send-button"]').click();
  await expect(panel).toBeVisible();
  await panel.evaluate((element) => element.setAttribute("data-test-instance", "same"));
  const report = () =>
    worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
      return chrome.tabs.sendMessage(tab!.id!, { type: "INTERLUDE_DIAGNOSTICS" });
    });
  expect((await report()).selectorSource).toBe("BUNDLED");
  await worker.evaluate(
    async ({ fixture, settings }) => {
      await chrome.storage.local.set({ "interlude.remoteSelectorCache": fixture });
      settings.global.remoteSelectors = true;
      await chrome.storage.sync.set({ "interlude.settings.v2": settings });
    },
    { fixture: signed, settings: structuredClone(initial) },
  );
  await expect.poll(async () => (await report()).selectorSource).toBe("SIGNED REMOTE");
  await expect
    .poll(async () => (await report()).signals.a.matchedSelector)
    .toBe("[data-testid='stop-button']");
  await expect(panel).toHaveAttribute("data-test-instance", "same");
  await worker.evaluate(() =>
    chrome.storage.local.set({ "interlude.chatgptSelectors": { stopControl: ["#not-a-stop"] } }),
  );
  await expect.poll(async () => (await report()).selectorSource).toBe("LOCAL OVERRIDE");
  await expect.poll(async () => (await report()).signals.a.active).toBe(false);
  await worker.evaluate(() => chrome.storage.local.remove("interlude.chatgptSelectors"));
  await expect.poll(async () => (await report()).selectorSource).toBe("SIGNED REMOTE");
  const tampered = structuredClone(signed);
  tampered.payload.sites.chatgpt.stopControl = ["#bad"];
  await worker.evaluate(
    (fixture) => chrome.storage.local.set({ "interlude.remoteSelectorCache": fixture }),
    tampered,
  );
  await expect.poll(async () => (await report()).selectorSource).toBe("BUNDLED");
  await expect
    .poll(async () => (await report()).signals.a.matchedSelector)
    .toBe("button[data-testid='stop-button']");
  await expect(panel).toHaveAttribute("data-test-instance", "same");
});

test("service checks are credential-free, rate limited, and update the quiet badge and options notice", async () => {
  // Let the initial default check settle before replacing the service-worker transport.
  await expect
    .poll(
      async () => {
        const result = await worker.evaluate(
          async () =>
            (await chrome.storage.local.get("interlude.updateStatus"))["interlude.updateStatus"]
              ?.result,
        );
        return typeof result === "string" && result !== "CHECK INTERRUPTED OR IN PROGRESS";
      },
      { timeout: 12000 },
    )
    .toBe(true);
  const release = {
    version: "0.3.0",
    url: "https://github.com/sarang-cmd/interlude/releases/download/v0.3.0/interlude-v0.3.0.zip",
  };
  await worker.evaluate(
    async ({ selector, release }) => {
      const scope = globalThis as typeof globalThis & {
        recordedRequests: Array<{
          url: string;
          method: string;
          credentials: string;
          redirect: string;
          referrerPolicy: string;
          hasHeaders: boolean;
        }>;
      };
      scope.recordedRequests = [];
      scope.fetch = async (input, init) => {
        const url = String(input);
        scope.recordedRequests.push({
          url,
          method: init?.method ?? "",
          credentials: init?.credentials ?? "",
          redirect: init?.redirect ?? "",
          referrerPolicy: init?.referrerPolicy ?? "",
          hasHeaders: !!init?.headers,
        });
        return new Response(JSON.stringify(url.includes("selectors") ? selector : release), {
          status: 200,
        });
      };
      await chrome.storage.local.set({
        "interlude.updateStatus": { lastCheck: 0, result: "OLD", available: false },
        "interlude.remoteSelectorStatus": { lastCheck: 0, result: "OLD" },
      });
    },
    { selector: signed, release },
  );
  await worker.evaluate(
    (settings) =>
      chrome.storage.sync.set({
        "interlude.settings.v2": {
          ...settings,
          global: {
            ...settings.global,
            updateChecks: true,
            remoteSelectors: true,
            selectorUrl: "https://example.org/selectors.json",
          },
        },
      }),
    initial,
  );
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.local.get("interlude.remoteSelectorStatus"))[
            "interlude.remoteSelectorStatus"
          ]?.result,
      ),
    )
    .toBe("VERIFIED");

  await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe("NEW");
  const id = new URL(worker.url()).hostname;
  await page.goto(`chrome-extension://${id}/options.html`);
  await expect(page.locator(".update")).toContainText("0.3.0");
  await expect(page.locator(".update a")).toHaveAttribute("href", release.url);
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "INTERLUDE_CHECK_SERVICES" }));
  const requests = await worker.evaluate(
    () =>
      (globalThis as typeof globalThis & { recordedRequests: Array<Record<string, unknown>> })
        .recordedRequests,
  );
  expect(requests).toHaveLength(2);
  expect(requests.map((row) => row.url).sort()).toEqual(
    [
      "https://example.org/selectors.json",
      "https://interlude-sepia.vercel.app/updates/latest.json",
    ].sort(),
  );
  for (const req of requests)
    expect(req).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      hasHeaders: false,
    });
  await worker.evaluate(
    (settings) =>
      chrome.storage.sync.set({
        "interlude.settings.v2": {
          ...settings,
          global: { ...settings.global, updateChecks: false },
        },
      }),
    initial,
  );
  await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
  await expect(page.locator(".update")).toHaveCount(0);
});
