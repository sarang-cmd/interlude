import { afterEach, describe, expect, it, vi } from "vitest";
import { defaults, SETTINGS_SCHEMA, SETTINGS_BY_ID, validValue } from "../../src/settings/schema";
import {
  loadSettings,
  loadSettingsDocument,
  migrateSettings,
  resetSettings,
  saveSettings,
  SETTINGS_KEY,
} from "../../src/settings/store";

afterEach(() => {
  vi.unstubAllGlobals();
});
function fakeStorage(syncFails = false) {
  const local: Record<string, unknown> = {};
  const sync: Record<string, unknown> = {};
  const area = (store: Record<string, unknown>, failed = false) => ({
    get: async (keys: string | string[]) => {
      if (failed) throw new Error("offline");
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.map((key) => [key, store[key]]));
    },
    set: async (items: Record<string, unknown>) => {
      if (failed) throw new Error("offline");
      Object.assign(store, structuredClone(items));
    },
  });
  vi.stubGlobal("chrome", { storage: { local: area(local), sync: area(sync, syncFails) } });
  return { local, sync };
}

describe("settings schema and storage", () => {
  it("gives every setting unique, complete metadata and a valid default", () => {
    const ids = SETTINGS_SCHEMA.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const setting of SETTINGS_SCHEMA) {
      expect(
        setting.label && setting.description && setting.category && setting.tags.length,
      ).toBeTruthy();
      expect(validValue(setting, setting.default)).toBe(true);
      if (setting.requires) expect(SETTINGS_BY_ID.has(setting.requires.id)).toBe(true);
    }
    expect(defaults().autoClose).toBe(true);
    expect(defaults().autoCloseGraceMs).toBe(10000);
    expect(defaults().budgetEnabled).toBe(false);
    expect(defaults().budgetLockout).toBe(false);
  });

  it("migrates old local settings and repairs invalid values without throwing", async () => {
    const { local, sync } = fakeStorage();
    local["interlude.settings"] = {
      delayMs: 1300,
      placement: "not-a-place",
      muted: true,
      extra: 42,
    };
    const doc = await loadSettingsDocument();
    expect(doc.version).toBe(2);
    expect(doc.global).toEqual({ delayMs: 1300, muted: true });
    expect(sync[SETTINGS_KEY]).toEqual(doc);
    expect((await loadSettings()).placement).toBe("inline");
    expect(
      migrateSettings({
        version: 2,
        global: { volume: 101, signals: ["z"] },
        sites: { claude: { delayMs: -1 }, chatgpt: { enabled: false } },
      }),
    ).toEqual({ version: 2, global: {}, sites: { chatgpt: { enabled: false } } });
  });

  it("resolves site, global, then default, and reset removes an override", async () => {
    fakeStorage();
    await saveSettings({ delayMs: 900, volume: 20 });
    await saveSettings({ delayMs: 1500 }, "claude");
    await saveSettings({ delayMs: 2100 }, "gemini");
    expect((await loadSettings("claude")).delayMs).toBe(1500);
    expect((await loadSettings("chatgpt")).delayMs).toBe(900);
    expect((await loadSettings("gemini")).delayMs).toBe(2100);
    expect((await loadSettings("claude")).volume).toBe(20);
    await resetSettings(["delayMs"], "claude");
    expect((await loadSettings("claude")).delayMs).toBe(900);
    await resetSettings(["delayMs"]);
    expect((await loadSettings("claude")).delayMs).toBe(500);
  });

  it("falls back to local when sync fails, and rejects illegal site or value changes", async () => {
    const { local } = fakeStorage(true);
    await saveSettings({ delayMs: 600, volume: -5, budgetEnabled: true }, "claude");
    expect((await loadSettings("claude")).delayMs).toBe(600);
    expect((await loadSettings("claude")).volume).toBe(35);
    expect((await loadSettings("claude")).budgetEnabled).toBe(false);
    expect(local["interlude.settings.localPreferred"]).toBe(true);
  });
});

it("does not rewrite valid sync documents merely because chrome reordered object keys", async () => {
  const { sync } = fakeStorage();
  sync[SETTINGS_KEY] = {
    global: { volume: 30, delayMs: 700 },
    sites: { gemini: { enabled: false } },
    version: 2,
  };
  const before = structuredClone(sync[SETTINGS_KEY]);
  const set = vi.spyOn(chrome.storage.sync, "set");
  for (let i = 0; i < 3; i++) await loadSettingsDocument();
  expect(sync[SETTINGS_KEY]).toEqual(before);
  expect(set).not.toHaveBeenCalled();
});
