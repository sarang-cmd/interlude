/** Local data persistence. Settings live in the schema-driven sync store. */
import { defaults, type InterludeSettings } from "../settings/schema";
export type { InterludeSettings, Placement } from "../settings/schema";
export { loadSettings, saveSettings } from "../settings/store";
export type GameChoice = "last" | "random" | string;
export const DEFAULT_SETTINGS: InterludeSettings = defaults();

const HIGHSCORES_KEY = "interlude.highscores";
const LAST_PLAYED_KEY = "interlude.lastPlayed";
const KEYBINDS_KEY = "interlude.keybindings";
const OVERLAY_POS_KEY = "interlude.overlayPositions";

const hasChromeStorage = (): boolean => typeof chrome !== "undefined" && !!chrome.storage?.local;

/** In-memory fallback so engine/tests run outside an extension context. */
const memoryStore = new Map<string, unknown>();

async function storageGet<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }
  return memoryStore.get(key) as T | undefined;
}

async function storageSet(key: string, value: unknown): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  memoryStore.set(key, value);
}

export async function loadHighScores(): Promise<Record<string, number>> {
  return (await storageGet<Record<string, number>>(HIGHSCORES_KEY)) ?? {};
}

export interface HighScoreResult {
  best: number;
  isRecord: boolean;
}
// The service worker owns this queue in the extension. It serializes concurrent
// score writes from different tabs so a game or the 2048 tile record is not lost.
let scoreQueue: Promise<void> = Promise.resolve();
export function saveHighScoreLocally(gameId: string, score: number): Promise<HighScoreResult> {
  const operation = scoreQueue.then(async () => {
    if (!/^[a-z0-9:-]{1,64}$/.test(gameId) || !Number.isFinite(score) || score < 0)
      throw new Error("Invalid high score");
    const scores = await loadHighScores();
    const prev = scores[gameId] ?? 0;
    if (score > prev) {
      scores[gameId] = score;
      await storageSet(HIGHSCORES_KEY, scores);
      return { best: score, isRecord: true };
    }
    return { best: prev, isRecord: false };
  });
  // A rejected write must not poison the next queued operation.
  scoreQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export async function saveHighScore(gameId: string, score: number): Promise<HighScoreResult> {
  if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime.sendMessage) {
    try {
      const result: unknown = await chrome.runtime.sendMessage({
        type: "INTERLUDE_SAVE_SCORE",
        gameId,
        score,
      });
      if (
        result &&
        typeof result === "object" &&
        typeof (result as HighScoreResult).best === "number" &&
        typeof (result as HighScoreResult).isRecord === "boolean"
      )
        return result as HighScoreResult;
    } catch {
      /* extension is shutting down; use local storage if possible */
    }
  }
  return saveHighScoreLocally(gameId, score);
}

export async function loadLastPlayed(): Promise<string | undefined> {
  return storageGet<string>(LAST_PLAYED_KEY);
}

export async function saveLastPlayed(gameId: string): Promise<void> {
  await storageSet(LAST_PLAYED_KEY, gameId);
}

/** Per-game action → KeyboardEvent.code map, stored separately from defaults. */
export type Keybindings = Record<string, Record<string, string>>;

export async function loadKeybindings(): Promise<Keybindings> {
  return (await storageGet<Keybindings>(KEYBINDS_KEY)) ?? {};
}

export async function saveKeybindings(keybindings: Keybindings): Promise<void> {
  await storageSet(KEYBINDS_KEY, keybindings);
}

/** Overlay placement remembers position per site (host origin key). */
export type OverlayPositions = Record<string, { x: number; y: number }>;

export async function loadOverlayPositions(): Promise<OverlayPositions> {
  return (await storageGet<OverlayPositions>(OVERLAY_POS_KEY)) ?? {};
}

export async function saveOverlayPosition(
  siteKey: string,
  pos: { x: number; y: number },
): Promise<void> {
  const all = await loadOverlayPositions();
  all[siteKey] = pos;
  await storageSet(OVERLAY_POS_KEY, all);
}
