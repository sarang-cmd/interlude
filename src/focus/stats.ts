import { applyDeltas, cleanStats, emptyStats, type PlayDelta, type PlayStats } from "./guard";
export const STATS_KEY = "interlude.playStats";
let memory = emptyStats();
let queue: Promise<void> = Promise.resolve();
export async function loadStats(): Promise<PlayStats> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return cleanStats(memory);
  return cleanStats((await chrome.storage.local.get(STATS_KEY))[STATS_KEY]);
}
/** Worker-side serialized merge preserves concurrent tabs and games. */
export function addDeltasLocally(deltas: PlayDelta[]): Promise<PlayStats> {
  let result = emptyStats();
  const operation = queue.then(async () => {
    result = applyDeltas(await loadStats(), deltas);
    if (typeof chrome === "undefined" || !chrome.storage?.local) memory = result;
    else await chrome.storage.local.set({ [STATS_KEY]: result });
  });
  queue = operation.catch(() => {});
  return operation.then(() => result);
}
export async function saveDeltas(deltas: PlayDelta[]): Promise<PlayStats> {
  if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime.sendMessage) {
    try {
      const response: unknown = await chrome.runtime.sendMessage({
        type: "INTERLUDE_PLAY_DELTAS",
        deltas,
      });
      if (
        response &&
        typeof response === "object" &&
        (response as { version?: unknown }).version === 1
      )
        return cleanStats(response);
      throw new Error("invalid response");
    } catch {
      /* fall through to local while extension is shutting down */
    }
  }
  return addDeltasLocally(deltas);
}
