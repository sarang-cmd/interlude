import claude from "../adapters/claude/selectors.json";
import chatgpt from "../adapters/chatgpt/selectors.json";
import gemini from "../adapters/gemini/selectors.json";
import type { SignalId } from "../adapters/types";
import { loadSettings } from "../settings/store";
import type { SiteId } from "../settings/schema";
import { loadVerifiedSelectors, SELECTOR_STATUS_KEY } from "../updates/selectors";
import { UPDATE_STATUS_KEY } from "../updates/release";
import { cleanReport, type LiveDiagnostics } from "./report";

const profiles = {
  claude: { name: "CLAUDE", host: "claude.ai", key: "interlude.claudeSelectors", defaults: claude },
  chatgpt: {
    name: "CHATGPT / BETA",
    host: "chatgpt.com",
    key: "interlude.chatgptSelectors",
    defaults: chatgpt,
  },
  gemini: {
    name: "GEMINI / BETA",
    host: "gemini.google.com",
    key: "interlude.geminiSelectors",
    defaults: gemini,
  },
} as const;
const siteIds: SiteId[] = ["claude", "chatgpt", "gemini"];
const byId = (id: string): HTMLElement => document.getElementById(id)!;
const tabSelect = byId("tab") as HTMLSelectElement;
const siteSelect = byId("selectorSite") as HTMLSelectElement;
const editor = byId("editor") as HTMLTextAreaElement;
const status = byId("editorStatus");
const live = byId("live");
const connection = byId("connection");
let selectedTab: number | null = null;
let editorSite: SiteId = "claude";
let editorDirty = false;
let poll: ReturnType<typeof setInterval> | undefined;
let refreshing = false;
let lastData: LiveDiagnostics | null = null;
let selectorStatus: unknown;
let updateStatus: unknown;
if (new URLSearchParams(location.search).has("embedded")) document.body.classList.add("embedded");

