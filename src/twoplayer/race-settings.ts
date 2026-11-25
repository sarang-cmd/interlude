import type { GameAction } from "../engine/input";
import type { GameId } from "../games/catalog";
import { cleanPlayerName } from "./pong-settings";
import { readLocalJson, writeLocalJson, type LocalStorage } from "./local-storage";

export const RACE_GAMES = [
  "snake",
  "breakout",
  "flappy",
  "twenty48",
  "blockfall",
  "rockfall",
  "dashline",
] as const satisfies readonly GameId[];
export type RaceGameId = (typeof RACE_GAMES)[number];
export type RaceAction = Exclude<GameAction, "confirm" | "pause">;
export type RaceKeys = [Partial<Record<RaceAction, string>>, Partial<Record<RaceAction, string>>];
export type RaceWinner = 1 | 2 | null;
export const RACE_DURATIONS = [30, 60, 120, 180, 300] as const;
export const RACE_HANDICAPS = [100, 125, 150, 200] as const;
export const RACE_RECORDS_KEY = "interlude.website.race.records.v1";
export const raceSettingsKey = (game: RaceGameId): string =>
  `interlude.website.race.${game}.settings.v1`;

const ACTIONS: Record<RaceGameId, ReadonlyArray<[RaceAction, string]>> = {
  snake: [
    ["left", "steer left"],
    ["right", "steer right"],
    ["up", "steer up"],
    ["down", "steer down"],
  ],
  breakout: [
    ["left", "move left"],
    ["right", "move right"],
    ["primary", "launch"],
  ],
  flappy: [["primary", "flap"]],
  twenty48: [
    ["left", "slide left"],
    ["right", "slide right"],
    ["up", "slide up"],
    ["down", "slide down"],
    ["secondary", "undo"],
  ],
  blockfall: [
    ["left", "move left"],
    ["right", "move right"],
    ["up", "rotate"],
    ["down", "soft drop"],
    ["primary", "hard drop"],
    ["secondary", "hold"],
  ],
  rockfall: [
    ["left", "turn left"],
    ["right", "turn right"],
    ["up", "thrust"],
    ["primary", "fire"],
  ],
  dashline: [["primary", "jump"]],
};
const DEFAULT_KEYS: [Record<RaceAction, string>, Record<RaceAction, string>] = [
  { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", primary: "KeyF", secondary: "KeyQ" },
  {
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    primary: "Space",
    secondary: "Enter",
  },
];
const KEY_PATTERN = /^(Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Numpad[0-9]|Space|Enter)$/;

export interface RaceSettings {
  names: [string, string];
  keys: RaceKeys;
  handicap: [number, number];
  bestOf: 1 | 3 | 5;
  seed: number;
  seconds: number;
}
export interface RaceResult {
  game: RaceGameId;
  playedAt: number;
  names: [string, string];
  scores: [number, number];
  adjusted: [number, number];
  handicap: [number, number];
  survival: [number, number];
  winner: RaceWinner;
  seed: number;
}

export function isRaceGame(game: string): game is RaceGameId {
  return RACE_GAMES.some((candidate) => candidate === game);
}

export function raceActions(game: RaceGameId): ReadonlyArray<[RaceAction, string]> {
  return ACTIONS[game];
}

export function defaultRaceSettings(game: RaceGameId): RaceSettings {
  const actions = ACTIONS[game];
  const keys = [0, 1].map((index) =>
    Object.fromEntries(actions.map(([action]) => [action, DEFAULT_KEYS[index]![action]])),
  ) as RaceKeys;
  return {
    names: ["PLAYER 1", "PLAYER 2"],
    keys,
    handicap: [100, 100],
    bestOf: 3,
    seed: 2026,
    seconds: 120,
  };
}

export function copyRaceSettings(settings: RaceSettings): RaceSettings {
  return {
    names: [...settings.names],
    keys: [{ ...settings.keys[0] }, { ...settings.keys[1] }],
    handicap: [...settings.handicap],
    bestOf: settings.bestOf,
    seed: settings.seed,
    seconds: settings.seconds,
  };
}

export function raceBindingError(game: RaceGameId, keys: RaceKeys): string | null {
  const codes = [0, 1].flatMap((player) => ACTIONS[game].map(([action]) => keys[player]?.[action]));
  if (
    codes.some((code) => typeof code !== "string" || !KEY_PATTERN.test(code) || code === "KeyP")
  ) {
    return "Choose a letter, number, arrow, Space or Enter. P is reserved for pause.";
  }
  if (new Set(codes).size !== codes.length) return "Each action needs a different key.";
  return null;
}

function isUint32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function readRaceSettings(storage: LocalStorage, game: RaceGameId): RaceSettings {
  const settings = defaultRaceSettings(game);
  const value = readLocalJson(storage, raceSettingsKey(game));
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
    if (!raceBindingError(game, keys)) {
      settings.keys = [{ ...keys[0] }, { ...keys[1] }];
    }
  }
  if (
    Array.isArray(data.handicap) &&
    data.handicap.length === 2 &&
    data.handicap.every((value) => RACE_HANDICAPS.some((choice) => choice === value))
  )
    settings.handicap = [data.handicap[0] as number, data.handicap[1] as number];
  if (data.bestOf === 1 || data.bestOf === 3 || data.bestOf === 5) settings.bestOf = data.bestOf;
  if (isUint32(data.seed)) settings.seed = data.seed;
  if (RACE_DURATIONS.some((choice) => choice === data.seconds))
    settings.seconds = data.seconds as number;
  return settings;
}

export function saveRaceSettings(
  storage: LocalStorage,
  game: RaceGameId,
  settings: RaceSettings,
): void {
  writeLocalJson(storage, raceSettingsKey(game), settings);
}

function validPair(value: unknown, max: number): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (item: unknown) =>
        typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= max,
    )
  );
}

export function readRaceRecords(storage: LocalStorage): RaceResult[] {
  const value = readLocalJson(storage, RACE_RECORDS_KEY);
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry: unknown): entry is RaceResult => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const item = entry as Record<string, unknown>;
      return (
        typeof item.game === "string" &&
        isRaceGame(item.game) &&
        typeof item.playedAt === "number" &&
        Number.isFinite(item.playedAt) &&
        Array.isArray(item.names) &&
        item.names.length === 2 &&
        item.names.every((name: unknown) => typeof name === "string" && name.length <= 12) &&
        validPair(item.scores, Number.MAX_SAFE_INTEGER) &&
        validPair(item.adjusted, Number.MAX_SAFE_INTEGER) &&
        validPair(item.handicap, 200) &&
        validPair(item.survival, 300) &&
        (item.winner === 1 || item.winner === 2 || item.winner === null) &&
        isUint32(item.seed)
      );
    })
    .slice(-100);
}

export function appendRaceRecord(
  storage: LocalStorage,
  record: RaceResult,
  sessionRecords: readonly RaceResult[] = [],
): RaceResult[] {
  const stored = readRaceRecords(storage);
  const records = [...(stored.length ? stored : sessionRecords), record].slice(-100);
  writeLocalJson(storage, RACE_RECORDS_KEY, records);
  return records;
}
