/** Local match preferences and records stay in the website's browser storage. */
export const LOCAL_PONG_SETTINGS_KEY = "interlude.website.pong-local.settings.v1";
export const LOCAL_PONG_RECORDS_KEY = "interlude.website.pong-local.records.v1";
export type LocalAction = "p1Up" | "p1Down" | "p2Up" | "p2Down";
export interface LocalPongSettings {
  names: [string, string];
  keys: Record<LocalAction, string>;
  speeds: [number, number];
  bestOf: 1 | 3 | 5;
  seed: number;
}
export interface LocalPongRecord {
  playedAt: number;
  names: [string, string];
  scores: [number, number];
  winner: 1 | 2;
}
const KEY_PATTERN = /^(Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Numpad[0-9])$/;
const RESERVED = new Set(["KeyP"]);
export const LOCAL_SPEEDS = [70, 100, 130] as const;

export function defaultLocalPongSettings(): LocalPongSettings {
  return {
    names: ["PLAYER 1", "PLAYER 2"],
    keys: { p1Up: "KeyW", p1Down: "KeyS", p2Up: "ArrowUp", p2Down: "ArrowDown" },
    speeds: [100, 100],
    bestOf: 3,
    seed: 2026,
  };
}

export function cleanPlayerName(name: unknown, fallback: string): string {
  if (typeof name !== "string") return fallback;
  const clean = Array.from(name)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 12);
  return clean || fallback;
}

export function bindingError(keys: Record<LocalAction, string>): string | null {
  const values = Object.values(keys);
  if (values.length !== 4 || values.some((code) => !KEY_PATTERN.test(code) || RESERVED.has(code)))
    return "Choose a letter, number or arrow key. P is reserved for pause.";
  if (new Set(values).size !== values.length) return "Each action needs a different key.";
  return null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem"> | null;
export function readLocalPongSettings(storage: StorageLike): LocalPongSettings {
  const settings = defaultLocalPongSettings();
  try {
    const value: unknown = JSON.parse(storage?.getItem(LOCAL_PONG_SETTINGS_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return settings;
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.names)) {
      settings.names = [
        cleanPlayerName(data.names[0], "PLAYER 1"),
        cleanPlayerName(data.names[1], "PLAYER 2"),
      ];
    }
    if (data.keys && typeof data.keys === "object" && !Array.isArray(data.keys)) {
      const candidate = data.keys as Record<string, unknown>;
      const keys = {
        p1Up: candidate.p1Up,
        p1Down: candidate.p1Down,
        p2Up: candidate.p2Up,
        p2Down: candidate.p2Down,
      };
      if (Object.values(keys).every((code) => typeof code === "string")) {
        const typed = keys as Record<LocalAction, string>;
        if (!bindingError(typed)) settings.keys = typed;
      }
    }
    if (
      Array.isArray(data.speeds) &&
      data.speeds.length === 2 &&
      data.speeds.every((speed) => LOCAL_SPEEDS.some((item) => item === speed))
    )
      settings.speeds = [data.speeds[0] as number, data.speeds[1] as number];
    if (data.bestOf === 1 || data.bestOf === 3 || data.bestOf === 5) settings.bestOf = data.bestOf;
    if (
      typeof data.seed === "number" &&
      Number.isInteger(data.seed) &&
      data.seed >= 0 &&
      data.seed <= 0xffffffff
    )
      settings.seed = data.seed;
  } catch {
    // A damaged or unavailable store does not stop a match.
  }
  return settings;
}

export function saveLocalPongSettings(storage: StorageLike, settings: LocalPongSettings): void {
  try {
    storage?.setItem(LOCAL_PONG_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* session only */
  }
}

export function readLocalPongRecords(storage: StorageLike): LocalPongRecord[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(LOCAL_PONG_RECORDS_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is LocalPongRecord =>
          !!entry &&
          typeof entry === "object" &&
          Number.isFinite(entry.playedAt) &&
          (entry.winner === 1 || entry.winner === 2) &&
          Array.isArray(entry.names) &&
          entry.names.length === 2 &&
          entry.names.every((name: unknown) => typeof name === "string" && name.length <= 12) &&
          Array.isArray(entry.scores) &&
          entry.scores.length === 2 &&
          entry.scores.every(
            (score: unknown) =>
              typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 11,
          ),
      )
      .slice(-100);
  } catch {
    return [];
  }
}

export function appendLocalPongRecord(
  storage: StorageLike,
  record: LocalPongRecord,
  sessionRecords: readonly LocalPongRecord[] = [],
): LocalPongRecord[] {
  const stored = readLocalPongRecords(storage);
  const records = [...(stored.length ? stored : sessionRecords), record].slice(-100);
  try {
    storage?.setItem(LOCAL_PONG_RECORDS_KEY, JSON.stringify(records));
  } catch {
    /* session only */
  }
  return records;
}
