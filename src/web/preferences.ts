import { AI_LEVELS, isAIDifficulty, type AIDifficulty } from "../ai/difficulty";
import { GAME_IDS, SPEED_CHOICES } from "../games/catalog";

export const WEB_PREFERENCES_KEY = "interlude.website.preferences.v1";
export const PONG_TARGETS = [1, 3, 5, 7, 11] as const;

export interface WebPreferences {
  speeds: Record<string, number>;
  pongDifficulty: AIDifficulty;
  pongAdaptive: boolean;
  pongWatch: boolean;
  pongFirstTo: number;
  boardDifficulty: AIDifficulty;
  tictactoeDifficulty: AIDifficulty;
  tictactoeWatch: boolean;
  tictactoeSize: "3" | "4" | "5";
}

export function readWebPreferences(storage: Storage | null): WebPreferences {
  const defaults: WebPreferences = {
    speeds: {},
    pongDifficulty: "regular",
    pongAdaptive: false,
    pongWatch: false,
    pongFirstTo: 5,
    boardDifficulty: "regular",
    tictactoeDifficulty: "regular",
    tictactoeWatch: false,
    tictactoeSize: "3",
  };
  try {
    const value: unknown = JSON.parse(storage?.getItem(WEB_PREFERENCES_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
    const data = value as Record<string, unknown>;
    if (isAIDifficulty(data.pongDifficulty)) defaults.pongDifficulty = data.pongDifficulty;
    if (isAIDifficulty(data.boardDifficulty)) defaults.boardDifficulty = data.boardDifficulty;
    if (isAIDifficulty(data.tictactoeDifficulty))
      defaults.tictactoeDifficulty = data.tictactoeDifficulty;
    if (typeof data.tictactoeWatch === "boolean") defaults.tictactoeWatch = data.tictactoeWatch;
    if (data.tictactoeSize === "3" || data.tictactoeSize === "4" || data.tictactoeSize === "5")
      defaults.tictactoeSize = data.tictactoeSize;
    if (typeof data.pongAdaptive === "boolean") defaults.pongAdaptive = data.pongAdaptive;
    if (typeof data.pongWatch === "boolean") defaults.pongWatch = data.pongWatch;
    if (
      typeof data.pongFirstTo === "number" &&
      PONG_TARGETS.some((item) => item === data.pongFirstTo)
    )
      defaults.pongFirstTo = data.pongFirstTo;
    if (data.speeds && typeof data.speeds === "object" && !Array.isArray(data.speeds)) {
      for (const [game, speed] of Object.entries(data.speeds)) {
        if (
          GAME_IDS.some((id) => id === game) &&
          typeof speed === "number" &&
          SPEED_CHOICES.some((item) => item === speed)
        )
          defaults.speeds[game] = speed;
      }
    }
  } catch {
    // The arcade stays playable when storage is unavailable or damaged.
  }
  return defaults;
}

export function saveWebPreferences(storage: Storage | null, preferences: WebPreferences): void {
  try {
    storage?.setItem(WEB_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences last for this page session if storage is blocked.
  }
}

export { AI_LEVELS, SPEED_CHOICES };
