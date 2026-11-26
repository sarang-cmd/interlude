import { minimax, type SearchResult, type SearchRules } from "./search";
import type { Cell } from "./three-in-row";

/** Pure, immutable rules shared by the local worker and the canvas cabinets. */
export type GridKind = "drop-four" | "flip-disc";
export type GridSide = -1 | 1;
export interface GridPosition {
  cells: readonly Cell[];
  turn: GridSide;
}
export interface GridSearchTask {
  kind: GridKind;
  position: GridPosition;
  depth: number;
  maxNodes: number;
}
export type GridOutcome = GridSide | 0 | null;

export function initialGrid(kind: GridKind): GridPosition {
  if (kind === "drop-four") return { cells: Array<Cell>(42).fill(0), turn: 1 };
  const cells = Array<Cell>(64).fill(0);
  cells[27] = cells[36] = -1;
  cells[28] = cells[35] = 1;
  return { cells, turn: 1 };
}

const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;

/** Indices flipped by a legal move, in all eight directions. */
export function flipped(cells: readonly Cell[], index: number, side: GridSide): number[] {
  if (!Number.isInteger(index) || index < 0 || index >= 64 || cells[index] !== 0) return [];
  const row = Math.floor(index / 8),
    col = index % 8;
  const all: number[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    let r = row + dr,
      c = col + dc;
    const captured: number[] = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && cells[r * 8 + c] === -side) {
      captured.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (captured.length && r >= 0 && r < 8 && c >= 0 && c < 8 && cells[r * 8 + c] === side)
      all.push(...captured);
  }
  return all;
}

function flipMoves(cells: readonly Cell[], side: GridSide): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 64; i++) if (flipped(cells, i, side).length) moves.push(i);
  // Corners are particularly valuable. Keep a deterministic tie-breaker.
  return moves.sort((a, b) => {
    const corner = (i: number): number => ([0, 7, 56, 63].includes(i) ? 1 : 0);
    return corner(b) - corner(a) || a - b;
  });
}

function dropOutcome(cells: readonly Cell[]): GridOutcome {
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const mark = cells[row * 7 + col]!;
      if (!mark) continue;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ] as const) {
        const er = row + 3 * dr,
          ec = col + 3 * dc;
        if (er < 0 || er >= 6 || ec < 0 || ec >= 7) continue;
        if ([1, 2, 3].every((step) => cells[(row + step * dr) * 7 + col + step * dc] === mark))
          return mark;
      }
    }
  }
  return cells.includes(0) ? null : 0;
}

export function gridOutcome(kind: GridKind, position: GridPosition): GridOutcome {
  if (kind === "drop-four") return dropOutcome(position.cells);
  if (flipMoves(position.cells, 1).length || flipMoves(position.cells, -1).length) return null;
  const difference = position.cells.reduce<number>((total, cell) => total + cell, 0);
  return difference > 0 ? 1 : difference < 0 ? -1 : 0;
}

/** A -1 move means the current side must pass in FLIP DISC. */
export function gridMoves(kind: GridKind, position: GridPosition): number[] {
  if (kind === "drop-four") {
    if (dropOutcome(position.cells) !== null) return [];
    return [3, 2, 4, 1, 5, 0, 6].filter((col) => position.cells[col] === 0);
  }
  const moves = flipMoves(position.cells, position.turn);
  if (moves.length) return moves;
  return flipMoves(position.cells, position.turn === 1 ? -1 : 1).length ? [-1] : [];
}

export function applyGrid(kind: GridKind, position: GridPosition, move: number): GridPosition {
  if (!gridMoves(kind, position).includes(move)) throw new Error("Illegal grid move");
  const cells = [...position.cells];
  if (kind === "drop-four") {
    for (let row = 5; row >= 0; row--) {
      if (cells[row * 7 + move] === 0) {
        cells[row * 7 + move] = position.turn;
        break;
      }
    }
  } else if (move !== -1) {
    for (const index of flipped(cells, move, position.turn)) cells[index] = position.turn;
    cells[move] = position.turn;
  }
  return { cells, turn: position.turn === 1 ? -1 : 1 };
}

