/**
 * Deterministic seeded RNG (mulberry32). Same seed → same sequence.
 * Used by games so runs are reproducible and tests are stable.
 */
export class RNG {
  private state: number;

  constructor(seed: number) {
    // Avoid a zero state producing a broken sequence.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Snapshot for reversible simulations such as 2048 undo. */
  getState(): number {
    return this.state;
  }
  setState(state: number): void {
    this.state = state;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Pick an element. Throws on empty input — callers must not do that. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("RNG.pick of empty array");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const a = items[i] as T;
      items[i] = items[j] as T;
      items[j] = a;
    }
    return items;
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Non-deterministic seed for live play; tests pass explicit seeds. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
