import { expect, it } from "vitest";
import {
  readWebPreferences,
  saveWebPreferences,
  WEB_PREFERENCES_KEY,
} from "../../src/web/preferences";

function store(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

it("persists valid local AI and per-game speed choices", () => {
  const storage = store();
  const settings = readWebPreferences(storage);
  settings.pongDifficulty = "hard";
  settings.pongWatch = true;
  settings.pongAdaptive = true;
  settings.pongFirstTo = 3;
  settings.speeds.pong = 400;
  saveWebPreferences(storage, settings);
  expect(readWebPreferences(storage)).toEqual(settings);
});

it("drops malformed values and stays usable without storage", () => {
  const storage = store();
  storage.setItem(
    WEB_PREFERENCES_KEY,
    JSON.stringify({
      pongDifficulty: "imaginary",
      pongWatch: "yes",
      pongAdaptive: true,
      pongFirstTo: 500,
      speeds: { pong: 900, snake: 200, unknown: 100 },
    }),
  );
  expect(readWebPreferences(storage)).toEqual({
    speeds: { snake: 200 },
    pongDifficulty: "regular",
    pongWatch: false,
    pongAdaptive: true,
    pongFirstTo: 5,
  });
  expect(readWebPreferences(null).pongDifficulty).toBe("regular");
  storage.setItem(WEB_PREFERENCES_KEY, "broken json");
  expect(readWebPreferences(storage).pongWatch).toBe(false);
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  } as unknown as Storage;
  const fallback = readWebPreferences(blocked);
  expect(() => saveWebPreferences(blocked, fallback)).not.toThrow();
});
