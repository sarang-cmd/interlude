import { Signal } from "../shared/signal";
import { resolveFirst, resolveLatest, type ResolveResult } from "./selectorResolver";
import type {
  AdapterDiagnostics,
  GeneratingObservable,
  MountPointResult,
  Placement,
  SelectorReport,
  SignalId,
  SignalReport,
  SiteAdapter,
  ThemeGuess,
} from "./types";
import { GenerationMachine, type MachineSnapshot, type Votes } from "./claude/stateMachine";

export type StructuralSelectors = Record<
  | "composerArea"
  | "composerInput"
  | "stopControl"
  | "assistantTurn"
  | "indicator"
  | "conversationColumn"
  | "startTrigger"
  | "regenerateTrigger"
  | "darkTheme"
  | "inactiveTurnAncestor",
  string[]
>;
export interface StructuralProfile {
  id: string;
  displayName: string;
  hosts: string[];
  selectors: StructuralSelectors;
}
export interface DetectorConfiguration {
  signals: string[];
  showOnRegenerate: boolean;
  debugLogging: boolean;
}
const HEARTBEAT_MS = 1200;
const emptyVote = (): Votes => ({ a: false, b: false, c: false });

/** Structural queries only. The observer records change timing, never message data. */
export class StructuralAdapter implements SiteAdapter {
  readonly id: string;
  readonly displayName: string;
  private enabledSignals = ["a", "b", "c"];
  private showOnRegenerate = true;
  private debugLogging = false;
  private timeline: Array<{ phase: string; timestamp: number }> = [
    { phase: "idle", timestamp: Date.now() },
  ];
  private readonly observable: GeneratingObservable = new Signal<{
    generating: boolean;
    reasons: string[];
  }>({ generating: false, reasons: [] });
  private selectors: StructuralSelectors;
  private readonly machine = new GenerationMachine((s) => this.onMachineChange(s));
  private rootObserver: MutationObserver | null = null;
  private turnObserver: MutationObserver | null = null;
  private turn: Element | null = null;
  private indicator: Element | null = null;
  private host: Element | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatAt: number | null = null;
  private votes: Votes = emptyVote();
  private reports = new Map<string, SelectorReport>();
  private watchers = new Set<() => void>();
  private signalReports: Record<SignalId, SignalReport> = {
    a: {
      active: false,
      lastChange: null,
      detail: "Stop control in composer",
      matchedSelector: null,
    },
    b: {
      active: false,
      lastChange: null,
      detail: "Indicator in latest assistant turn",
      matchedSelector: null,
    },
    c: {
      active: false,
      lastChange: null,
      detail: "Recent structural mutation",
      matchedSelector: null,
    },
    d: { active: false, lastChange: null, detail: "Stream timing only", matchedSelector: null },
  };
  private stream = {
    enabled: false,
    active: false,
    lastOpen: null as number | null,
    lastClose: null as number | null,
  };
  private signalToFrame: number | null = null;
  private running = false;
  private scanning = false;
  private lastMount: AdapterDiagnostics["mount"] = {
    found: false,
    placement: "inline",
    detail: "Not resolved",
  };

  constructor(
    private readonly profile: StructuralProfile,
    overrides: Partial<StructuralSelectors> = {},
  ) {
    this.id = profile.id;
    this.displayName = profile.displayName;
    // Ignore malformed stored overrides instead of breaking a conversation page.
    this.selectors = { ...profile.selectors };
    for (const key of Object.keys(profile.selectors) as (keyof StructuralSelectors)[]) {
      const candidate = overrides[key];
      if (
        Array.isArray(candidate) &&
        candidate.length &&
        candidate.every((v) => typeof v === "string" && v.length <= 500)
      )
        this.selectors[key] = [...candidate];
    }
  }

  configure(config: DetectorConfiguration): void {
    this.enabledSignals = config.signals.filter((signal) => ["a", "b", "c"].includes(signal));
    if (!this.enabledSignals.length) this.enabledSignals = ["a", "b", "c"];
    this.showOnRegenerate = config.showOnRegenerate;
    this.debugLogging = config.debugLogging;
    this.machine.setRequiredVotes(Math.min(2, this.enabledSignals.length));
    if (this.running) this.scan();
  }

