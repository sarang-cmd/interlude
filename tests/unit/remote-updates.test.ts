import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign, webcrypto } from "node:crypto";
import published from "../../deployment/selectors/v1.json";
import previous from "../../test/fixtures/selectors/previous.json";
import { SELECTOR_PUBLIC_KEY } from "../../src/updates/publicKey";
import {
  canonicalJSON,
  checkSelectorUpdates,
  loadVerifiedSelectors,
  SELECTOR_CACHE_KEY,
  SELECTOR_INTERVAL_MS,
  SELECTOR_STATUS_KEY,
  validSelectorPayload,
  verifySignedSelectors,
} from "../../src/updates/selectors";
import {
  checkForUpdate,
  currentUpdateStatus,
  isNewer,
  parseRelease,
  UPDATE_INTERVAL_MS,
  UPDATE_STATUS_KEY,
  UPDATE_URL,
} from "../../src/updates/release";
import { fetchStaticJSON } from "../../src/updates/transport";

function storage() {
  const values: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [key, structuredClone(values[key])]),
          ),
        set: async (items: Record<string, unknown>) =>
          Object.assign(values, structuredClone(items)),
      },
    },
  });
  vi.stubGlobal("crypto", webcrypto);
  return values;
}
afterEach(() => vi.unstubAllGlobals());
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const now = Date.parse(published.payload.issuedAt) + 3_600_000;

describe("signed selectors", () => {
  it("verifies shipped fixture and rejects tampering, unknown fields, malformed data and wrong keys", async () => {
    storage();
    expect(await verifySignedSelectors(published)).not.toBeNull();
    expect(SELECTOR_PUBLIC_KEY).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    const altered = structuredClone(published);
    altered.payload.sites.claude.stopControl[0] = "button";
    expect(await verifySignedSelectors(altered)).toBeNull();
    expect(await verifySignedSelectors({ ...published, extra: true })).toBeNull();
    expect(await verifySignedSelectors({ ...published, signature: "a" })).toBeNull();
    const bad = structuredClone(published.payload) as Record<string, unknown>;
    (bad.sites as Record<string, unknown>).unknown = {};
    expect(validSelectorPayload(bad)).toBe(false);
    const oversized = structuredClone(published.payload);
    oversized.sites.gemini.indicator = ["x".repeat(501)];
    expect(validSelectorPayload(oversized)).toBe(false);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const raw = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64");
    const signature = sign(
      null,
      Buffer.from(canonicalJSON(published.payload)),
      privateKey,
    ).toString("base64");
    expect(
      await verifySignedSelectors({ payload: published.payload, signature }, raw),
    ).not.toBeNull();
    expect(await verifySignedSelectors({ payload: published.payload, signature })).toBeNull();
  });
  it("fetches once per 12 hours without credentials, rejects bad updates and retains the last good file", async () => {
    const values = storage();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(published))
      .mockResolvedValueOnce(response({ ...published, signature: "tampered" }))
      .mockResolvedValueOnce(response(previous));
    vi.stubGlobal("fetch", fetch);
    const target = "https://example.org/selectors.json";
    const [first, same] = await Promise.all([
      checkSelectorUpdates(target, now),
      checkSelectorUpdates(target, now),
    ]);
    expect(first.result).toBe("VERIFIED");
    expect(same).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [request, init] = fetch.mock.calls[0]!;
    expect(request).toBe(target);
    expect(init).toMatchObject({
      method: "GET",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(await loadVerifiedSelectors()).toEqual(published);
    await checkSelectorUpdates(
      "https://other.example/ignored.json",
      now + SELECTOR_INTERVAL_MS - 1,
    );
    await checkSelectorUpdates(target, now - 1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const invalid = await checkSelectorUpdates(target, now + SELECTOR_INTERVAL_MS);
    expect(invalid.result).toBe("INVALID SCHEMA OR SIGNATURE");
    expect(values[SELECTOR_CACHE_KEY]).toEqual(published);
    const rollback = await checkSelectorUpdates(target, now + 2 * SELECTOR_INTERVAL_MS);
    expect(rollback.result).toBe("OLDER THAN LAST GOOD FILE");
    expect(values[SELECTOR_CACHE_KEY]).toEqual(published);
    expect((values[SELECTOR_STATUS_KEY] as { lastCheck: number }).lastCheck).toBe(
      now + 2 * SELECTOR_INTERVAL_MS,
    );
  });
  it("fails closed on HTML, blocked CORS, query strings and excessive bodies", async () => {
    storage();
    const fetch = vi.fn().mockResolvedValueOnce(new Response("<html>not json</html>"));
    vi.stubGlobal("fetch", fetch);
    expect((await checkSelectorUpdates("https://example.org/selectors.json", now)).result).toBe(
      "INVALID JSON",
    );
    fetch.mockRejectedValueOnce(new TypeError("failed to fetch secret-url"));
    expect(
      (await checkSelectorUpdates("https://example.org/selectors.json", now + SELECTOR_INTERVAL_MS))
        .result,
    ).toBe("NETWORK OR CORS ERROR");
    await expect(fetchStaticJSON("https://example.org/file.json?uid=1")).rejects.toThrow(
      "INVALID URL",
    );
    fetch.mockResolvedValueOnce(new Response("x".repeat(200_001)));
    await expect(fetchStaticJSON("https://example.org/file.json")).rejects.toThrow(
      "FILE TOO LARGE",
    );
  });
});

describe("release checks", () => {
  const release = {
    version: "1.2.3",
    url: "https://github.com/sarang-cmd/interlude/releases/download/v1.2.3/interlude-v1.2.3.zip",
  };
  it("compares stable versions and permits only the official matching release link", () => {
    expect(isNewer("1.2.3", "1.2.2")).toBe(true);
    expect(isNewer("1.2.0", "1.10.0")).toBe(false);
    expect(isNewer("1.2.3-beta", "1.0.0")).toBe(false);
    expect(parseRelease(release)).toEqual(release);
    expect(parseRelease({ ...release, url: "https://bad.example/1.zip" })).toBeNull();
    expect(parseRelease({ ...release, extra: "tracking" })).toBeNull();
    expect(
      currentUpdateStatus({ result: "CHECKED", lastCheck: 5, ...release }, "1.2.3")?.available,
    ).toBe(false);
  });
  it("checks the one static endpoint once a day, keeps a known notice on failure and never downloads", async () => {
    const values = storage();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(release))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    const result = await checkForUpdate("0.2.0", now);
    expect(result).toMatchObject({ available: true, result: "CHECKED", ...release });
    expect(fetch.mock.calls[0]![0]).toBe(UPDATE_URL);
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    await checkForUpdate("0.2.0", now + UPDATE_INTERVAL_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const failed = await checkForUpdate("0.2.0", now + UPDATE_INTERVAL_MS);
    expect(failed).toMatchObject({ available: true, result: "NETWORK OR CORS ERROR", ...release });
    expect(values[UPDATE_STATUS_KEY]).toEqual(failed);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