export function gridRules(kind: GridKind, root: GridSide): SearchRules<GridPosition, number> {
  return {
    moves: (position) => gridMoves(kind, position),
    apply: (position, move) => applyGrid(kind, position, move),
    terminal: (position) => {
      const outcome = gridOutcome(kind, position);
      return outcome === null ? null : outcome === 0 ? 0 : outcome === root ? 1 : -1;
    },
    evaluate: (position) => {
      if (kind === "flip-disc") {
        const own = position.cells.filter((cell) => cell === root).length;
        const other = position.cells.filter((cell) => cell === -root).length;
        const cornerValue = [0, 7, 56, 63].reduce(
          (sum, index) =>
            sum + (position.cells[index] === root ? 8 : position.cells[index] === -root ? -8 : 0),
          0,
        );
        return (own - other + cornerValue) / 200;
      }
      let value = 0;
      for (let row = 0; row < 6; row++)
        for (let col = 0; col < 7; col++) {
          for (const [dr, dc] of [
            [0, 1],
            [1, 0],
            [1, 1],
            [1, -1],
          ] as const) {
            const er = row + 3 * dr,
              ec = col + 3 * dc;
            if (er < 0 || er >= 6 || ec < 0 || ec >= 7) continue;
            let own = 0,
              other = 0;
            for (let step = 0; step < 4; step++) {
              const mark = position.cells[(row + step * dr) * 7 + col + step * dc];
              if (mark === root) own++;
              else if (mark === -root) other++;
            }
            const weights = [0, 1, 5, 20, 80];
            if (!other) value += weights[own]!;
            if (!own) value -= weights[other]!;
          }
        }
      return value / 6000;
    },
  };
}

export function isGridSearchTask(value: unknown): value is GridSearchTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<GridSearchTask>;
  const position = task.position;
  const bounded = (x: unknown, min: number, max: number): boolean =>
    typeof x === "number" && Number.isSafeInteger(x) && x >= min && x <= max;
  if (task.kind !== "drop-four" && task.kind !== "flip-disc") return false;
  if (
    !position ||
    !Array.isArray(position.cells) ||
    position.cells.length !== (task.kind === "drop-four" ? 42 : 64)
  )
    return false;
  return (
    Array.from(position.cells).every((cell) => cell === -1 || cell === 0 || cell === 1) &&
    (position.turn === 1 || position.turn === -1) &&
    bounded(task.depth, 1, 6) &&
    bounded(task.maxNodes, 1, 40_000)
  );
}

export function solveGrid(task: GridSearchTask): SearchResult<number> {
  if (!isGridSearchTask(task)) throw new Error("Invalid search task");
  return minimax(task.position, gridRules(task.kind, task.position.turn), {
    depth: task.depth,
    maxNodes: task.maxNodes,
  });
}

/** Tiny, bounded safety policy if the isolated worker cannot answer. */
export function gridFallback(kind: GridKind, position: GridPosition): number | null {
  const moves = gridMoves(kind, position);
  if (!moves.length) return null;
  if (moves[0] === -1) return -1;
  if (kind === "drop-four") {
    const win = moves.find(
      (move) => gridOutcome(kind, applyGrid(kind, position, move)) === position.turn,
    );
    if (win !== undefined) return win;
    const opponent: GridPosition = { cells: position.cells, turn: position.turn === 1 ? -1 : 1 };
    const block = moves.find(
      (move) => gridOutcome(kind, applyGrid(kind, opponent, move)) === opponent.turn,
    );
    return block ?? moves[0]!;
  }
  return [...moves].sort((a, b) => {
    const corner = (i: number): number => ([0, 7, 56, 63].includes(i) ? 100 : 0);
    return (
      corner(b) +
      flipped(position.cells, b, position.turn).length -
      corner(a) -
      flipped(position.cells, a, position.turn).length
    );
  })[0]!;
}