  matches(url: string): boolean {
    try {
      return this.profile.hosts.includes(new URL(url).hostname);
    } catch {
      return false;
    }
  }
  getGeneratingSignal(): GeneratingObservable {
    return this.observable;
  }
  getPhase(): string {
    return this.machine.snapshot.phase;
  }
  activity(): { observers: number; timers: number } {
    return {
      observers: Number(!!this.rootObserver) + Number(!!this.turnObserver),
      timers: Number(this.heartbeatTimer !== undefined) + Number(this.machine.hasPendingTimer),
    };
  }
  getComposerInput(): HTMLElement | null {
    const input = this.first("composerInput", document).element;
    return input instanceof HTMLElement ? input : null;
  }
  setExcludedHost(host: Element): void {
    this.host = host;
  }
  onStructureChange(listener: () => void): () => void {
    this.watchers.add(listener);
    return () => this.watchers.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener("pointerdown", this.onIntent, true);
    document.addEventListener("click", this.onIntent, true);
    document.addEventListener("submit", this.onIntent, true);
    document.addEventListener("keydown", this.onIntent, true);
    window.addEventListener("popstate", this.onNavigation);
    window.addEventListener("pageshow", this.onPageShow);
    window.addEventListener("message", this.onStreamMessage);
    // Capture already-running sessions at page load without leaving an idle observer.
    this.scan();
    if (this.votes.a || this.votes.b) {
      this.machine.arm();
      this.scan();
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    document.removeEventListener("pointerdown", this.onIntent, true);
    document.removeEventListener("click", this.onIntent, true);
    document.removeEventListener("submit", this.onIntent, true);
    document.removeEventListener("keydown", this.onIntent, true);
    window.removeEventListener("popstate", this.onNavigation);
    window.removeEventListener("pageshow", this.onPageShow);
    window.removeEventListener("message", this.onStreamMessage);
    this.machine.reset();
    this.disconnectObservers();
    // Subscribers belong to the controller; stop/start must not unsubscribe
    // them when the operator toggles the extension off and on.
  }

  /** Called for SPA history changes delivered by the background worker. */
  navigation(): void {
    if (!this.running) return;
    this.machine.reset();
    this.disconnectObservers();
    this.heartbeatAt = null;
    this.turn = null;
    this.indicator = null;
    this.votes = emptyVote();
    // The old conversation can remain mounted briefly after pushState. Do not
    // re-interpret its stale signals as a new generation in the new route.
  }
  private onNavigation = (): void => this.navigation();
  private onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) this.navigation();
  };

  setStreamHook(enabled: boolean): void {
    const wasEnabled = this.stream.enabled;
    if (!enabled && !wasEnabled) return;
    this.stream.enabled = enabled;
    if (!enabled) {
      this.stream.active = false;
      this.updateReport("d", false, null);
    }
    // The hook accepts only a control bit and emits open/close timestamps.
    window.postMessage({ source: "interlude-stream-control", enabled }, location.origin);
  }
  private onStreamMessage = (event: MessageEvent<unknown>): void => {
    if (
      event.source !== window ||
      !this.stream.enabled ||
      !event.data ||
      typeof event.data !== "object"
    )
      return;
    const data = event.data as { source?: unknown; phase?: unknown; active?: unknown };
    if (
      data.source !== "interlude-stream-timing" ||
      (data.phase !== "open" && data.phase !== "close") ||
      typeof data.active !== "boolean"
    )
      return;
    const now = performance.now();
    this.stream.active = data.active;
    if (data.phase === "open") this.stream.lastOpen = now;
    else this.stream.lastClose = now;
    this.updateReport("d", data.active, null);
  };

  private isIntentElement(target: Element): boolean {
    for (const selector of this.selectors.startTrigger) {
      try {
        if (target.closest(selector)) return true;
      } catch {
        /* invalid selector */
      }
    }
    return false;
  }
  private isComposer(target: Element): boolean {
    for (const selector of this.selectors.composerInput) {
      try {
        if (target.closest(selector)) return true;
      } catch {
        /* invalid selector */
      }
    }
    return false;
  }
  private onIntent = (event: Event): void => {
    if (this.machine.snapshot.phase !== "idle") return;
    const target = event.composedPath()[0];
    if (
      !(target instanceof Element) ||
      (this.host && (target === this.host || this.host.contains(target)))
    )
      return;
    const keyboard = event instanceof KeyboardEvent;
    const isSendKey =
      keyboard &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing &&
      this.isComposer(target);
    const isSubmit =
      event.type === "submit" &&
      this.selectors.composerArea.some((selector) => {
        try {
          return target.matches(selector);
        } catch {
          return false;
        }
      });
    if (!(isSendKey || isSubmit || (!keyboard && this.isIntentElement(target)))) return;
    if (
      !this.showOnRegenerate &&
      this.selectors.regenerateTrigger.some((selector) => {
        try {
          return !!target.closest(selector);
        } catch {
          return false;
        }
      })
    )
      return;
    // Capture runs before the site's handlers; the observer is in place before it mutates.
    this.machine.arm();
    this.scan();
  };

  private onMachineChange(snapshot: MachineSnapshot): void {
    if (this.timeline.at(-1)?.phase !== snapshot.phase) {
      this.timeline.push({ phase: snapshot.phase, timestamp: Date.now() });
      if (this.timeline.length > 24) this.timeline.shift();
      if (this.debugLogging)
        console.debug("[Interlude] detector state", this.id, snapshot.phase, snapshot.votes);
    }
    if (
      snapshot.phase === "starting" ||
      snapshot.phase === "generating" ||
      snapshot.phase === "finishing"
    )
      this.observe();
    if (snapshot.phase === "idle") {
      this.disconnectObservers();
      // A finishing timer can expire before the heartbeat's own timeout.
      // Diagnostics must describe the reset votes rather than stale activity.
      for (const key of ["a", "b", "c"] as const) {
        this.updateReport(
          key,
          snapshot.votes[key],
          snapshot.votes[key] ? this.signalReports[key].matchedSelector : null,
        );
      }
    }
    const reasons = (["a", "b", "c"] as const)
      .filter((k) => snapshot.votes[k])
      .map((k) => k.toUpperCase());
    const current = this.observable.value;
    if (current.generating !== snapshot.generating || current.reasons.join() !== reasons.join())
      this.observable.set({ generating: snapshot.generating, reasons });
  }

  private observe(): void {
    if (!this.running || this.rootObserver || !document.documentElement) return;
    this.rootObserver = new MutationObserver((records) => {
      if (!records.some((r) => !this.isOwnMutation(r))) return;
      this.scan();
      for (const listener of this.watchers) listener();
    });
    this.rootObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "aria-busy",
        "aria-hidden",
        "data-state",
        "data-is-streaming",
        "disabled",
        "hidden",
        "inert",
        "class",
        "style",
      ],
    });
    this.observeTurn(this.turn);
  }

  private observeTurn(turn: Element | null): void {
    this.turnObserver?.disconnect();
    this.turnObserver = null;
    this.turn = turn;
    this.heartbeatAt = null;
    if (this.heartbeatTimer !== undefined) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    if (!turn || !this.rootObserver) return;
    this.turnObserver = new MutationObserver((records) => {
      if (!records.some((r) => !this.isOwnMutation(r))) return;
      this.heartbeatAt = performance.now();
      if (this.heartbeatTimer !== undefined) clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = setTimeout(() => {
        this.heartbeatTimer = undefined;
        this.scan();
      }, HEARTBEAT_MS + 10);
      this.scan();
    });
    // We do not request old values or inspect the mutation's data.
    this.turnObserver.observe(turn, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-busy", "data-state", "data-is-streaming"],
    });
  }

  private isOwnMutation(record: MutationRecord): boolean {
    if (!this.host) return false;
    if (record.target === this.host || this.host.contains(record.target)) return true;
    if (record.type === "childList") {
      const nodes = [...record.addedNodes, ...record.removedNodes];
      return nodes.length > 0 && nodes.every((n) => n === this.host || this.host?.contains(n));
    }
    return false;
  }

  private disconnectObservers(): void {
    this.rootObserver?.disconnect();
    this.rootObserver = null;
    this.turnObserver?.disconnect();
    this.turnObserver = null;
    if (this.heartbeatTimer !== undefined) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    this.heartbeatAt = null;
  }

  private first(name: keyof StructuralSelectors, root: ParentNode): ResolveResult {
    const result = resolveFirst(this.selectors[name], (s) =>
      root instanceof Element && root.matches(s) ? root : root.querySelector(s),
    );
    this.reports.set(name, {
      element: name,
      candidates: result.candidates,
      matchedIndex: result.matchedIndex,
      matchedSelector: result.matchedSelector,
    });
    return result;
  }
  private latestTurn(): Element | null {
    const isActive = (element: Element): boolean =>
      !this.selectors.inactiveTurnAncestor.some((selector) => {
        try {
          return !!element.closest(selector);
        } catch {
          return false;
        }
      });
    // Old branches may remain mounted after the active branch. Different
    // turns can also use different markup; consider all active candidates.
    const result = resolveLatest(this.selectors.assistantTurn, (s) =>
      Array.from(document.querySelectorAll(s)).filter(isActive),
    );
    this.reports.set("assistantTurn", {
      element: "assistantTurn",
      candidates: result.candidates,
      matchedIndex: result.matchedIndex,
      matchedSelector: result.matchedSelector,
    });
    return result.element;
  }
  private updateReport(id: SignalId, active: boolean, selector: string | null): void {
    const r = this.signalReports[id];
    if (r.active !== active) r.lastChange = performance.now();
    r.active = active;
    r.matchedSelector = selector;
  }

  private scan(): void {
    if (!this.running || this.scanning) return;
    this.scanning = true;
    try {
      const composer = this.first("composerArea", document).element;
      // Record the input match separately for selector repair.
      this.first("composerInput", document);
      const stop = composer
        ? this.first("stopControl", composer)
        : this.first("stopControl", document);
      const latest = this.latestTurn();
      if (latest !== this.turn) this.observeTurn(latest);
      const indicator = latest
        ? this.first("indicator", latest)
        : this.first("indicator", document.createDocumentFragment());
      this.indicator = indicator.element;
      this.first("conversationColumn", document);
      this.first("startTrigger", document);
      const heartbeat =
        this.heartbeatAt !== null && performance.now() - this.heartbeatAt < HEARTBEAT_MS;
      this.votes = { a: !!stop.element && !!composer, b: !!indicator.element, c: heartbeat };
      this.updateReport("a", this.votes.a, stop.matchedSelector);
      this.updateReport("b", this.votes.b, indicator.matchedSelector);
      this.updateReport("c", this.votes.c, null);
      this.machine.update({
        a: this.enabledSignals.includes("a") && this.votes.a,
        b: this.enabledSignals.includes("b") && this.votes.b,
        c: this.enabledSignals.includes("c") && this.votes.c,
      });
    } finally {
      this.scanning = false;
    }
  }

  findMountPoint(placement: Placement, completedFallback = false): MountPointResult | null {
    let result: MountPointResult | null = null;
    if (placement === "inline") {
      const indicator = this.turn ? this.first("indicator", this.turn).element : null;
      if (indicator?.parentElement)
        result = {
          anchor: indicator,
          position: "after",
          detail: "Immediately after the latest indicator",
        };
      else if (completedFallback && this.turn?.isConnected && this.turn.parentElement)
        result = {
          anchor: this.turn,
          position: "after",
          detail: "Below the final turn after its indicator was replaced",
        };
    } else if (placement === "docked-composer") {
      const composer = this.first("composerArea", document).element;
      if (composer?.parentElement)
        result = { anchor: composer, position: "before", detail: "Immediately above the composer" };
    } else if (placement === "overlay" && document.body) {
      result = {
        anchor: document.body,
        position: "fixed-overlay",
        detail: "Draggable viewport corner",
      };
    } else if (placement === "side-panel" && document.body) {
      result = { anchor: document.body, position: "fixed-side", detail: "Docked viewport side" };
    }
    this.lastMount = {
      found: !!result,
      placement,
      detail: result?.detail ?? "No matching anchor; panel remains hidden",
    };
    return result;
  }

  getTheme(): ThemeGuess {
    const color = getComputedStyle(document.documentElement).colorScheme;
    return !!this.first("darkTheme", document).element || color.includes("dark") ? "dark" : "light";
  }
  recordSignalToFrame(ms: number): void {
    this.signalToFrame = Math.round(ms * 10) / 10;
  }
  diagnostics(): AdapterDiagnostics {
    return {
      adapterId: this.id,
      url: location.origin,
      state: this.machine.snapshot.phase,
      generating: this.observable.value.generating,
      reasons: [...this.observable.value.reasons],
      signals: structuredClone(this.signalReports),
      selectors: [...this.reports.values()],
      mount: this.lastMount,
      lastSignalToFrameMs: this.signalToFrame,
      streamHook: { ...this.stream },
      theme: this.getTheme(),
      timeline: this.timeline.map((event) => ({ ...event })),
      timestamp: Date.now(),
    };
  }
}
