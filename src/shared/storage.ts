/**
 * Settings schema, defaults, and chrome.storage.local persistence.
 * Everything the panel, options page, popup, and diagnostics read lives here.
 */

export type Placement = "inline" | "overlay" | "docked-composer" | "side-panel";
export type GameChoice = "last" | "random" | string;

export interface InterludeSettings {
  /** Master switch. When false the extension does nothing at all. */
  enabled: boolean;
  /** Delay after the generating signal before the panel reveals (ms). */
  delayMs: number;
  /** Where the panel mounts. */
  placement: Placement;
  /** Which game to launch: "last", "random", or a game id. */
  game: GameChoice;
  /** Pause the game and offer RESUME/CLOSE when generation finishes. */
  pauseOnFinish: boolean;
  /** Auto-close the panel after the grace period once generation finishes. */
  autoClose: boolean;
  autoCloseGraceMs: number;
  /** Skip the POWER-ON flicker. */
  skipBoot: boolean;
  /** Mute all synthesized audio. */
  muted: boolean;
  /** Keyboard hotkey that moves focus into the game (default Alt+G). */
  focusHotkey: string;
  /** Signal D: main-world stream timing hook (never reads content). */
  streamHookEnabled: boolean;
  /** Undo allowance in 2048. */
  undo2048: number;
  /** Snake: pass through walls instead of dying. */
  snakeWrap: boolean;
  /** Pong AI difficulty. */
  pongDifficulty: "rookie" | "regular" | "veteran";
  /** Pong: points to win. */
  pongFirstTo: number;
  /** BLOCKFALL: lock delay seconds multiplier not needed; kept simple. */
  blockfallGhost: boolean;
  /** BLOCKFALL: show ghost piece. */
  blockfallHold: boolean;
}

export const DEFAULT_SETTINGS: InterludeSettings = {
  enabled: true,
  delayMs: 500,
  placement: "inline",
  game: "last",
  pauseOnFinish: true,
  autoClose: false,
  autoCloseGraceMs: 10_000,
  skipBoot: false,
  muted: false,
  focusHotkey: "Alt+G",
  streamHookEnabled: false,
  undo2048: 3,
  snakeWrap: false,
  pongDifficulty: "regular",
  pongFirstTo: 5,
  blockfallGhost: true,
  blockfallHold: true,
};

const SETTINGS_KEY = "interlude.settings";
const HIGHSCORES_KEY = "interlude.highscores";
const LAST_PLAYED_KEY = "interlude.lastPlayed";
const KEYBINDS_KEY = "interlude.keybindings";
const OVERLAY_POS_KEY = "interlude.overlayPositions";

const hasChromeStorage = (): boolean =>
  typeof chrome !== "undefined" && !!chrome.storage?.local;

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

export async function loadSettings(): Promise<InterludeSettings> {
  const stored = await storageGet<Partial<InterludeSettings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(
  patch: Partial<InterludeSettings>,
): Promise<InterludeSettings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await storageSet(SETTINGS_KEY, next);
  return next;
}

export async function loadHighScores(): Promise<Record<string, number>> {
  return (await storageGet<Record<string, number>>(HIGHSCORES_KEY)) ?? {};
}

export async function saveHighScore(
  gameId: string,
  score: number,
): Promise<{ best: number; isRecord: boolean }> {
  const scores = await loadHighScores();
  const prev = scores[gameId] ?? 0;
  if (score > prev) {
    scores[gameId] = score;
    await storageSet(HIGHSCORES_KEY, scores);
    return { best: score, isRecord: true };
  }
  return { best: prev, isRecord: false };
}

export async function loadLastPlayed(): Promise<string | undefined> {
  return storageGet<string>(LAST_PLAYED_KEY);
}

export async function saveLastPlayed(gameId: string): Promise<void> {
  await storageSet(LAST_PLAYED_KEY, gameId);
}

/** Per-game action → KeyboardEvent.code map. UI lands in a later prompt. */
export type Keybindings = Record<string, Record<string, string>>;

export async function loadKeybindings(): Promise<Keybindings> {
  return (await storageGet<Keybindings>(KEYBINDS_KEY)) ?? {};
}

export async function saveKeybindings(
  keybindings: Keybindings,
): Promise<void> {
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
