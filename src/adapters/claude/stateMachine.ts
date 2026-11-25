/** A two-of-three vote with an end debounce. It owns no timer while idle. */
export type GenerationPhase = "idle" | "starting" | "generating" | "finishing";
export type Votes = { a: boolean; b: boolean; c: boolean };
export interface MachineSnapshot { phase: GenerationPhase; generating: boolean; votes: Votes; }

type Timer = ReturnType<typeof setTimeout>;
export class GenerationMachine {
  private phase: GenerationPhase = "idle";
  private votes: Votes = { a: false, b: false, c: false };
  private timer: Timer | undefined;
  constructor(
    private readonly onChange: (snapshot: MachineSnapshot) => void,
    private readonly endDebounceMs = 650,
    private readonly startTimeoutMs = 4000,
  ) {}

  get hasPendingTimer(): boolean { return this.timer !== undefined; }

  get snapshot(): MachineSnapshot {
    return { phase: this.phase, generating: this.phase === "generating" || this.phase === "finishing", votes: { ...this.votes } };
  }

  /** A submit/regenerate gesture arms a short-lived discovery observer. */
  arm(): void {
    if (this.phase !== "idle") return;
    this.transition("starting");
    this.timer = setTimeout(() => { this.timer = undefined; if (this.phase === "starting") this.reset(); }, this.startTimeoutMs);
  }

  update(votes: Votes): void {
    this.votes = { ...votes };
    const count = Number(votes.a) + Number(votes.b) + Number(votes.c);
    if (count >= 2) {
      this.clearTimer();
      if (this.phase !== "generating") this.transition("generating");
      else this.onChange(this.snapshot);
      return;
    }
    if (this.phase === "generating") {
      this.transition("finishing");
      this.clearTimer();
      this.timer = setTimeout(() => { this.timer = undefined; if (this.phase === "finishing") this.reset(); }, this.endDebounceMs);
    } else {
      this.onChange(this.snapshot);
    }
  }

  reset(): void {
    this.clearTimer();
    this.votes = { a: false, b: false, c: false };
    this.transition("idle");
  }

  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
  private transition(phase: GenerationPhase): void { this.phase = phase; this.onChange(this.snapshot); }
}
