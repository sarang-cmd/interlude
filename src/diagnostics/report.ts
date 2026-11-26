import type { AdapterDiagnostics } from "../adapters/types";
import { GAME_IDS } from "../games/catalog";

export type LiveDiagnostics = AdapterDiagnostics & {
  selectorSource: string;
  panel: {
    visible: boolean;
    scene: string;
    gameId: string;
    error: string | null;
    configuredDelayMs: number;
    overheadMs: number | null;
    loopRunning: boolean;
    lowRate: boolean;
  };
  activity: { observers: number; timers: number; scheduledFrames: number };
};
const allowedGroups = new Set([
  "composerArea",
  "composerInput",
  "stopControl",
  "assistantTurn",
  "indicator",
  "conversationColumn",
  "startTrigger",
  "regenerateTrigger",
  "darkTheme",
  "inactiveTurnAncestor",
]);
const allowedPhases = new Set(["idle", "starting", "generating", "finishing"]);
const allowedScenes = new Set(["boot", "ready", "playing", "paused", "gameover", "done"]);
const allowedGames = new Set<string>(GAME_IDS);
const allowedChecks = new Set([
  "VERIFIED",
  "CHECKED",
  "CHECK INTERRUPTED OR IN PROGRESS",
  "INVALID URL",
  "HTTP ERROR",
  "FILE TOO LARGE",
  "INVALID JSON",
  "INVALID SCHEMA OR SIGNATURE",
  "FUTURE ISSUE DATE",
  "OLDER THAN LAST GOOD FILE",
  "NETWORK OR CORS ERROR",
  "INVALID RELEASE MANIFEST",
]);
function metric(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1e12
    ? String(Math.round(value * 10) / 10)
    : "unknown";
}
function checkStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "not checked";
  const raw = value as { result?: unknown; lastCheck?: unknown };
  const result =
    typeof raw.result === "string" && allowedChecks.has(raw.result) ? raw.result : "unknown";
  return `${result} / last check epoch ms: ${typeof raw.lastCheck === "number" && Number.isFinite(raw.lastCheck) && raw.lastCheck > 0 && raw.lastCheck < 1e14 ? Math.floor(raw.lastCheck) : "unknown"}`;
}
function browserName(userAgent: string): string {
  const edge = /Edg\/([0-9.]{1,30})/.exec(userAgent);
  const chrome = /(?:Chrome|Chromium)\/([0-9.]{1,30})/.exec(userAgent);
  return edge
    ? `Edge ${edge[1]}`
    : chrome
      ? `Chromium ${chrome[1]}`
      : "Chromium-compatible (version unknown)";
}
/** Construct only from an allowlist; never include page URL/title, selector text or free-form details. */
export function cleanReport(
  version: string,
  userAgent: string,
  data: LiveDiagnostics | null,
  selectorStatus: unknown,
  updateStatus: unknown,
): string {
  const safeVersion = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version) ? version : "unknown";
  const lines = [
    "INTERLUDE DIAGNOSTICS / STRUCTURE AND TIMING ONLY",
    `Extension: ${safeVersion}`,
    `Browser: ${browserName(userAgent)}`,
  ];
  if (!data) lines.push("Adapter: no responding supported tab");
  else {
    const site = ["claude", "chatgpt", "gemini"].includes(data.adapterId)
      ? data.adapterId
      : "unknown";
    const source = ["BUNDLED", "SIGNED REMOTE", "LOCAL OVERRIDE"].includes(data.selectorSource)
      ? data.selectorSource
      : "unknown";
    lines.push(
      `Adapter: ${site}`,
      `Detector state: ${allowedPhases.has(data.state) ? data.state : "unknown"}`,
      `Generating: ${data.generating === true}`,
      `Signals A/B/C/D: ${(["a", "b", "c", "d"] as const).map((id) => (data.signals[id]?.active === true ? "on" : "off")).join(" / ")}`,
      `Mount: ${data.mount?.found === true ? "found" : "not found"} / ${["inline", "overlay", "docked-composer", "side-panel"].includes(data.mount?.placement) ? data.mount.placement : "unknown"}`,
      `Host theme: ${data.theme === "dark" ? "dark" : data.theme === "light" ? "light" : "unknown"}`,
      `Cabinet: ${data.panel?.visible ? "visible" : "hidden"} / ${allowedScenes.has(data.panel?.scene) ? data.panel.scene : "unknown"} / ${allowedGames.has(data.panel?.gameId) ? data.panel.gameId : "none"}`,
      `Signal to first frame: ${metric(data.lastSignalToFrameMs)} ms`,
      `Delay-adjusted overhead: ${metric(data.panel?.overheadMs)} ms`,
      `Selector source: ${source}`,
      "Selector matches (candidate number / candidate count):",
    );
    for (const item of Array.isArray(data.selectors) ? data.selectors : []) {
      if (!allowedGroups.has(item.element)) continue;
      const count = Array.isArray(item.candidates) ? Math.min(item.candidates.length, 30) : 0;
      const index =
        Number.isInteger(item.matchedIndex) && item.matchedIndex >= 0 && item.matchedIndex < count
          ? `#${item.matchedIndex + 1}`
          : "none";
      lines.push(`- ${item.element}: ${index} / ${count}`);
    }
    const timeline = (Array.isArray(data.timeline) ? data.timeline : [])
      .slice(-12)
      .filter((event) => allowedPhases.has(event.phase))
      .map(
        (event) =>
          `${event.phase} @ ${typeof event.timestamp === "number" && Number.isFinite(event.timestamp) && event.timestamp > 0 && event.timestamp < 1e14 ? Math.floor(event.timestamp) : "unknown"}`,
      );
    lines.push(`Recent timeline (epoch ms): ${timeline.join(" → ") || "none"}`);
  }
  lines.push(
    `Signed selector check: ${checkStatus(selectorStatus)}`,
    `Release check: ${checkStatus(updateStatus)}`,
    "No chat text, page title, page URL, selector text, or account information is included.",
  );
  return lines.join("\n");
}
