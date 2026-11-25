import type { SiteAdapter } from "../adapters/types";
import { loadGame, resolveGameId } from "../games/manifest";
import {
  loadHighScores,
  loadKeybindings,
  loadLastPlayed,
  loadOverlayPositions,
  saveLastPlayed,
  saveOverlayPosition,
  saveSettings,
  type InterludeSettings,
} from "../shared/storage";
import { Panel } from "./panel";

function isTextField(event: KeyboardEvent): boolean {
  return event
    .composedPath()
    .some(
      (item) =>
        item instanceof HTMLInputElement ||
        item instanceof HTMLTextAreaElement ||
        (item instanceof HTMLElement && (item.isContentEditable || item.tagName === "SELECT")),
    );
}
function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey
    .toLowerCase()
    .split("+")
    .map((part) => part.trim());
  const key = parts.at(-1);
  return (
    !!key &&
    event.key.toLowerCase() === key &&
    event.altKey === parts.includes("alt") &&
    event.ctrlKey === (parts.includes("ctrl") || parts.includes("control")) &&
    event.shiftKey === parts.includes("shift") &&
    event.metaKey === (parts.includes("meta") || parts.includes("cmd"))
  );
}

/** Coordinates a prepared panel with the adapter's debounced signal. */
export class InterludeController {
  readonly adapter: SiteAdapter;
  readonly panel: Panel;
  private settings: InterludeSettings;
  private generating = false;
  private dismissed = false;
  private signalAt = 0;
  private delayUsed = 0;
  private lastDelay = 0;
  private revealTimer: ReturnType<typeof setTimeout> | undefined;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  private revealFrame: number | undefined;
  private remountFrame: number | undefined;
  private gameReady: Promise<void> = Promise.resolve();
  private gameVersion = 0;
  private gameId = "";
  private gameError: string | null = null;
  private destroyed = false;
  private unsubSignal: () => void;
  private unsubStructure: () => void;

