chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== "object" || (message as { type?: string }).type !== "INTERLUDE_INSTALL_STREAM_HOOK" || sender.tab?.id === undefined) return false;
  const tabId = sender.tab.id;
  void chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: "MAIN", files: ["stream-hook.js"] })
    .then(() => respond({ ok: true }), () => respond({ ok: false }));
  return true;
});
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId }) => {
  if (frameId === 0) void chrome.tabs.sendMessage(tabId, { type: "INTERLUDE_NAVIGATED" }).catch(() => {});
}, { url: [{ hostEquals: "claude.ai" }] });
