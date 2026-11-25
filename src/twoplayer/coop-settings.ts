import { cleanPlayerName } from "./pong-settings";
import { readLocalJson, writeLocalJson, type LocalStorage } from "./local-storage";
import {
  defaultRaceSettings,
  raceBindingError,
  RACE_DURATIONS,
  type RaceKeys,
} from "./race-settings";

export const COOP_SETTINGS_KEY = "interlude.website.coop2048.settings.v1";
export const COOP_RECORDS_KEY = "interlude.website.coop2048.records.v1";
export const COOP_GOALS = [128, 256, 512, 1024, 2048] as const;
export const COOP_UNDOS = [0, 1, 3, 5] as const;

export interface CoopSettings {
  names: [string, string];
  keys: RaceKeys;
  seed: number;
  seconds: number;
  goal: number;
  undos: number;
}
export interface CoopResult {
  playedAt: number;
  names: [string, string];
  won: boolean;
  score: number;
  bestTile: number;
  goal: number;
  moves: number;
  seconds: number;
  seed: number;
}

export function defaultCoopSettings(): CoopSettings {
  const race = defaultRaceSettings("twenty48");
  return {
    names: race.names,
    keys: race.keys,
    seed: 2026,
    seconds: 300,
    goal: 2048,
    undos: 3,
  };
}

export function copyCoopSettings(settings: CoopSettings): CoopSettings {
  return {
    ...settings,
    names: [...settings.names],
    keys: [{ ...settings.keys[0] }, { ...settings.keys[1] }],
  };
}

export function validCoopSettings(settings: CoopSettings): boolean {
  return (
    !raceBindingError("twenty48", settings.keys) &&
    Number.isInteger(settings.seed) &&
    settings.seed >= 0 &&
    settings.seed <= 0xffffffff &&
    RACE_DURATIONS.some((value) => value === settings.seconds) &&
    COOP_GOALS.some((value) => value === settings.goal) &&
    COOP_UNDOS.some((value) => value === settings.undos)
  );
}

export function readCoopSettings(storage: LocalStorage): CoopSettings {
  const settings = defaultCoopSettings();
  const value = readLocalJson(storage, COOP_SETTINGS_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return settings;
  const data = value as Record<string, unknown>;
  if (Array.isArray(data.names)) {
    settings.names = [
      cleanPlayerName(data.names[0], "PLAYER 1"),
      cleanPlayerName(data.names[1], "PLAYER 2"),
    ];
  }
  if (
    Array.isArray(data.keys) &&
    data.keys.length === 2 &&
    data.keys.every((item) => item && typeof item === "object" && !Array.isArray(item))
  ) {
    const keys = data.keys as RaceKeys;
    if (!raceBindingError("twenty48", keys)) settings.keys = [{ ...keys[0] }, { ...keys[1] }];
  }
  if (
    typeof data.seed === "number" &&
    Number.isInteger(data.seed) &&
    data.seed >= 0 &&
    data.seed <= 0xffffffff
  )
    settings.seed = data.seed;
  if (RACE_DURATIONS.some((value) => value === data.seconds))
    settings.seconds = data.seconds as number;
  if (COOP_GOALS.some((value) => value === data.goal)) settings.goal = data.goal as number;
  if (COOP_UNDOS.some((value) => value === data.undos)) settings.undos = data.undos as number;
  return settings;
}

export function saveCoopSettings(storage: LocalStorage, settings: CoopSettings): void {
  writeLocalJson(storage, COOP_SETTINGS_KEY, settings);
}

export function readCoopRecords(storage: LocalStorage): CoopResult[] {
  const value = readLocalJson(storage, COOP_RECORDS_KEY);
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry: unknown): entry is CoopResult => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const item = entry as Record<string, unknown>;
      const nonnegative = (v: unknown): v is number =>
        typeof v === "number" && Number.isFinite(v) && v >= 0;
      return (
        typeof item.playedAt === "number" &&
        Number.isFinite(item.playedAt) &&
        Array.isArray(item.names) &&
        item.names.length === 2 &&
        item.names.every((name: unknown) => typeof name === "string" && name.length <= 12) &&
        typeof item.won === "boolean" &&
        nonnegative(item.score) &&
        nonnegative(item.bestTile) &&
        COOP_GOALS.some((value) => value === item.goal) &&
        nonnegative(item.moves) &&
        nonnegative(item.seconds) &&
        item.seconds <= 300 &&
        nonnegative(item.seed) &&
        Number.isInteger(item.seed) &&
        item.seed <= 0xffffffff
      );
    })
    .slice(-100);
}

export function appendCoopRecord(
  storage: LocalStorage,
  record: CoopResult,
  sessionRecords: readonly CoopResult[] = [],
): CoopResult[] {
  const stored = readCoopRecords(storage);
  const records = [...(stored.length ? stored : sessionRecords), record].slice(-100);
  writeLocalJson(storage, COOP_RECORDS_KEY, records);
  return records;
}
