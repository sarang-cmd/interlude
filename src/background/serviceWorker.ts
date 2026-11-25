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
