import { Signal } from "../shared/signal";
import type {
  AdapterDiagnostics,
  GeneratingObservable,
  MountPointResult,
  Placement,
  SiteAdapter,
  ThemeGuess,
} from "./types";

/** Interface-only adapter. It cannot start a panel before a site is implemented. */
export class InactiveAdapter implements SiteAdapter {
  private signal: GeneratingObservable = new Signal<{ generating: boolean; reasons: string[] }>({
    generating: false,
    reasons: [],
  });
  constructor(
    readonly id: string,
    readonly displayName: string,
    private readonly hosts: string[],
  ) {}
  matches(url: string): boolean {
    try {
      return this.hosts.includes(new URL(url).hostname);
    } catch {
      return false;
    }
  }
  getGeneratingSignal(): GeneratingObservable {
    return this.signal;
  }
  findMountPoint(_placement: Placement): MountPointResult | null {
    return null;
  }
  getTheme(): ThemeGuess {
    return "light";
  }
  onStructureChange(_listener: () => void): () => void {
    return () => {};
  }
  setExcludedHost(_host: Element): void {
    /* inactive */
  }
  getComposerInput(): HTMLElement | null {
    return null;
  }
  getPhase(): string {
    return "idle";
  }
  configure(): void {}
  setStreamHook(_enabled: boolean): void {
    /* inactive */
  }
  navigation(): void {
    /* inactive */
  }
  activity(): { observers: number; timers: number } {
    return { observers: 0, timers: 0 };
  }
  start(): void {
    /* intentionally inactive until this site has a verified adapter */
  }
  stop(): void {
    /* no observers */
  }
  recordSignalToFrame(_ms: number): void {
    /* no panel */
  }
  diagnostics(): AdapterDiagnostics {
    const report = {
      active: false,
      lastChange: null,
      detail: "Adapter not implemented",
      matchedSelector: null,
    };
    return {
      adapterId: this.id,
      url: "",
      state: "unsupported",
      generating: false,
      reasons: [],
      signals: { a: { ...report }, b: { ...report }, c: { ...report }, d: { ...report } },
      selectors: [],
      mount: { found: false, placement: "inline", detail: "Adapter not implemented" },
      lastSignalToFrameMs: null,
      streamHook: { enabled: false, active: false, lastOpen: null, lastClose: null },
      theme: "dark",
      timeline: [],
      timestamp: Date.now(),
    };
  }
}
