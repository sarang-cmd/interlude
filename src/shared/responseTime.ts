/** Response duration estimates are local timing metadata, never content. */
export const RESPONSE_TIMES_KEY = "interlude.responseTimes";
export interface TimingAverage {
  averageMs: number;
  count: number;
}
export async function loadResponseAverage(site: string): Promise<TimingAverage | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const all = (await chrome.storage.local.get(RESPONSE_TIMES_KEY))[RESPONSE_TIMES_KEY] as
    Record<string, TimingAverage> | undefined;
  const item = all?.[site];
  return item &&
    Number.isFinite(item.averageMs) &&
    item.averageMs >= 0 &&
    Number.isSafeInteger(item.count)
    ? item
    : null;
}
export async function recordResponseDuration(
  site: string,
  elapsedMs: number,
): Promise<TimingAverage | null> {
  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.local ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > 3600000
  )
    return null;
  const all = ((await chrome.storage.local.get(RESPONSE_TIMES_KEY))[RESPONSE_TIMES_KEY] ??
    {}) as Record<string, TimingAverage>;
  const old = await loadResponseAverage(site);
  const next = {
    averageMs: old ? old.averageMs * 0.8 + elapsedMs * 0.2 : elapsedMs,
    count: (old?.count ?? 0) + 1,
  };
  all[site] = next;
  await chrome.storage.local.set({ [RESPONSE_TIMES_KEY]: all });
  return next;
}
