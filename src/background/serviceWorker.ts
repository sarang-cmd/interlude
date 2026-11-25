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
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (
    !message ||
    typeof message !== "object" ||
    (message as { type?: string }).type !== "INTERLUDE_INSTALL_STREAM_HOOK" ||
    sender.tab?.id === undefined
  )
    return false;
  const tabId = sender.tab.id;
  void chrome.scripting
    .executeScript({ target: { tabId, frameIds: [0] }, world: "MAIN", files: ["stream-hook.js"] })
    .then(
      () => respond({ ok: true }),
      () => respond({ ok: false }),
    );
  return true;
});
const hosts = (
  (chrome.runtime.getManifest() as { host_permissions?: string[] }).host_permissions ?? []
)
  .map((pattern) => {
    try {
      return { hostEquals: new URL(pattern.replace("/*", "/")).hostname };
    } catch {
      return null;
    }
  })
  .filter((host): host is { hostEquals: string } => host !== null);
chrome.webNavigation.onHistoryStateUpdated.addListener(
  ({ tabId, frameId }) => {
    if (frameId === 0)
      void chrome.tabs.sendMessage(tabId, { type: "INTERLUDE_NAVIGATED" }).catch(() => {});
  },
  { url: hosts },
);
