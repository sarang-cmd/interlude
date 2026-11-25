chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== "object" || (message as { type?: string }).type !== "INTERLUDE_INSTALL_STREAM_HOOK" || sender.tab?.id === undefined) return false;
  const tabId = sender.tab.id;
  void chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: "MAIN", files: ["stream-hook.js"] })
    .then(() => respond({ ok: true }), () => respond({ ok: false }));
  return true;
});
const hosts = ((chrome.runtime.getManifest() as { host_permissions?: string[] }).host_permissions ?? []).map((pattern) => {
  try { return { hostEquals: new URL(pattern.replace("/*", "/")).hostname }; } catch { return null; }
}).filter((host): host is { hostEquals: string } => host !== null);
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId }) => {
  if (frameId === 0) void chrome.tabs.sendMessage(tabId, { type: "INTERLUDE_NAVIGATED" }).catch(() => {});
}, { url: hosts });
