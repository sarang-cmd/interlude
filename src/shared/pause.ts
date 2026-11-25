export const PAUSE_KEY = "interlude.pauseUntil";
export async function loadPauseUntil(): Promise<number> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return 0;
  const raw: unknown = (await chrome.storage.local.get(PAUSE_KEY))[PAUSE_KEY];
  return typeof raw === "number" && Number.isFinite(raw) && raw > Date.now() ? raw : 0;
}
export async function setPauseUntil(timestamp: number): Promise<void> {
  if (timestamp > Date.now()) await chrome.storage.local.set({ [PAUSE_KEY]: timestamp });
  else await chrome.storage.local.remove(PAUSE_KEY);
}
export function tomorrow(now: number): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}
