import type { RNG } from "../../shared/rng";

export const SWEEP_SIDE = 9;
export const SWEEP_MINES = 10;
export type SweepOutcome = "playing" | "won" | "lost";
export function sweepNeighbors(index: number): number[] {
  const row = Math.floor(index / SWEEP_SIDE),
    col = index % SWEEP_SIDE;
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const r = row + dy,
        c = col + dx;
      if (r >= 0 && r < SWEEP_SIDE && c >= 0 && c < SWEEP_SIDE) result.push(r * SWEEP_SIDE + c);
    }
  return result;
}

/** Mine locations are deferred until the first move so its full neighborhood is safe. */
export class SweepBoard {
  readonly mines = Array<boolean>(81).fill(false);
  readonly open = Array<boolean>(81).fill(false);
  readonly flagged = Array<boolean>(81).fill(false);
  outcome: SweepOutcome = "playing";
  placed = false;
  exploded: number | null = null;
  constructor(private readonly rng: RNG) {}
  private valid(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < 81;
  }
  private place(first: number): void {
    const safe = new Set([first, ...sweepNeighbors(first)]);
    const candidates = Array.from({ length: 81 }, (_, index) => index).filter(
      (index) => !safe.has(index),
    );
    this.rng.shuffle(candidates);
    for (const index of candidates.slice(0, SWEEP_MINES)) this.mines[index] = true;
    this.placed = true;
  }
  adjacent(index: number): number {
    return sweepNeighbors(index).filter((cell) => this.mines[cell]).length;
  }
  toggleFlag(index: number): boolean {
    if (this.outcome !== "playing" || !this.valid(index) || this.open[index]) return false;
    this.flagged[index] = !this.flagged[index];
    return true;
  }
  reveal(index: number): boolean {
    if (this.outcome !== "playing" || !this.valid(index) || this.open[index] || this.flagged[index])
      return false;
    if (!this.placed) this.place(index);
    if (this.mines[index]) {
      this.open[index] = true;
      this.exploded = index;
      this.outcome = "lost";
      return true;
    }
    const queue = [index];
    while (queue.length) {
      const cell = queue.pop()!;
      if (this.open[cell] || this.flagged[cell] || this.mines[cell]) continue;
      this.open[cell] = true;
      if (this.adjacent(cell) === 0)
        queue.push(...sweepNeighbors(cell).filter((next) => !this.open[next]));
    }
    if (this.open.filter(Boolean).length === 81 - SWEEP_MINES) this.outcome = "won";
    return true;
  }
}
