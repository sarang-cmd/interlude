import { InterludeController } from "./controller";
import type { SitePlugin } from "../adapters/types";
import { loadSettings } from "../shared/storage";
import { SETTINGS_KEY } from "../settings/store";
import type { SiteId } from "../settings/schema";
import { STATS_KEY } from "../focus/stats";
import { loadPauseUntil, PAUSE_KEY } from "../shared/pause";
import { loadVerifiedSelectors, SELECTOR_CACHE_KEY } from "../updates/selectors";

// One default-exported plugin per site folder; unimplemented sites stay inert.
const plugins = Object.values(
  import.meta.glob<SitePlugin>("../adapters/*/index.ts", { eager: true, import: "default" }),
);
const plugin = plugins.find(
  (candidate) => candidate.implemented && candidate.matches(location.href),
);
if (plugin) {
  let controller: InterludeController | null = null;
  let remoteEnabled = false;
  let selectorGeneration = 0;
  let settingsGeneration = 0;
  let selectorFingerprint = "";
  let selectorSource = "BUNDLED";
  const site = plugin.id as SiteId;
  const selectorKey = plugin.selectorOverrideKey;
  async function selectorConfiguration(
    enabled: boolean,
  ): Promise<{ values: Record<string, unknown>; source: string }> {
    const [local, signed] = await Promise.all([
      selectorKey ? chrome.storage.local.get(selectorKey) : Promise.resolve({}),
      enabled ? loadVerifiedSelectors() : Promise.resolve(null),
    ]);
    const raw: unknown = selectorKey ? (local as Record<string, unknown>)[selectorKey] : undefined;
    const manual =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const remote = signed?.payload.sites[site] ?? {};
    return {
      values: { ...remote, ...manual },
      source: Object.keys(manual).length ? "LOCAL OVERRIDE" : signed ? "SIGNED REMOTE" : "BUNDLED",
    };
  }
  async function refreshSelectors(): Promise<void> {
    const version = ++selectorGeneration;
    const config = await selectorConfiguration(remoteEnabled);
    if (version !== selectorGeneration || !controller) return;
    const fingerprint = JSON.stringify(config);
    if (fingerprint !== selectorFingerprint) {
      controller.adapter.setSelectors(config.values);
      selectorFingerprint = fingerprint;
      selectorSource = config.source;
    }
  }
  async function refreshSettings(): Promise<void> {
    const version = ++settingsGeneration;
    const settings = await loadSettings(site);
    if (version !== settingsGeneration) return;
    controller?.applySettings(settings);
    if (remoteEnabled !== settings.remoteSelectors) {
      remoteEnabled = settings.remoteSelectors;
      void refreshSelectors();
    }
  }
  async function boot(): Promise<void> {
    const [settings, pauseUntil] = await Promise.all([loadSettings(site), loadPauseUntil()]);
    remoteEnabled = settings.remoteSelectors;
    const config = await selectorConfiguration(remoteEnabled);
    selectorFingerprint = JSON.stringify(config);
    selectorSource = config.source;
    controller = new InterludeController(settings, plugin!.create(config.values), pauseUntil);
    // Settings or cached metadata may have changed while the async boot ran.
    void refreshSettings();
    void refreshSelectors();
  }
  // FontFace registration makes the same bundled fonts available to canvas, too.
  const fonts = [
    ["Silkscreen", "silkscreen-400"],
    ["VT323", "vt323"],
    ["IBM Plex Mono", "ibm-plex-mono-400"],
  ] as const;
  for (const [family, file] of fonts) {
    const face = new FontFace(family, `url(${chrome.runtime.getURL(`fonts/${file}.woff2`)})`);
    void face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => {});
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[PAUSE_KEY])
      controller?.setGlobalPause(Number(changes[PAUSE_KEY].newValue ?? 0));
    if (area === "local" && changes[STATS_KEY])
      controller?.refreshStats(changes[STATS_KEY].newValue);
    if (area === "local" && ((selectorKey && changes[selectorKey]) || changes[SELECTOR_CACHE_KEY]))
      void refreshSelectors();
    if ((area === "sync" || area === "local") && changes[SETTINGS_KEY]) void refreshSettings();
  });
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !event.data ||
      typeof event.data !== "object"
    )
      return;
    if ((event.data as { source?: unknown }).source === "interlude-navigation")
      controller?.navigation();
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    if (!message || typeof message !== "object") return false;
    const type = (message as { type?: string }).type;
    if (type === "INTERLUDE_DIAGNOSTICS") {
      const data = controller?.diagnostics();
      respond(data ? { ...data, selectorSource } : null);
      return false;
    }
    if (type === "INTERLUDE_NAVIGATED") {
      controller?.navigation();
      respond({ ok: true });
      return false;
    }
    return false;
  });
  void boot();
}
