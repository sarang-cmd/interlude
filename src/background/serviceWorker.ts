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

import { loadSettings } from "../settings/store";
import { SETTINGS_KEY } from "../settings/store";
import { checkSelectorUpdates } from "../updates/selectors";
import { checkForUpdate } from "../updates/release";

const SELECTOR_ALARM = "interlude-selector-check";
const UPDATE_ALARM = "interlude-release-check";
async function ensureAlarms(): Promise<void> {
  if (!(await chrome.alarms.get(SELECTOR_ALARM)))
    await chrome.alarms.create(SELECTOR_ALARM, { delayInMinutes: 720, periodInMinutes: 720 });
  if (!(await chrome.alarms.get(UPDATE_ALARM)))
    await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1440, periodInMinutes: 1440 });
}
async function updateBadge(available: boolean): Promise<void> {
  // The setting may have been disabled while a request was in flight.
  const enabled = (await loadSettings()).updateChecks;
  await chrome.action.setBadgeText({ text: enabled && available ? "NEW" : "" });
  if (enabled && available) await chrome.action.setBadgeBackgroundColor({ color: "#ffb000" });
}
async function runChecks(kind: "all" | "selectors" | "release" = "all"): Promise<void> {
  const settings = await loadSettings();
  const tasks: Promise<unknown>[] = [];
  if (kind !== "release" && settings.remoteSelectors)
    tasks.push(checkSelectorUpdates(settings.selectorUrl));
  if (kind !== "selectors") {
    if (settings.updateChecks)
      tasks.push(
        checkForUpdate(chrome.runtime.getManifest().version).then((status) =>
          updateBadge(status.available),
        ),
      );
    else tasks.push(chrome.action.setBadgeText({ text: "" }));
  }
  await Promise.all(tasks);
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SELECTOR_ALARM) void runChecks("selectors").catch(() => {});
  if (alarm.name === UPDATE_ALARM) void runChecks("release").catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  void ensureAlarms()
    .then(() => runChecks())
    .catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarms()
    .then(() => runChecks())
    .catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "sync" || area === "local") && changes[SETTINGS_KEY])
    void runChecks().catch(() => {});
});
chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (
    !message ||
    typeof message !== "object" ||
    (message as { type?: string }).type !== "INTERLUDE_CHECK_SERVICES"
  )
    return false;
  void runChecks().then(
    () => respond({ ok: true }),
    () => respond({ ok: false }),
  );
  return true;
});
// MV3 workers may wake after browser startup; the stored timestamps enforce limits.
void ensureAlarms()
  .then(() => runChecks())
  .catch(() => {});

import {
  loadSettingsDocument,
  replaceSettingsLocally,
  resetSettingsLocally,
  saveSettingsLocally,
} from "../settings/store";
import { SITES, type SiteId } from "../settings/schema";
chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (!message || typeof message !== "object" || Array.isArray(message)) return false;
  const request = message as {
    type?: unknown;
    patch?: unknown;
    ids?: unknown;
    site?: unknown;
    document?: unknown;
  };
  const types = [
    "INTERLUDE_SAVE_SETTINGS",
    "INTERLUDE_RESET_SETTINGS",
    "INTERLUDE_REPLACE_SETTINGS",
    "INTERLUDE_REPAIR_SETTINGS",
  ];
  if (typeof request.type !== "string" || !types.includes(request.type)) return false;
  if (
    request.site !== undefined &&
    (typeof request.site !== "string" || !SITES.includes(request.site as SiteId))
  ) {
    respond({ ok: false });
    return false;
  }
  const site = request.site as SiteId | undefined;
  let operation: Promise<unknown>;
  if (
    request.type === "INTERLUDE_SAVE_SETTINGS" &&
    request.patch &&
    typeof request.patch === "object" &&
    !Array.isArray(request.patch)
  )
    operation = saveSettingsLocally(request.patch as Record<string, unknown>, site);
  else if (
    request.type === "INTERLUDE_RESET_SETTINGS" &&
    Array.isArray(request.ids) &&
    request.ids.length <= 500 &&
    request.ids.every((id) => typeof id === "string" && id.length <= 100)
  )
    operation = resetSettingsLocally(request.ids as string[], site);
  else if (request.type === "INTERLUDE_REPLACE_SETTINGS")
    operation = replaceSettingsLocally(request.document);
  else if (request.type === "INTERLUDE_REPAIR_SETTINGS") operation = loadSettingsDocument();
  else {
    respond({ ok: false });
    return false;
  }
  void operation.then(
    (value) => respond({ ok: true, value }),
    () => respond({ ok: false }),
  );
  return true;
});
