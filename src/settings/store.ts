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
  if (JSON.stringify(raw) !== JSON.stringify(result)) await persist(result);
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
export function saveSettings(
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
export function resetSettings(ids: readonly string[], site?: SiteId): Promise<InterludeSettings> {
  return change((document) => {
    const target = site ? document.sites[site] : document.global;
    if (!target) return;
    for (const id of ids) delete target[id];
    if (site && !Object.keys(target).length) delete document.sites[site];
  }).then((document) => resolveSettings(document, site));
}
export function replaceSettings(raw: unknown): Promise<SettingsDocument> {
  return change((document) => Object.assign(document, migrateSettings(raw)));
}
