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
import { FocusGuard, cleanStats, type GuardSnapshot } from "../focus/guard";
import { loadStats, saveDeltas } from "../focus/stats";

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
  private readonly guard: FocusGuard;
  private readonly guardReady: Promise<void>;
  private guardTimer: ReturnType<typeof setInterval> | undefined;
  private lockTimer: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;

  constructor(settings: InterludeSettings, adapter: SiteAdapter) {
    this.settings = settings;
    this.adapter = adapter;
    this.guard = new FocusGuard(settings);
    this.guardReady = loadStats()
      .then((stats) => {
        this.guard.replaceBase(stats);
        this.updateGuard(this.guard.snapshot());
      })
      .catch(() => {});
    this.panel = new Panel(settings, adapter.displayName, {
      onChoose: (choice) => this.choose(choice),
      onQuickChange: (patch) => {
        void saveSettings(patch, this.adapter.id as import("../settings/schema").SiteId);
      },
      onClose: () => {
        this.close(true);
        this.adapter.getComposerInput()?.focus({ preventScroll: true });
      },
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
      if (state === "playing" && !document.hidden && this.panel.isVisible) this.startTracking();
      else if (state !== "playing") this.stopTracking(false);
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
    this.panel.setTheme(this.adapter.getTheme());
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
    this.adapter.configure(settings);
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
    void saveSettings({ game: choice }, this.adapter.id as import("../settings/schema").SiteId);
  }
  applySettings(next: InterludeSettings): void {
    const old = this.settings;
    this.settings = next;
    this.guard.setSettings(next);
    this.panel.updateSettings(next);
    this.panel.setTheme(this.adapter.getTheme());
    this.adapter.configure(next);
    this.updateGuard(this.guard.snapshot());
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
      const point = this.adapter.findMountPoint(next.placement, !this.generating);
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
      if (this.panel.isLocked) {
        this.close(false);
        return;
      }
      // Freeze synchronously before presenting any action or starting grace.
      this.panel.engine.freezeForDone();
      const host = this.panel.host;
      if (
        !host.isConnected ||
        host.getClientRects().length === 0 ||
        getComputedStyle(host).visibility === "hidden"
      ) {
        // A site can replace the whole turn as it finishes. Preserve the frozen
        // run in flow below the final turn rather than losing its controls.
        const point = this.adapter.findMountPoint(this.settings.placement, true);
        if (!point) {
          this.close(false);
          return;
        }
        this.panel.remount(point, this.settings.placement);
      }
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
    void Promise.all([this.gameReady, this.guardReady]).then(() => {
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
        const block = this.guard.snapshot().block;
        if (point && block === "lock") this.showLock(point);
        else if (point && !block)
          this.panel.show(
            point,
            this.settings.placement,
            this.settings.skipBoot || this.settings.reduceMotion,
          );
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
    const hadPanel = this.panel.isVisible;
    const duration = this.stopTracking(true);
    if (hadPanel && duration > 0 && this.settings.sessionSummary) this.panel.showSummary(duration);
    if (this.lockTimer !== undefined) clearTimeout(this.lockTimer);
    this.lockTimer = undefined;
    if (fromUser && this.generating) this.dismissed = true;
    this.cancelReveal();
    this.cancelClose();
    if (this.remountFrame !== undefined) cancelAnimationFrame(this.remountFrame);
    this.remountFrame = undefined;
    this.panel.close(!this.settings.skipBoot && !this.settings.reduceMotion);
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
    if (document.hidden) this.stopTracking(false);
    else if (this.panel.isVisible && this.panel.engine.getState() === "playing")
      this.startTracking();
  };
  private startTracking(): void {
    if (!this.gameId || this.guardTimer !== undefined || this.guard.snapshot().block) return;
    this.guard.begin(this.gameId);
    this.updateGuard(this.guard.tick());
    if (this.guard.snapshot().block) return;
    this.guardTimer = setInterval(() => this.updateGuard(this.guard.tick()), 1000);
  }
  private stopTracking(end: boolean): number {
    if (this.guardTimer !== undefined) clearInterval(this.guardTimer);
    this.guardTimer = undefined;
    const duration = end ? this.guard.end() : (this.guard.pause(), 0);
    void this.flushStats();
    return duration;
  }
  private async flushStats(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.guard.pendingDeltas().length) {
        const deltas = this.guard.pendingDeltas();
        const remote = await saveDeltas(deltas);
        this.guard.acknowledge(deltas.length, remote);
      }
    } catch {
      /* pending deltas remain for the next active tick */
    } finally {
      this.flushing = false;
    }
  }
  private updateGuard(snapshot: GuardSnapshot): void {
    if (!this.panel) return;
    this.panel.setDaily(snapshot.todayMs, this.settings.budgetEnabled);
    for (const notice of this.guard.takeNotices())
      this.panel.setNotice(
        notice.type === "budget"
          ? "DAILY BUDGET REACHED"
          : `${notice.minutes} MINUTES PLAYED TODAY`,
      );
    if (snapshot.block === "lock" && this.panel.isVisible && !this.panel.isLocked) {
      this.stopTracking(true);
      const point = this.adapter.findMountPoint(this.settings.placement, !this.generating);
      if (point) this.showLock(point);
      else this.close(false);
    } else if ((snapshot.block === "quiet" || snapshot.block === "study") && this.panel.isVisible)
      this.close(false);
    else if (!snapshot.block && this.panel.isLocked) {
      this.panel.close(false);
      if (this.lockTimer !== undefined) clearTimeout(this.lockTimer);
      this.lockTimer = undefined;
      if (this.generating && !this.dismissed) this.scheduleReveal();
    }
    void this.flushStats();
  }
  private showLock(point: import("../adapters/types").MountPointResult): void {
    this.panel.showLock(point, this.settings.placement);
    if (this.lockTimer !== undefined) clearTimeout(this.lockTimer);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    this.lockTimer = setTimeout(
      () => {
        this.lockTimer = undefined;
        this.updateGuard(this.guard.snapshot());
      },
      Math.max(100, midnight - now.getTime() + 100),
    );
  }
  refreshStats(raw: unknown): void {
    if (!this.flushing && !this.guard.pendingDeltas().length) {
      this.guard.replaceBase(cleanStats(raw));
      this.updateGuard(this.guard.snapshot());
    }
  }
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
    this.stopTracking(true);
    if (this.lockTimer !== undefined) clearTimeout(this.lockTimer);
    this.lockTimer = undefined;
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
