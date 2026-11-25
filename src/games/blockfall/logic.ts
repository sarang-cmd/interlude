/**
 * BLOCKFALL — pure logic. 7-bag, SRS-style wall kicks, hold, ghost,
 * lock delay, soft/hard drop. Unit-tested in tests/blockfall.test.ts.
 */
import { RNG } from "../../shared/rng";

export type PieceKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Cell = 0 | 1; // board stores piece indices+1; 0 = empty

export interface ActivePiece {
  kind: PieceKind;
  rotation: number; // 0..3
  x: number; // column of the piece's bounding box origin
  y: number; // row (can be negative above the field)
}

export interface BlockfallEvent {
  kind: "move" | "rotate" | "softDrop" | "hardDrop" | "hold" | "lock" | "lineClear" | "levelUp" | "gameOver";
  cells?: number;
  score?: number;
  lines?: number;
}

export const COLS = 10;
export const ROWS = 20;
export const PIECES: Record<PieceKind, number[][]> = {
  // Bounding boxes as 4x4 (I,O) or 3x3 masks
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

export const PIECE_IDS: Record<PieceKind, number> = {
  I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7,
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;
const GRAVITY_START = 0.85; // seconds per row at level 1
const GRAVITY_FACTOR = 0.78; // per level
const MIN_GRAVITY = 0.05;

/** Super Rotation System kicks. Coordinates use screen-down-positive Y. */
export function kicksFor(kind: PieceKind, from: number, to: number): Array<[number, number]> {
  const key = `${from}>${to}`;
  const ordinary: Record<string, Array<[number, number]>> = {
    "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  };
  const line: Record<string, Array<[number, number]>> = {
    "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  };
  return kind === "O" ? [[0, 0]] : ((kind === "I" ? line : ordinary)[key] ?? [[0, 0]]);
}

export class BlockfallLogic {
  board: number[][] = []; // ROWS x COLS, 0 empty, else PIECE_IDS value
  active: ActivePiece | null = null;
  holdKind: PieceKind | null = null;
  holdUsed = false;
  queue: PieceKind[] = [];
  score = 0;
  lines = 0;
  level = 1;
  alive = true;
  private rng: RNG;
  private dropTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private bag: PieceKind[] = [];

  constructor(options: { seed?: number } = {}) {
    this.rng = new RNG(options.seed ?? Date.now());
    this.reset();
  }

  reset(): void {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.alive = true;
    this.holdKind = null;
    this.holdUsed = false;
    this.queue = [];
    this.bag = [];
    this.fillQueue(5);
    this.spawnNext();
  }

  private refillBag(): void {
    const kinds: PieceKind[] = ["I", "O", "T", "S", "Z", "J", "L"];
    this.bag = this.rng.shuffle([...kinds]);
  }

  private fillQueue(n: number): void {
    while (this.queue.length < n) {
      if (this.bag.length === 0) this.refillBag();
      this.queue.push(this.bag.pop() as PieceKind);
    }
  }

  /** Next 3 pieces for the preview. */
  peekQueue(n = 3): PieceKind[] {
    this.fillQueue(n);
    return this.queue.slice(0, n);
  }

  private spawn(kind: PieceKind): void {
    this.fillQueue(5);
    const def = PIECES[kind];
    const w = def[0]?.length ?? 3;
    this.active = {
      kind,
      rotation: 0,
      x: Math.floor((COLS - w) / 2),
      y: kind === "I" ? -1 : 0,
    };
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (!this.fits(this.active)) {
      this.alive = false;
    }
  }

  private spawnNext(): void {
    const kind = this.queue.shift();
    if (!kind) {
      this.fillQueue(1);
      this.spawnNext();
      return;
    }
    this.holdUsed = false;
    this.spawn(kind);
  }

  private cellsOf(piece: ActivePiece, rotation = piece.rotation): Array<{ x: number; y: number }> {
    const def = PIECES[piece.kind];
    const size = def.length;
    const rotated = this.rotateMask(def, rotation % 4);
    const cells: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (rotated[y]?.[x]) cells.push({ x: piece.x + x, y: piece.y + y });
      }
    }
    return cells;
  }

  /** Rotate a square mask clockwise `times` times. */
  private rotateMask(mask: number[][], times: number): number[][] {
    let m = mask.map((row) => [...row]);
    for (let t = 0; t < times; t++) {
      const size = m.length;
      const next: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          next[x]![size - 1 - y] = m[y]?.[x] ?? 0;
      m = next;
    }
    return m;
  }

  private fits(piece: ActivePiece): boolean {
    for (const cell of this.cellsOf(piece)) {
      if (cell.x < 0 || cell.x >= COLS) return false;
      if (cell.y >= ROWS) return false;
      if (cell.y >= 0 && this.board[cell.y]?.[cell.x]) return false;
    }
    return true;
  }

  /** Ghost piece row — where the current piece would land. */
  ghostY(): number {
    if (!this.active) return 0;
    let y = this.active.y;
    while (this.fits({ ...this.active, y: y + 1 })) y++;
    return y;
  }

  move(dx: -1 | 1): BlockfallEvent[] {
    if (!this.active || !this.alive) return [];
    const next = { ...this.active, x: this.active.x + dx };
    if (this.fits(next)) {
      this.active = next;
      this.onLockInterrupt();
      return [{ kind: "move" }];
    }
    return [];
  }

  rotate(dir: 1 | -1): BlockfallEvent[] {
    if (!this.active || !this.alive) return [];
    const from = this.active.rotation;
    const to = (from + dir + 4) % 4;
    for (const [dx, dy] of kicksFor(this.active.kind, from, to)) {
      const next = { ...this.active, rotation: to, x: this.active.x + dx, y: this.active.y + dy };
      if (this.fits(next)) {
        this.active = next;
        this.onLockInterrupt();
        return [{ kind: "rotate" }];
      }
    }
    return [];
  }

  /** Soft drop — one row; returns false if it cannot move (lock pending). */
  softDrop(): BlockfallEvent[] {
    if (!this.active || !this.alive) return [];
    const next = { ...this.active, y: this.active.y + 1 };
    if (this.fits(next)) {
      this.active = next;
      this.score += 1;
      return [{ kind: "softDrop" }];
    }
    return [];
  }

  hardDrop(): BlockfallEvent[] {
    if (!this.active || !this.alive) return [];
    let dropped = 0;
    while (this.fits({ ...this.active, y: this.active.y + 1 })) {
      this.active.y += 1;
      dropped++;
    }
    this.score += dropped * 2;
    const events = this.lockActive();
    return [{ kind: "hardDrop", cells: dropped }, ...events];
  }

  hold(): BlockfallEvent[] {
    if (!this.active || !this.alive || this.holdUsed) return [];
    const current = this.active.kind;
    if (this.holdKind) {
      const swap = this.holdKind;
      this.holdKind = current;
      this.spawn(swap);
    } else {
      this.holdKind = current;
      this.spawnNext();
    }
    this.holdUsed = true;
    return this.alive ? [{ kind: "hold" }] : [{ kind: "hold" }, { kind: "gameOver" }];
  }

  private onLockInterrupt(): void {
    if (this.lockTimer > 0 && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  /** Gravity + lock delay. Call every fixed step. */
  update(dt: number): BlockfallEvent[] {
    if (!this.active || !this.alive) return [];
    const events: BlockfallEvent[] = [];

    const grounded = !this.fits({ ...this.active, y: this.active.y + 1 });
    if (grounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) {
        events.push(...this.lockActive());
      }
      return events;
    }
    this.lockTimer = 0;

    this.dropTimer += dt;
    const gravity = Math.max(MIN_GRAVITY, GRAVITY_START * Math.pow(GRAVITY_FACTOR, this.level - 1));
    while (this.dropTimer >= gravity && this.active) {
      this.dropTimer -= gravity;
      const next: ActivePiece = { ...this.active, y: this.active.y + 1 };
      if (this.fits(next)) {
        this.active = next;
      } else {
        break;
      }
    }
    return events;
  }

  private lockActive(): BlockfallEvent[] {
    if (!this.active) return [];
    const id = PIECE_IDS[this.active.kind];
    const cells = this.cellsOf(this.active);
    const toppedOut = cells.some((cell) => cell.y < 0);
    for (const cell of cells) {
      if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
        this.board[cell.y]![cell.x] = id;
      }
    }
    this.active = null;
    if (toppedOut) { this.alive = false; return [{ kind: "lock" }, { kind: "gameOver" }]; }

    // Clear full lines
    const cleared: number[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r]!.every((v) => v !== 0)) cleared.push(r);
    }
    if (cleared.length) {
      this.board = this.board.filter((row) => row.some((v) => v === 0));
      while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(0));
    }
    const n = cleared.length;
    if (n > 0) {
      this.lines += n;
      const gained = (LINE_SCORES[n] ?? 0) * this.level;
      this.score += gained;
      const newLevel = Math.floor(this.lines / 10) + 1;
      const leveled = newLevel !== this.level;
      this.level = newLevel;
      this.spawnNext();
      const events: BlockfallEvent[] = [
        { kind: "lineClear", lines: n, score: gained },
      ];
      if (leveled) events.push({ kind: "levelUp" });
      events.push({ kind: "lock" });
      if (!this.alive) events.push({ kind: "gameOver" });
      return events;
    }

    this.spawnNext();
    const events: BlockfallEvent[] = [{ kind: "lock" }];
    if (!this.alive) events.push({ kind: "gameOver" });
    return events;
  }
}
