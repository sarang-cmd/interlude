import defaults from "../adapters/claude/selectors.json";
import { SELECTOR_OVERRIDE_KEY } from "../adapters/claude/adapter";
import type { AdapterDiagnostics, SignalId } from "../adapters/types";

type Live = AdapterDiagnostics & { panel: { visible: boolean; scene: string; gameId: string; error: string | null; configuredDelayMs: number; overheadMs: number | null } };
const byId = (id: string): HTMLElement => document.getElementById(id)!;
const tabSelect = byId("tab") as HTMLSelectElement;
const editor = byId("editor") as HTMLTextAreaElement;
const status = byId("editorStatus");
const live = byId("live");
const connection = byId("connection");
let selectedTab: number | null = null;
let poll: ReturnType<typeof setInterval> | undefined;
let refreshing = false;

function element(tag: string, className: string, content: string): HTMLElement {
  const result = document.createElement(tag); if (className) result.className = className; result.textContent = content; return result;
}
async function tabs(): Promise<void> {
  const candidates = (await chrome.tabs.query({ url: "https://claude.ai/*" })).filter((tab) => tab.id !== undefined).sort((a, b) => Number(!!b.active) - Number(!!a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  if (!candidates.some((tab) => tab.id === selectedTab)) selectedTab = candidates[0]?.id ?? null;
  tabSelect.replaceChildren();
  if (!candidates.length) { const option = document.createElement("option"); option.textContent = "NO CLAUDE TAB"; option.value = ""; tabSelect.append(option); }
  for (const [index, tab] of candidates.entries()) {
    const option = document.createElement("option"); option.value = String(tab.id); option.textContent = `CLAUDE TAB ${index + 1}${tab.active ? " / ACTIVE" : ""}`; tabSelect.append(option);
  }
  tabSelect.value = selectedTab === null ? "" : String(selectedTab);
}
function paint(data: Live): void {
  connection.hidden = true; live.hidden = false;
  byId("phase").textContent = data.state.toUpperCase();
  byId("scene").textContent = data.panel.visible ? `${data.panel.scene.toUpperCase()} / ${data.panel.gameId.toUpperCase()}` : "HIDDEN";
  byId("latency").textContent = data.lastSignalToFrameMs === null ? "NO FRAME YET" : `${data.lastSignalToFrameMs} MS`;
  byId("overhead").textContent = data.panel.overheadMs === null ? "—" : `${data.panel.overheadMs} MS / ${data.panel.overheadMs < 80 ? "PASS" : "OVER BUDGET"}`;
  byId("overhead").className = data.panel.overheadMs !== null && data.panel.overheadMs >= 80 ? "status-bad" : "";
  const signals = byId("signals"); signals.replaceChildren();
  const names: Record<SignalId, string> = { a: "STOP CONTROL", b: "THINKING INDICATOR", c: "MUTATION HEARTBEAT", d: "STREAM TIMING" };
  for (const key of ["a", "b", "c", "d"] as const) {
    const signal = data.signals[key];
    const card = element("div", "signal", "");
    const active = element("strong", signal.active ? "status-good" : "status-dim", signal.active ? "ACTIVE" : key === "d" && !data.streamHook.enabled ? "OFF" : "QUIET");
    card.append(active, element("span", "letter", key.toUpperCase()), element("p", "", names[key]), element("p", "", signal.matchedSelector ?? signal.detail));
    signals.append(card);
  }
  byId("mount").textContent = `MOUNT / ${data.mount.placement.toUpperCase()} / ${data.mount.detail}${data.panel.error ? ` / ${data.panel.error}` : ""}`;
  const rows = byId("selectorRows"); rows.replaceChildren();
  for (const report of data.selectors) {
    const row = document.createElement("tr");
    row.append(element("td", "", report.element));
    const cell = document.createElement("td");
    cell.append(element("span", report.matchedIndex >= 0 ? "status-good" : "status-dim", report.matchedIndex >= 0 ? `#${report.matchedIndex + 1} / ` : "NO MATCH / "));
    cell.append(element("code", "", report.matchedSelector ?? `${report.candidates.length} candidates`));
    row.append(cell); rows.append(row);
  }
}
async function refresh(): Promise<void> {
  if (refreshing) return; refreshing = true;
  try {
    await tabs();
    if (selectedTab === null) { live.hidden = true; connection.hidden = false; connection.textContent = "NO CLAUDE TAB. OPEN CLAUDE, THEN RETURN HERE."; return; }
    try {
      const data = await chrome.tabs.sendMessage(selectedTab, { type: "INTERLUDE_DIAGNOSTICS" }) as Live | null;
      if (!data) throw new Error("not ready");
      paint(data);
    } catch { live.hidden = true; connection.hidden = false; connection.textContent = "NO ADAPTER RESPONSE. RELOAD THE CLAUDE TAB AND CHECK POWER."; }
  } finally { refreshing = false; }
}
tabSelect.addEventListener("change", () => { selectedTab = Number(tabSelect.value) || null; void refresh(); });
function startPolling(): void { if (poll !== undefined) return; void refresh(); poll = setInterval(() => { void refresh(); }, 1000); }
document.addEventListener("visibilitychange", () => { if (document.hidden && poll !== undefined) { clearInterval(poll); poll = undefined; } else if (!document.hidden) startPolling(); });
const saved = await chrome.storage.local.get(SELECTOR_OVERRIDE_KEY);
editor.value = JSON.stringify({ ...defaults, ...((saved[SELECTOR_OVERRIDE_KEY] ?? {}) as object) }, null, 2);
byId("save").addEventListener("click", () => {
  try {
    const parsed: unknown = JSON.parse(editor.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected an object of selector arrays.");
    const values = parsed as Record<string, unknown>;
    for (const key of Object.keys(values)) if (!(key in defaults)) throw new Error(`Unknown selector group: ${key}`);
    for (const key of Object.keys(defaults)) {
      const candidates = values[key];
      if (!Array.isArray(candidates) || candidates.length === 0 || !candidates.every((s) => typeof s === "string" && s.length > 0 && s.length <= 500)) throw new Error(`${key} needs a non-empty array of CSS selectors.`);
      for (const selector of candidates as string[]) document.createDocumentFragment().querySelector(selector);
    }
    void chrome.storage.local.set({ [SELECTOR_OVERRIDE_KEY]: values }).then(() => { status.className = "editor-status status-good"; status.textContent = "APPLIED / OPEN CLAUDE TABS UPDATED"; void refresh(); });
  } catch (error) { status.className = "editor-status status-bad"; status.textContent = error instanceof Error ? error.message : "INVALID SELECTORS"; }
});
byId("reset").addEventListener("click", () => {
  editor.value = JSON.stringify(defaults, null, 2);
  void chrome.storage.local.remove(SELECTOR_OVERRIDE_KEY).then(() => { status.className = "editor-status status-good"; status.textContent = "DEFAULTS RESTORED"; void refresh(); });
});
startPolling();
