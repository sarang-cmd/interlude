import {
  defaults,
  SCHEMA_VERSION,
  SETTINGS_BY_ID,
  SETTINGS_SCHEMA,
  SITES,
  validValue,
  type InterludeSettings,
  type SettingValue,
  type SiteId,
} from "./schema";

export const SETTINGS_KEY = "interlude.settings.v2";
export const LEGACY_SETTINGS_KEY = "interlude.settings";
const LOCAL_PREFERRED_KEY = "interlude.settings.localPreferred";
export interface SettingsDocument {
  version: number;
  global: Record<string, SettingValue>;
  sites: Partial<Record<SiteId, Record<string, SettingValue>>>;
}
const empty = (): SettingsDocument => ({ version: SCHEMA_VERSION, global: {}, sites: {} });
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** chrome.storage may reorder object properties; compare values, not key order. */
function equivalent(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => equivalent(value, b[index]))
    );
  if (a && b && typeof a === "object" && typeof b === "object") {
    const left = record(a),
      right = record(b),
      keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && equivalent(left[key], right[key]))
    );
  }
  return a === b;
}
let memory: SettingsDocument = empty();
let writes: Promise<void> = Promise.resolve();

function cleanValues(input: unknown, perSite: boolean): Record<string, SettingValue> {
  const clean: Record<string, SettingValue> = {};
  for (const [id, value] of Object.entries(record(input))) {
    const def = SETTINGS_BY_ID.get(id);
    if (def && (!perSite || def.perSite) && validValue(def, value))
      clean[id] = Array.isArray(value) ? [...value] : value;
  }
  return clean;
}

/** Migrate v1 flat local settings and silently discard unknown or invalid values. */
export function migrateSettings(raw: unknown): SettingsDocument {
  const input = record(raw);
  const isDocument = typeof input.version === "number" && !!input.global;
  const result = empty();
  result.global = cleanValues(isDocument ? input.global : input, false);
  if (isDocument) {
    const sites = record(input.sites);
    for (const site of SITES) {
      const values = cleanValues(sites[site], true);
      if (Object.keys(values).length) result.sites[site] = values;
    }
  }
  return result;
}

/** Site override -> global -> schema default. Arrays are copied. */
export function resolveSettings(document: SettingsDocument, site?: SiteId): InterludeSettings {
  const result = defaults();
  for (const def of SETTINGS_SCHEMA) {
    const value =
      (site && def.perSite ? document.sites[site]?.[def.id] : undefined) ?? document.global[def.id];
    if (value !== undefined && validValue(def, value))
      result[def.id] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}

const chromeStorage = (): boolean => typeof chrome !== "undefined" && !!chrome.storage?.local;
/** All window contexts send mutations to the one service-worker queue. */
async function askWorker(message: Record<string, unknown>): Promise<unknown | undefined> {
  if (
    typeof window === "undefined" ||
    typeof chrome === "undefined" ||
    !chrome.runtime?.id ||
    !chrome.runtime.sendMessage
  )
    return undefined;
  try {
    const reply: unknown = await chrome.runtime.sendMessage(message);
    if (reply && typeof reply === "object" && (reply as { ok?: unknown }).ok === true)
      return (reply as { value?: unknown }).value;
  } catch {
    /* the extension may be shutting down; retain the local fallback */
  }
  return undefined;
}
async function persist(document: SettingsDocument): Promise<void> {
  if (!chromeStorage()) {
    memory = structuredClone(document);
    return;
  }
  try {
    if (!chrome.storage.sync) throw new Error("sync unavailable");
    await chrome.storage.sync.set({ [SETTINGS_KEY]: document });
    // Keep a local mirror for offline/unavailable sync. Prefer sync after success.
    await chrome.storage.local.set({ [SETTINGS_KEY]: document, [LOCAL_PREFERRED_KEY]: false });
  } catch {
    await chrome.storage.local.set({ [SETTINGS_KEY]: document, [LOCAL_PREFERRED_KEY]: true });
  }
}

export async function loadSettingsDocument(): Promise<SettingsDocument> {
  if (!chromeStorage()) return structuredClone(memory);
  const local = await chrome.storage.local.get([
    SETTINGS_KEY,
    LOCAL_PREFERRED_KEY,
    LEGACY_SETTINGS_KEY,
  ]);
  let raw: unknown = local[LOCAL_PREFERRED_KEY] ? local[SETTINGS_KEY] : undefined;
  if (!raw) {
    try {
      raw = (await chrome.storage.sync?.get(SETTINGS_KEY))?.[SETTINGS_KEY];
    } catch {
      /* local mirror below */
    }
  }
  raw ??= local[SETTINGS_KEY] ?? local[LEGACY_SETTINGS_KEY];
  if (!raw) return empty();
  const result = migrateSettings(raw);
  if (!equivalent(raw, result)) {
    const repaired = await askWorker({ type: "INTERLUDE_REPAIR_SETTINGS" });
    if (repaired !== undefined) return migrateSettings(repaired);
    await persist(result);
  }
  return result;
}

/** Serializes writes in this extension context and preserves unrelated profiles. */
function change(mutator: (document: SettingsDocument) => void): Promise<SettingsDocument> {
  let output = empty();
  const operation = writes.then(async () => {
    output = await loadSettingsDocument();
    mutator(output);
    await persist(output);
  });
  writes = operation.catch(() => {});
  return operation.then(() => output);
}

export async function loadSettings(site?: SiteId): Promise<InterludeSettings> {
  return resolveSettings(await loadSettingsDocument(), site);
}
export function saveSettingsLocally(
  patch: Record<string, unknown>,
  site?: SiteId,
): Promise<InterludeSettings> {
  return change((document) => {
    const target = site ? (document.sites[site] ??= {}) : document.global;
    for (const [id, value] of Object.entries(patch)) {
      const def = SETTINGS_BY_ID.get(id);
      if (!def || (site && !def.perSite) || !validValue(def, value)) continue;
      target[id] = Array.isArray(value) ? [...value] : value;
    }
  }).then((document) => resolveSettings(document, site));
}
export async function saveSettings(
  patch: Record<string, unknown>,
  site?: SiteId,
): Promise<InterludeSettings> {
  const value = await askWorker({ type: "INTERLUDE_SAVE_SETTINGS", patch, site });
  return value && typeof value === "object"
    ? (value as InterludeSettings)
    : saveSettingsLocally(patch, site);
}
export function resetSettingsLocally(
  ids: readonly string[],
  site?: SiteId,
): Promise<InterludeSettings> {
  return change((document) => {
    const target = site ? document.sites[site] : document.global;
    if (!target) return;
    for (const id of ids) delete target[id];
    if (site && !Object.keys(target).length) delete document.sites[site];
  }).then((document) => resolveSettings(document, site));
}
export async function resetSettings(
  ids: readonly string[],
  site?: SiteId,
): Promise<InterludeSettings> {
  const value = await askWorker({ type: "INTERLUDE_RESET_SETTINGS", ids, site });
  return value && typeof value === "object"
    ? (value as InterludeSettings)
    : resetSettingsLocally(ids, site);
}
export function replaceSettingsLocally(raw: unknown): Promise<SettingsDocument> {
  return change((document) => Object.assign(document, migrateSettings(raw)));
}
export async function replaceSettings(raw: unknown): Promise<SettingsDocument> {
  const value = await askWorker({ type: "INTERLUDE_REPLACE_SETTINGS", document: raw });
  return value && typeof value === "object" ? migrateSettings(value) : replaceSettingsLocally(raw);
}
