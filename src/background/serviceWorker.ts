import { saveHighScoreLocally } from "../shared/storage";

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (
    !message ||
    typeof message !== "object" ||
    (message as { type?: string }).type !== "INTERLUDE_SAVE_SCORE"
  )
    return false;
  const { gameId, score } = message as { gameId?: unknown; score?: unknown };
  if (typeof gameId !== "string" || typeof score !== "number") {
    respond({ error: "invalid score" });
    return false;
  }
  void saveHighScoreLocally(gameId, score).then(respond, () =>
    respond({ error: "score write failed" }),
  );
  return true;
});

import { addDeltasLocally } from "../focus/stats";
import type { PlayDelta } from "../focus/guard";
chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (
    !message ||
    typeof message !== "object" ||
    (message as { type?: string }).type !== "INTERLUDE_PLAY_DELTAS"
  )
    return false;
  const deltas = (message as { deltas?: unknown }).deltas;
  if (!Array.isArray(deltas) || deltas.length > 1000) {
    respond({ error: "invalid deltas" });
    return false;
  }
  void addDeltasLocally(deltas as PlayDelta[]).then(respond, () =>
    respond({ error: "stats write failed" }),
  );
  return true;
});

import { PAUSE_KEY, loadPauseUntil } from "../shared/pause";
const PAUSE_ALARM = "interlude-pause-expiry";
async function schedulePause(): Promise<void> {
  const until = await loadPauseUntil();
  if (until) await chrome.alarms.create(PAUSE_ALARM, { when: until });
  else await chrome.alarms.clear(PAUSE_ALARM);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[PAUSE_KEY]) void schedulePause();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== PAUSE_ALARM) return;
  void loadPauseUntil().then(async (until) => {
    if (until) await chrome.alarms.create(PAUSE_ALARM, { when: until });
    else await chrome.storage.local.remove(PAUSE_KEY);
  });
});
void schedulePause();
