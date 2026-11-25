import { InterludeController } from "./controller";
import type { SitePlugin } from "../adapters/types";
import { loadSettings } from "../shared/storage";
import { SETTINGS_KEY } from "../settings/store";
import type { SiteId } from "../settings/schema";

// One default-exported plugin per site folder; unimplemented sites stay inert.
const plugins = Object.values(
  import.meta.glob<SitePlugin>("../adapters/*/index.ts", { eager: true, import: "default" }),
);
const plugin = plugins.find(
  (candidate) => candidate.implemented && candidate.matches(location.href),
);
if (plugin) {
  let controller: InterludeController | null = null;
  let generation = 0;
  async function boot(): Promise<void> {
    const version = ++generation;
    const key = plugin!.selectorOverrideKey;
    const [settings, values] = await Promise.all([
      loadSettings(plugin!.id as SiteId),
      key ? chrome.storage.local.get(key) : Promise.resolve({}),
    ]);
    if (version !== generation) return;
    controller?.destroy();
    controller = new InterludeController(
      settings,
      plugin!.create(key ? (values as Record<string, unknown>)[key] : undefined),
    );
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
    if (area === "local" && plugin.selectorOverrideKey && changes[plugin.selectorOverrideKey]) {
      void boot();
      return;
    }
    if ((area === "sync" || area === "local") && changes[SETTINGS_KEY]) {
      void loadSettings(plugin.id as SiteId).then((settings) =>
        controller?.applySettings(settings),
      );
    }
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    if (!message || typeof message !== "object") return false;
    const type = (message as { type?: string }).type;
    if (type === "INTERLUDE_DIAGNOSTICS") {
      respond(controller?.diagnostics() ?? null);
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
