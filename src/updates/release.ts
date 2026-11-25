import { fetchStaticJSON, safeNetworkError } from "./transport";
export const UPDATE_URL = "https://interlude-sepia.vercel.app/updates/latest.json";
export const UPDATE_STATUS_KEY = "interlude.updateStatus";
export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export interface ReleaseManifest {
  version: string;
  url: string;
}
export interface UpdateStatus {
  lastCheck: number;
  result: string;
  available: boolean;
  version?: string;
  url?: string;
}

/** Only stable X.Y.Z releases from the official project are linked. */
export function parseRelease(value: unknown): ReleaseManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== 2 ||
    typeof data.version !== "string" ||
    typeof data.url !== "string"
  )
    return null;
  const version = data.version;
  if (!/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version)) return null;
  const expected = `https://github.com/sarang-cmd/interlude/releases/download/v${version}/interlude-v${version}.zip`;
  return data.url === expected ? { version, url: expected } : null;
}
export function isNewer(candidate: string, current: string): boolean {
  const parse = (version: string) =>
    /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version)
      ? version.split(".").map(Number)
      : null;
  const a = parse(candidate),
    b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}
export function currentUpdateStatus(raw: unknown, version: string): UpdateStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<UpdateStatus>;
  if (!Number.isFinite(value.lastCheck) || typeof value.result !== "string") return null;
  const release = parseRelease({ version: value.version, url: value.url });
  return {
    lastCheck: value.lastCheck!,
    result: value.result,
    available: !!release && isNewer(release.version, version),
    ...(release ?? {}),
  };
}
let pendingCheck: Promise<UpdateStatus> | null = null;
export function checkForUpdate(currentVersion: string, now = Date.now()): Promise<UpdateStatus> {
  if (pendingCheck) return pendingCheck;
  pendingCheck = runCheck(currentVersion, now).finally(() => {
    pendingCheck = null;
  });
  return pendingCheck;
}
async function runCheck(currentVersion: string, now: number): Promise<UpdateStatus> {
  const old = currentUpdateStatus(
    (await chrome.storage.local.get(UPDATE_STATUS_KEY))[UPDATE_STATUS_KEY],
    currentVersion,
  );
  if (old && now < old.lastCheck + UPDATE_INTERVAL_MS) return old;
  const checking: UpdateStatus = {
    ...(old ?? { available: false }),
    lastCheck: now,
    result: "CHECK INTERRUPTED OR IN PROGRESS",
  };
  await chrome.storage.local.set({ [UPDATE_STATUS_KEY]: checking });
  try {
    const data = parseRelease(await fetchStaticJSON(UPDATE_URL));
    if (!data) throw new Error("INVALID RELEASE MANIFEST");
    const result: UpdateStatus = {
      lastCheck: now,
      result: "CHECKED",
      available: isNewer(data.version, currentVersion),
      ...data,
    };
    await chrome.storage.local.set({ [UPDATE_STATUS_KEY]: result });
    return result;
  } catch (error) {
    const result: UpdateStatus = {
      ...checking,
      result: safeNetworkError(error, ["INVALID RELEASE MANIFEST"]),
    };
    await chrome.storage.local.set({ [UPDATE_STATUS_KEY]: result });
    return result;
  }
}
