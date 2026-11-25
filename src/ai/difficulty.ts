import type { RNG } from "../shared/rng";

/** The old Pong values remain valid so existing settings need no migration. */
export const AI_LEVELS = ["rookie", "easy", "regular", "hard", "veteran"] as const;
export type AIDifficulty = (typeof AI_LEVELS)[number];
export interface AIProfile {
  reactionSeconds: number;
  errorChance: number;
  searchDepth: number;
  simulations: number;
}

export const AI_PROFILES: Readonly<Record<AIDifficulty, AIProfile>> = {
  rookie: { reactionSeconds: 0.32, errorChance: 0.4, searchDepth: 1, simulations: 12 },
  easy: { reactionSeconds: 0.26, errorChance: 0.25, searchDepth: 2, simulations: 32 },
  regular: { reactionSeconds: 0.2, errorChance: 0.12, searchDepth: 4, simulations: 96 },
  hard: { reactionSeconds: 0.18, errorChance: 0.04, searchDepth: 6, simulations: 256 },
  veteran: { reactionSeconds: 0.16, errorChance: 0, searchDepth: 9, simulations: 640 },
};

export function isAIDifficulty(value: unknown): value is AIDifficulty {
  return typeof value === "string" && AI_LEVELS.includes(value as AIDifficulty);
}

/** Re-aim only at the chosen reaction cadence, never every animation frame. */
export class ReactionClock {
  private elapsed = 0;

  tick(dt: number, delay: number): boolean {
    this.elapsed += Math.max(0, dt);
    if (delay <= 0 || this.elapsed >= delay) {
      this.elapsed = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.elapsed = 0;
  }
}

/** Sample a bounded error using the caller's seeded game RNG. */
export function aimError(rng: RNG, maximum: number): number {
  const bound = Math.max(0, maximum);
  return rng.range(-bound, bound);
}

export function makesMistake(rng: RNG, level: AIDifficulty): boolean {
  return rng.chance(AI_PROFILES[level].errorChance);
}

/** Three consecutive points in one direction move the CPU by one tier. */
export class AdaptiveDifficulty {
  private index: number;
  private streak = 0;

  constructor(level: AIDifficulty) {
    this.index = AI_LEVELS.indexOf(level);
  }

  get level(): AIDifficulty {
    return AI_LEVELS[this.index]!;
  }

  reset(level: AIDifficulty): void {
    this.index = AI_LEVELS.indexOf(level);
    this.streak = 0;
  }

  /** The outcome is from the human player's perspective. */
  record(outcome: "win" | "loss" | "draw"): AIDifficulty {
    if (outcome === "draw") this.streak = 0;
    else if (outcome === "win") this.streak = this.streak > 0 ? this.streak + 1 : 1;
    else this.streak = this.streak < 0 ? this.streak - 1 : -1;
    if (Math.abs(this.streak) >= 3) {
      this.index = Math.max(0, Math.min(AI_LEVELS.length - 1, this.index + Math.sign(this.streak)));
      this.streak = 0;
    }
    return this.level;
  }
}
