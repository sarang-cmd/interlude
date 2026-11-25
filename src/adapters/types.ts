/**
 * SiteAdapter — the contract every site implementation fulfils.
 * See docs/ADAPTERS.md for the full walkthrough.
 */
import type { Signal } from "../shared/signal";

export type Placement = "inline" | "overlay" | "docked-composer" | "side-panel";
export type ThemeGuess = "light" | "dark";

export type SignalId = "a" | "b" | "c" | "d";

export interface SignalReport {
  /** Is the signal currently asserting "generating"? */
  active: boolean;
  /** performance.now() of the last transition, or null if never. */
  lastChange: number | null;
  /** Human-readable detail for the diagnostics page. */
  detail: string;
  /** Which selector candidate matched (for DOM-backed signals). */
  matchedSelector: string | null;
}

export interface SelectorReport {
  element: string;
  candidates: string[];
  matchedIndex: number;
  matchedSelector: string | null;
}

export interface MountReport {
  found: boolean;
  placement: Placement;
  detail: string;
}

export interface AdapterDiagnostics {
  adapterId: string;
  url: string;
  state: string;
  generating: boolean;
  reasons: string[];
  signals: Record<SignalId, SignalReport>;
  selectors: SelectorReport[];
  mount: MountReport;
  /** ms from generating-signal to first game frame (rolling), or null. */
  lastSignalToFrameMs: number | null;
  streamHook: { enabled: boolean; active: boolean; lastOpen: number | null; lastClose: number | null };
  timestamp: number;
}

export type GeneratingObservable = Signal<{ generating: boolean; reasons: string[] }>;

export interface MountPointResult {
  /** Element the panel should be anchored to. */
  anchor: Element;
  /** Where to put the host relative to the anchor. */
  position: "after" | "before" | "inside-end" | "fixed-overlay" | "fixed-side";
  /** Human-readable note for diagnostics. */
  detail: string;
}

export interface SiteAdapter {
  readonly id: string;
  readonly displayName: string;
  matches(url: string): boolean;
  /** Observable of generating state with human-readable reasons. */
  getGeneratingSignal(): GeneratingObservable;
  /**
   * Locate the mount point for a placement. Returns null when the page
   * structure is not recognised — the panel then falls back to overlay.
   */
  findMountPoint(placement: Placement): MountPointResult | null;
  /** Best-effort theme guess of the host page. */
  getTheme(): ThemeGuess;
  /** Freeze the current signal/selector/mount state for the diagnostics page. */
  diagnostics(): AdapterDiagnostics;
  /** Start observing. Idempotent. */
  start(): void;
  /** Disconnect every observer and timer. After stop(), nothing runs. */
  stop(): void;
  /** Structural invalidations are only emitted while observation is armed. */
  onStructureChange(listener: () => void): () => void;
  setExcludedHost(host: Element): void;
  getComposerInput(): HTMLElement | null;
  getPhase(): string;
  setStreamHook(enabled: boolean): void;
  navigation(): void;
  activity(): { observers: number; timers: number };
  /** Record the signal→frame measurement. */
  recordSignalToFrame(ms: number): void;
}

/** A new adapter is discovered from its folder's default-exported plugin. */
export interface SitePlugin {
  id: string;
  implemented: boolean;
  matches(url: string): boolean;
  selectorOverrideKey?: string;
  create(configuration: unknown): SiteAdapter;
}