  constructor(settings: InterludeSettings, adapter: SiteAdapter) {
    this.settings = settings;
    this.adapter = adapter;
    this.panel = new Panel(settings, adapter.displayName, {
      onChoose: (choice) => this.choose(choice),
      onClose: () => this.close(true),
      onResume: () => this.resume(),
      onEscape: () => this.returnToComposer(),
      onFirstFrame: () => {
        this.adapter.recordSignalToFrame(performance.now() - this.signalAt);
        this.lastDelay = this.delayUsed;
      },
      onMove: (x, y) => {
        void saveOverlayPosition(this.adapter.id, { x, y });
      },
    });
    this.panel.setSceneListener((state) => {
      if (state === "paused" && this.panel.isVisible) this.panel.setDone(true, !this.generating);
    });
    this.adapter.setExcludedHost(this.panel.host);
    this.unsubSignal = this.adapter.getGeneratingSignal().subscribe((next, previous) => {
      if (next.generating !== previous.generating) this.onSignal(next.generating);
      else if (next.generating && !this.panel.isVisible) {
        // An end flicker is debounced for an open panel, but must cancel a pending reveal.
        if (this.adapter.getPhase() === "finishing") this.cancelReveal();
        else if (this.adapter.getPhase() === "generating" && !this.dismissed) this.scheduleReveal();
      }
    });
    this.unsubStructure = this.adapter.onStructureChange(() => this.onStructure());
    this.panel.updateSettings(settings);
    this.gameReady = this.prepareGame(settings.game);
    void loadOverlayPositions().then((positions) =>
      this.panel.setPosition(positions[this.adapter.id] ?? null),
    );
    document.addEventListener("keydown", this.onHotkey, true);
    document.addEventListener("visibilitychange", this.onVisibility);
    // Close synchronously on back/forward and bfcache restoration; background
    // webNavigation additionally covers pushState/replaceState changes.
    window.addEventListener("popstate", this.onNavigation);
    window.addEventListener("pageshow", this.onPageShow);
    if (settings.enabled) {
      this.adapter.start();
      this.adapter.setStreamHook(settings.streamHookEnabled);
    }
  }
  private async prepareGame(choice: string): Promise<void> {
    const version = ++this.gameVersion;
    try {
      const [last, scores, bindings] = await Promise.all([
        loadLastPlayed(),
        loadHighScores(),
        loadKeybindings(),
      ]);
      const id = resolveGameId(choice, last);
      const game = await loadGame(id);
      if (version !== this.gameVersion || this.destroyed) return;
      this.gameId = id;
      this.gameError = null;
      this.panel.setGame(game, scores[id] ?? 0, bindings[id] ?? {});
      await saveLastPlayed(id);
    } catch (error) {
      this.gameError = error instanceof Error ? error.message : "Game could not be loaded";
    }
  }
  private choose(choice: string): void {
    this.settings = { ...this.settings, game: choice };
    this.panel.updateSettings(this.settings);
    this.gameReady = this.prepareGame(choice);
    void saveSettings({ game: choice });
  }
  applySettings(next: InterludeSettings): void {
    const old = this.settings;
    this.settings = next;
    this.panel.updateSettings(next);
    if (old.enabled !== next.enabled) {
      if (next.enabled) {
        this.adapter.start();
        this.adapter.setStreamHook(next.streamHookEnabled);
      } else {
        this.close(false);
        this.adapter.setStreamHook(false);
        this.adapter.stop();
      }
    } else if (next.enabled && old.streamHookEnabled !== next.streamHookEnabled)
      this.adapter.setStreamHook(next.streamHookEnabled);
    if (old.game !== next.game) this.gameReady = this.prepareGame(next.game);
    if (old.placement !== next.placement && this.panel.isVisible) {
      const point = this.adapter.findMountPoint(next.placement);
      if (point) this.panel.remount(point, next.placement);
    }
  }
  private onSignal(active: boolean): void {
    this.generating = active;
    if (active) {
      this.dismissed = false;
      this.signalAt = performance.now();
      this.delayUsed = Math.max(0, Math.min(5000, this.settings.delayMs));
      this.cancelClose();
      if (this.panel.isVisible) {
        this.panel.setDone(false);
        if (this.panel.engine.getState() === "paused") this.panel.engine.resumeFromDone();
      } else this.scheduleReveal();
    } else {
      this.cancelReveal();
      if (!this.panel.isVisible) return;
      // Freeze synchronously before presenting any action or starting grace.
      this.panel.engine.freezeForDone();
      this.panel.setDone(true);
      if (this.settings.autoClose) {
        const grace = Math.max(0, Math.min(120000, this.settings.autoCloseGraceMs));
        this.closeTimer = setTimeout(() => {
          this.closeTimer = undefined;
          if (!this.panel.isVisible || this.generating) return;
          if (this.panel.engine.getState() !== "paused") {
            // A resumed run gets a final freeze before it is closed.
            this.panel.engine.freezeForDone();
            this.panel.setDone(true);
            this.closeTimer = setTimeout(() => {
              this.closeTimer = undefined;
              this.close(false);
            }, 500);
          } else this.close(false);
        }, grace);
      }
    }
  }
  private scheduleReveal(): void {
    this.cancelReveal();
    const remaining = Math.max(0, this.delayUsed - (performance.now() - this.signalAt));
    if (remaining > 0)
      this.revealTimer = setTimeout(() => {
        this.revealTimer = undefined;
        this.requestReveal();
      }, remaining);
    else this.requestReveal();
  }
  private requestReveal(): void {
    if (
      !this.generating ||
      this.adapter.getPhase() !== "generating" ||
      this.dismissed ||
      this.destroyed ||
      this.revealFrame !== undefined
    )
      return;
    void this.gameReady.then(() => {
      if (
        !this.generating ||
        this.adapter.getPhase() !== "generating" ||
        this.dismissed ||
        this.destroyed ||
        this.revealFrame !== undefined ||
        this.gameError
      )
        return;
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = undefined;
        if (
          !this.generating ||
          this.adapter.getPhase() !== "generating" ||
          this.dismissed ||
          this.panel.isVisible
        )
          return;
        const point = this.adapter.findMountPoint(this.settings.placement);
        if (point) this.panel.show(point, this.settings.placement, this.settings.skipBoot);
        // No anchor: fail closed. A subsequent DOM mutation retries immediately.
      });
    });
  }
  private onStructure(): void {
    if (!this.generating || this.dismissed) return;
    if (!this.panel.isVisible) {
      if (performance.now() - this.signalAt >= this.delayUsed) this.requestReveal();
      return;
    }
    const point = this.adapter.findMountPoint(this.settings.placement);
    if (!point || this.panel.correctlyMounted(point) || this.remountFrame !== undefined) return;
    this.remountFrame = requestAnimationFrame(() => {
      this.remountFrame = undefined;
      if (!this.panel.isVisible || !this.generating) return;
      const current = this.adapter.findMountPoint(this.settings.placement);
      if (current && !this.panel.correctlyMounted(current))
        this.panel.remount(current, this.settings.placement);
    });
  }
  private resume(): void {
    this.panel.engine.sound.unlock();
    this.panel.setDone(false);
    this.panel.engine.resumeFromDone();
    this.panel.focus();
  }
  private close(fromUser: boolean): void {
    if (fromUser && this.generating) this.dismissed = true;
    this.cancelReveal();
    this.cancelClose();
    if (this.remountFrame !== undefined) cancelAnimationFrame(this.remountFrame);
    this.remountFrame = undefined;
    this.panel.close(!this.settings.skipBoot);
    if (!this.generating && this.settings.game === "random")
      this.gameReady = this.prepareGame("random");
  }
  private cancelReveal(): void {
    if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
    if (this.revealFrame !== undefined) cancelAnimationFrame(this.revealFrame);
    this.revealTimer = undefined;
    this.revealFrame = undefined;
  }
  private cancelClose(): void {
    if (this.closeTimer !== undefined) clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
  }
  private onVisibility = (): void => {
    if (this.panel.isVisible) this.panel.engine.setTabHidden(document.hidden);
  };
  private onNavigation = (): void => this.navigation();
  private onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) this.navigation();
  };
  private onHotkey = (event: KeyboardEvent): void => {
    if (!this.panel.isVisible || event.repeat || !matchesHotkey(event, this.settings.focusHotkey))
      return;
    // The shortcut works from a composer, but its native key event is never cancelled there.
    if (!isTextField(event)) event.preventDefault();
    this.panel.focus();
  };
  private returnToComposer(): void {
    this.panel.blur();
    this.adapter.getComposerInput()?.focus({ preventScroll: true });
  }
  navigation(): void {
    this.close(false);
    this.adapter.navigation();
  }
  diagnostics() {
    const adapter = this.adapter.diagnostics();
    const activity = this.adapter.activity();
    return {
      ...adapter,
      panel: {
        visible: this.panel.isVisible,
        scene: this.panel.engine.getState(),
        gameId: this.gameId,
        error: this.gameError,
        configuredDelayMs: this.lastDelay,
        overheadMs:
          adapter.lastSignalToFrameMs === null
            ? null
            : Math.max(0, Math.round((adapter.lastSignalToFrameMs - this.lastDelay) * 10) / 10),
        loopRunning: this.panel.engine.isLoopRunning,
        lowRate: this.panel.engine.isLowRate,
      },
      activity: {
        observers: activity.observers,
        timers:
          activity.timers +
          Number(this.revealTimer !== undefined) +
          Number(this.closeTimer !== undefined),
        scheduledFrames:
          Number(this.revealFrame !== undefined) + Number(this.remountFrame !== undefined),
      },
    };
  }
  destroy(): void {
    this.destroyed = true;
    this.cancelReveal();
    this.cancelClose();
    if (this.remountFrame !== undefined) cancelAnimationFrame(this.remountFrame);
    this.unsubSignal();
    this.unsubStructure();
    this.adapter.stop();
    this.panel.destroy();
    document.removeEventListener("keydown", this.onHotkey, true);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("popstate", this.onNavigation);
    window.removeEventListener("pageshow", this.onPageShow);
  }
}
