import { afterEach, expect, it, vi } from "vitest";
import { wipeEverything } from "../../src/settings/data";
import { loadSettings, LOCAL_PREFERRED_KEY, SETTINGS_KEY } from "../../src/settings/store";

afterEach(() => vi.unstubAllGlobals());

it("wipes local records and warns when sync fails without resurrecting old synced settings", async () => {
  let syncAvailable = false;
  const old = { version: 2, global: { volume: 7 }, sites: {} };
  const local: Record<string, unknown> = {
    [SETTINGS_KEY]: old,
    "interlude.settings": { volume: 8 },
    "interlude.highscores": { snake: 42 },
    "interlude.playStats": { secret: "old" },
  };
  const sync: Record<string, unknown> = { [SETTINGS_KEY]: old };
  function area(store: Record<string, unknown>, syncArea = false) {
    return {
      get: async (keys: string | string[] | null) => {
        const list = keys === null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(
          list.filter((key) => Object.hasOwn(store, key)).map((key) => [key, store[key]]),
        );
      },
      set: async (items: Record<string, unknown>) => Object.assign(store, structuredClone(items)),
      remove: async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
      },
      clear: async () => {
        if (syncArea && !syncAvailable) throw new Error("sync unavailable");
        for (const key of Object.keys(store)) delete store[key];
      },
    };
  }
  vi.stubGlobal("chrome", { storage: { local: area(local), sync: area(sync, true) } });

  expect(await wipeEverything()).toEqual({ syncCleared: false });
  expect(sync[SETTINGS_KEY]).toEqual(old); // The remote copy still exists: UI must say so.
  expect(local[LOCAL_PREFERRED_KEY]).toBe(true);
  expect(local[SETTINGS_KEY]).toEqual({ version: 2, global: {}, sites: {} });
  expect(Object.keys(local).sort()).toEqual([LOCAL_PREFERRED_KEY, SETTINGS_KEY].sort());
  expect((await loadSettings()).volume).toBe(35); // Do not rehydrate the old synced volume.

  syncAvailable = true;
  expect(await wipeEverything()).toEqual({ syncCleared: true });
  expect(sync).toEqual({});
  expect(local).toEqual({});
  expect((await loadSettings()).volume).toBe(35);
});
