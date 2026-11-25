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
