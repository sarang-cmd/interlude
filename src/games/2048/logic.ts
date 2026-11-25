import { RNG } from "../../shared/rng";
export type Direction = "left" | "right" | "up" | "down";
export interface TileTransition { from: { r: number; c: number }; to: { r: number; c: number }; value: number; }
export interface MoveResult { moved: boolean; gained: number; mergedMax: number; tiles: TileTransition[]; }
type Snapshot = { grid: number[][]; score: number; bestTile: number; rngState: number };

/** 2048 with one merge per tile per move, reversible RNG, and a finite undo budget. */
export class Game2048 {
  readonly size = 4;
  grid: number[][] = [];
  score = 0;
  bestTile = 0;
  alive = true;
  private readonly rng: RNG;
  private history: Snapshot[] = [];
  private remaining: number;
  private readonly undoLimit: number;
  constructor(options: { seed?: number; undoLimit?: number } = {}) {
    this.rng = new RNG(options.seed ?? Date.now());
    this.undoLimit = Math.max(0, Math.min(20, Math.floor(options.undoLimit ?? 3)));
    this.remaining = this.undoLimit;
    this.reset();
  }
  reset(): void {
    this.grid = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    this.score = 0; this.bestTile = 0; this.alive = true; this.history = []; this.remaining = this.undoLimit;
    this.spawn(); this.spawn();
  }
  get undoRemaining(): number { return this.remaining; }
  private spawn(): void {
    const empty: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!this.grid[r]?.[c]) empty.push({ r, c });
    if (!empty.length) return;
    const { r, c } = this.rng.pick(empty);
    const value = this.rng.chance(0.9) ? 2 : 4;
    this.grid[r]![c] = value;
    this.bestTile = Math.max(this.bestTile, value);
  }
  undo(): boolean {
    if (!this.remaining || !this.history.length) return false;
    const snapshot = this.history.pop()!;
    this.grid = snapshot.grid.map((row) => [...row]);
    this.score = snapshot.score; this.bestTile = snapshot.bestTile; this.rng.setState(snapshot.rngState);
    this.remaining--; this.alive = true;
    return true;
  }
  /** Row and cell indices in a left-facing coordinate system. */
  private coord(direction: Direction, row: number, col: number): { r: number; c: number } {
    switch (direction) {
      case "left": return { r: row, c: col };
      case "right": return { r: row, c: 3 - col };
      case "up": return { r: col, c: row };
      case "down": return { r: 3 - col, c: row };
    }
  }
  move(direction: Direction): MoveResult {
    const none: MoveResult = { moved: false, gained: 0, mergedMax: 0, tiles: [] };
    if (!this.alive) return none;
    const next = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const tiles: TileTransition[] = [];
    let gained = 0, mergedMax = 0;
    for (let row = 0; row < 4; row++) {
      const occupied: Array<{ value: number; from: { r: number; c: number } }> = [];
      for (let col = 0; col < 4; col++) {
        const from = this.coord(direction, row, col);
        const value = this.grid[from.r]?.[from.c] ?? 0;
        if (value) occupied.push({ value, from });
      }
      let destCol = 0;
      for (let i = 0; i < occupied.length; i++) {
        const item = occupied[i]!;
        const destination = this.coord(direction, row, destCol++);
        const following = occupied[i + 1];
        let value = item.value;
        tiles.push({ from: item.from, to: destination, value });
        if (following && following.value === value) {
          tiles.push({ from: following.from, to: destination, value: following.value });
          value *= 2; gained += value; mergedMax = Math.max(mergedMax, value); i++;
        }
        next[destination.r]![destination.c] = value;
      }
    }
    const moved = next.some((row, r) => row.some((v, c) => v !== this.grid[r]?.[c]));
    if (!moved) { if (!this.hasMoves()) this.alive = false; return none; }
    if (this.remaining) {
      this.history.push({ grid: this.grid.map((row) => [...row]), score: this.score, bestTile: this.bestTile, rngState: this.rng.getState() });
      if (this.history.length > 64) this.history.shift();
    }
    this.grid = next; this.score += gained; this.bestTile = Math.max(this.bestTile, mergedMax);
    this.spawn();
    if (!this.hasMoves()) this.alive = false;
    return { moved: true, gained, mergedMax, tiles };
  }
  hasMoves(): boolean {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const v = this.grid[r]?.[c];
      if (!v || (c < 3 && this.grid[r]?.[c + 1] === v) || (r < 3 && this.grid[r + 1]?.[c] === v)) return true;
    }
    return false;
  }
}
