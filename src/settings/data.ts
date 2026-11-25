import { cleanStats } from "../focus/guard";
import {
  loadSettingsDocument,
  migrateSettings,
  replaceSettings,
  type SettingsDocument,
} from "./store";

const LOCAL_KEYS = [
  "interlude.highscores",
  "interlude.lastPlayed",
  "interlude.keybindings",
  "interlude.overlayPositions",
  "interlude.playStats",
  "interlude.responseTimes",
  "interlude.claudeSelectors",
  "interlude.chatgptSelectors",
  "interlude.geminiSelectors",
  "interlude.pauseUntil",
] as const;
export interface Backup {
  format: "interlude-backup";
  version: 1;
  exportedAt: string;
  settings: SettingsDocument;
  local: Record<string, unknown>;
}
export async function exportBackup(): Promise<Backup> {
  const local = await chrome.storage.local.get([...LOCAL_KEYS]);
  return {
    format: "interlude-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await loadSettingsDocument(),
    local,
  };
}
function scores(raw: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [id, value] of Object.entries(raw))
    if (
      /^[a-z0-9:-]{1,64}$/.test(id) &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER
    )
      result[id] = value;
  return result;
}
/** Validate the backup envelope and repair invalid settings/scores on import. */
export async function importBackup(raw: unknown): Promise<void> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid backup");
  const backup = raw as Partial<Backup>;
  if (
    backup.format !== "interlude-backup" ||
    backup.version !== 1 ||
    !backup.settings ||
    !backup.local ||
    typeof backup.local !== "object" ||
    Array.isArray(backup.local)
  )
    throw new Error("Unrecognized backup format");
  const local: Record<string, unknown> = {};
  for (const key of LOCAL_KEYS)
    if (Object.hasOwn(backup.local, key)) local[key] = backup.local[key];
  if ("interlude.highscores" in local)
    local["interlude.highscores"] = scores(local["interlude.highscores"]);
  if ("interlude.playStats" in local)
    local["interlude.playStats"] = cleanStats(local["interlude.playStats"]);
  await chrome.storage.local.set(local);
  await replaceSettings(migrateSettings(backup.settings));
}
export async function wipeEverything(): Promise<void> {
  await chrome.storage.local.clear();
  try {
    await chrome.storage.sync.clear();
  } catch {
    /* local fallback has already been cleared */
  }
}