function element(tag: string, className: string, content: string): HTMLElement {
  const result = document.createElement(tag);
  if (className) result.className = className;
  result.textContent = content;
  return result;
}
function siteFor(url: string | undefined): SiteId | null {
  try {
    const hostname = new URL(url ?? "").hostname;
    return siteIds.find((site) => profiles[site].host === hostname) ?? null;
  } catch {
    return null;
  }
}
async function loadEditor(site: SiteId): Promise<void> {
  editorSite = site;
  siteSelect.value = site;
  const [local, settings, signed] = await Promise.all([
    chrome.storage.local.get(profiles[site].key),
    loadSettings(),
    loadVerifiedSelectors(),
  ]);
  const raw: unknown = local[profiles[site].key];
  const overrides = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as object) : {};
  const baseline =
    settings.remoteSelectors && signed ? signed.payload.sites[site] : profiles[site].defaults;
  editor.value = JSON.stringify({ ...baseline, ...overrides }, null, 2);
  editorDirty = false;
}
async function tabs(): Promise<void> {
  const candidates = (
    await chrome.tabs.query({ url: siteIds.map((site) => `https://${profiles[site].host}/*`) })
  )
    .filter((tab) => tab.id !== undefined && siteFor(tab.url) !== null)
    .sort(
      (a, b) =>
        Number(!!b.active) - Number(!!a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
    );
  if (!candidates.some((tab) => tab.id === selectedTab)) selectedTab = candidates[0]?.id ?? null;
  tabSelect.replaceChildren();
  if (!candidates.length) {
    const option = document.createElement("option");
    option.textContent = "NO SUPPORTED TAB";
    option.value = "";
    tabSelect.append(option);
  }
  const counts: Record<SiteId, number> = { claude: 0, chatgpt: 0, gemini: 0 };
  for (const tab of candidates) {
    const site = siteFor(tab.url)!;
    counts[site]++;
    const option = document.createElement("option");
    option.value = String(tab.id);
    option.textContent = `${profiles[site].name} / TAB ${counts[site]}${tab.active ? " / ACTIVE" : ""}`;
    tabSelect.append(option);
  }
  tabSelect.value = selectedTab === null ? "" : String(selectedTab);
  const chosen = candidates.find((tab) => tab.id === selectedTab);
  const chosenSite = siteFor(chosen?.url);
  if (!editorDirty && chosenSite && chosenSite !== editorSite) await loadEditor(chosenSite);
}
function paint(data: LiveDiagnostics): void {
  connection.hidden = true;
  live.hidden = false;
  byId("phase").textContent = data.state.toUpperCase();
  byId("scene").textContent = data.panel.visible
    ? `${data.panel.scene.toUpperCase()} / ${data.panel.gameId.toUpperCase()}`
    : "HIDDEN";
  byId("latency").textContent =
    data.lastSignalToFrameMs === null ? "NO FRAME YET" : `${data.lastSignalToFrameMs} MS`;
  byId("overhead").textContent =
    data.panel.overheadMs === null
      ? "N/A"
      : `${data.panel.overheadMs} MS / ${data.panel.overheadMs < 80 ? "PASS" : "OVER BUDGET"}`;
  byId("overhead").className =
    data.panel.overheadMs !== null && data.panel.overheadMs >= 80 ? "status-bad" : "";
  byId("activity").textContent = `${data.activity.observers} / ${data.activity.timers}`;
  const loop = data.panel.loopRunning ? (data.panel.lowRate ? "30 HZ" : "60 HZ") : "STOPPED";
  byId("loop").textContent = `${loop} / ${data.activity.scheduledFrames}`;
  byId("theme").textContent = data.theme.toUpperCase();
  byId("source").textContent = data.selectorSource;
  byId("reasons").textContent =
    `VOTE / ${data.reasons.length ? data.reasons.join(" + ") : "NO ACTIVE VOTES"}`;
  const signals = byId("signals");
  signals.replaceChildren();
  const names: Record<SignalId, string> = {
    a: "STOP CONTROL",
    b: "THINKING INDICATOR",
    c: "MUTATION HEARTBEAT",
    d: "STREAM TIMING",
  };
  for (const key of ["a", "b", "c", "d"] as const) {
    const signal = data.signals[key];
    const card = element("div", "signal", "");
    const active = element(
      "strong",
      signal.active ? "status-good" : "status-dim",
      signal.active ? "ACTIVE" : key === "d" && !data.streamHook.enabled ? "OFF" : "QUIET",
    );
    card.append(
      active,
      element("span", "letter", key.toUpperCase()),
      element("p", "", names[key]),
      element("p", "", signal.matchedSelector ?? signal.detail),
    );
    if (signal.lastChange !== null)
      card.append(element("p", "", `LAST CHANGE / ${Math.round(signal.lastChange)} MS PAGE CLOCK`));
    if (key === "d" && data.streamHook.enabled) {
      const stamp = (time: number | null) => (time === null ? "N/A" : `${Math.round(time)} MS`);
      card.append(
        element(
          "p",
          "",
          `OPEN ${stamp(data.streamHook.lastOpen)} / CLOSE ${stamp(data.streamHook.lastClose)}`,
        ),
      );
    }
    signals.append(card);
  }
  byId("mount").textContent =
    `MOUNT / ${data.mount.placement.toUpperCase()} / ${data.mount.detail}${data.panel.error ? ` / ${data.panel.error}` : ""}`;
  const rows = byId("selectorRows");
  rows.replaceChildren();
  for (const report of data.selectors) {
    const row = document.createElement("tr");
    row.append(element("td", "", report.element));
    const cell = document.createElement("td");
    cell.append(
      element(
        "span",
        report.matchedIndex >= 0 ? "status-good" : "status-dim",
        report.matchedIndex >= 0 ? `#${report.matchedIndex + 1} / ` : "NO MATCH / ",
      ),
    );
    cell.append(
      element("code", "", report.matchedSelector ?? `${report.candidates.length} candidates`),
    );
    row.append(cell);
    rows.append(row);
  }
  const timeline = byId("timeline");
  timeline.replaceChildren();
  for (const event of data.timeline.slice(-12).reverse())
    timeline.append(
      element(
        "li",
        "",
        `${new Date(event.timestamp).toLocaleTimeString()} / ${event.phase.toUpperCase()}`,
      ),
    );
  if (!data.timeline.length) timeline.append(element("li", "", "NO TRANSITIONS YET"));
}
function statusLine(prefix: string, enabled: boolean, raw: unknown): string {
  const data =
    raw && typeof raw === "object" ? (raw as { lastCheck?: unknown; result?: unknown }) : {};
  const when =
    typeof data.lastCheck === "number" && Number.isFinite(data.lastCheck) && data.lastCheck > 0
      ? new Date(data.lastCheck).toLocaleString()
      : "NEVER";
  return `${prefix} / ${enabled ? "ON" : "OFF"} / ${typeof data.result === "string" ? data.result : "NOT CHECKED"} / LAST CHECK ${when}`;
}
function updateIssueLink(): void {
  const report = cleanReport(
    chrome.runtime.getManifest().version,
    navigator.userAgent,
    lastData,
    selectorStatus,
    updateStatus,
  );
  const params = new URLSearchParams({
    title: "Adapter diagnostics",
    body: `Describe the problem and steps to reproduce:\n\n\n${report}`,
  });
  (byId("issue") as HTMLAnchorElement).href =
    `https://github.com/sarang-cmd/interlude/issues/new?${params.toString()}`;
}
async function refreshRemote(): Promise<void> {
  const [local, settings, good] = await Promise.all([
    chrome.storage.local.get([SELECTOR_STATUS_KEY, UPDATE_STATUS_KEY]),
    loadSettings(),
    loadVerifiedSelectors(),
  ]);
  selectorStatus = local[SELECTOR_STATUS_KEY];
  updateStatus = local[UPDATE_STATUS_KEY];
  byId("remoteStatus").textContent =
    `${statusLine("SIGNED SELECTORS", settings.remoteSelectors, selectorStatus)}${good ? ` / LAST VERIFIED ${good.payload.issuedAt}` : " / USING BUNDLED"}`;
  byId("updateStatus").textContent = statusLine(
    "RELEASE CHECK",
    settings.updateChecks,
    updateStatus,
  );
}
async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    await Promise.all([tabs(), refreshRemote()]);
    if (selectedTab === null) {
      lastData = null;
      live.hidden = true;
      connection.hidden = false;
      connection.textContent =
        "NO SUPPORTED TAB. OPEN CLAUDE, CHATGPT OR GEMINI, THEN RETURN HERE.";
    } else {
      try {
        const data = (await chrome.tabs.sendMessage(selectedTab, {
          type: "INTERLUDE_DIAGNOSTICS",
        })) as LiveDiagnostics | null;
        if (!data) throw new Error("not ready");
        lastData = data;
        paint(data);
      } catch {
        lastData = null;
        live.hidden = true;
        connection.hidden = false;
        connection.textContent =
          "NO ADAPTER RESPONSE. RELOAD THE SITE TAB AND CHECK ITS PROFILE POWER.";
      }
    }
    updateIssueLink();
  } finally {
    refreshing = false;
  }
}
tabSelect.addEventListener("change", () => {
  selectedTab = Number(tabSelect.value) || null;
  void refresh();
});
siteSelect.addEventListener("change", () => {
  const site = siteSelect.value as SiteId;
  if (!siteIds.includes(site)) return;
  if (editorDirty && !window.confirm("Discard unsaved selector edits?")) {
    siteSelect.value = editorSite;
    return;
  }
  void loadEditor(site);
});
editor.addEventListener("input", () => {
  editorDirty = true;
});
byId("save").addEventListener("click", () => {
  try {
    const parsed: unknown = JSON.parse(editor.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Expected an object of selector arrays.");
    const values = parsed as Record<string, unknown>,
      defaults = profiles[editorSite].defaults;
    for (const key of Object.keys(values))
      if (!(key in defaults)) throw new Error(`Unknown selector group: ${key}`);
    for (const key of Object.keys(defaults)) {
      const candidates = values[key];
      if (
        !Array.isArray(candidates) ||
        candidates.length === 0 ||
        candidates.length > 30 ||
        new Set(candidates).size !== candidates.length ||
        !candidates.every((s) => typeof s === "string" && s.length > 0 && s.length <= 500)
      )
        throw new Error(`${key} needs up to 30 distinct CSS selectors.`);
      for (const selector of candidates as string[])
        document.createDocumentFragment().querySelector(selector);
    }
    const site = editorSite;
    void chrome.storage.local.set({ [profiles[site].key]: values }).then(() => {
      editorDirty = false;
      status.className = "editor-status status-good";
      status.textContent = `APPLIED / OPEN ${profiles[site].name} TABS UPDATED`;
      void refresh();
    });
  } catch (error) {
    status.className = "editor-status status-bad";
    status.textContent = error instanceof Error ? error.message : "INVALID SELECTORS";
  }
});
byId("reset").addEventListener("click", () => {
  const site = editorSite;
  void chrome.storage.local.remove(profiles[site].key).then(async () => {
    await loadEditor(site);
    status.className = "editor-status status-good";
    status.textContent = "LOCAL OVERRIDE CLEARED / SIGNED OR BUNDLED CANDIDATES IN USE";
    void refresh();
  });
});
byId("checkServices").addEventListener("click", () => {
  const button = byId("checkServices") as HTMLButtonElement;
  button.disabled = true;
  void chrome.runtime
    .sendMessage({ type: "INTERLUDE_CHECK_SERVICES" })
    .then(() => refresh())
    .finally(() => {
      button.disabled = false;
    });
});
byId("copyReport").addEventListener("click", () => {
  const report = cleanReport(
    chrome.runtime.getManifest().version,
    navigator.userAgent,
    lastData,
    selectorStatus,
    updateStatus,
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const temporary = document.createElement("textarea");
      temporary.value = report;
      document.body.append(temporary);
      temporary.select();
      const ok = document.execCommand("copy");
      temporary.remove();
      if (!ok) throw new Error("copy failed");
    }
  };
  void copy().then(
    () => {
      byId("copyStatus").textContent = "COPIED / REVIEW BEFORE SHARING";
    },
    () => {
      byId("copyStatus").textContent = "COPY FAILED / USE THE PREFILLED ISSUE";
    },
  );
});
function startPolling(): void {
  if (poll !== undefined) return;
  void refresh();
  poll = setInterval(() => {
    void refresh();
  }, 1000);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && poll !== undefined) {
    clearInterval(poll);
    poll = undefined;
  } else if (!document.hidden) startPolling();
});
await loadEditor("claude");
startPolling();
