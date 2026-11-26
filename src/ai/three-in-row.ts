import { RNG } from "../shared/rng";
import { minimax, monteCarlo, type SearchResult, type SearchRules } from "./search";

export type Cell = -1 | 0 | 1;
export type NoughtsSize = 3 | 4 | 5;
export interface ThreePosition {
  cells: readonly Cell[];
  turn: -1 | 1;
}
export interface ThreeSearchTask {
  kind: "three-in-row";
  position: ThreePosition;
  method: "minimax" | "monte-carlo";
  depth: number;
  maxNodes: number;
  simulations: number;
  seed: number;
}
export const THREE_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function noughtsSize(cells: readonly Cell[]): NoughtsSize {
  if (cells.length === 9) return 3;
  if (cells.length === 16) return 4;
  if (cells.length === 25) return 5;
  throw new Error("Invalid board size");
}

function makeLines(size: NoughtsSize): readonly (readonly number[])[] {
  if (size === 3) return THREE_LINES;
  const lines: number[][] = [];
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const) {
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const endRow = row + dr * 3;
        const endColumn = column + dc * 3;
        if (endRow < 0 || endRow >= size || endColumn < 0 || endColumn >= size) continue;
        lines.push(
          Array.from({ length: 4 }, (_, step) => (row + dr * step) * size + column + dc * step),
        );
      }
    }
  }
  return lines;
}
const LINES: Readonly<Record<NoughtsSize, readonly (readonly number[])[]>> = {
  3: THREE_LINES,
  4: makeLines(4),
  5: makeLines(5),
};

/** Three in a row on 3×3; four in a row on 4×4 and 5×5. */
export function noughtsLines(size: NoughtsSize): readonly (readonly number[])[] {
  return LINES[size];
}

export function threeRules(root: -1 | 1): SearchRules<ThreePosition, number> {
  return {
    moves: ({ cells }) => {
      const moves = cells.flatMap((cell, index) => (cell === 0 ? [index] : []));
      const size = noughtsSize(cells);
      if (size === 3) return moves; // Preserve the established 3×3 tie-breaking.
      const middle = (size - 1) / 2;
      return moves.sort((a, b) => {
        const distance = (i: number): number =>
          Math.abs(Math.floor(i / size) - middle) + Math.abs((i % size) - middle);
        return distance(a) - distance(b) || a - b;
      });
    },
    apply: (position, index) => {
      const cells = [...position.cells];
      if (!Number.isInteger(index) || index < 0 || index >= cells.length || cells[index] !== 0)
        throw new Error("Illegal move");
      cells[index] = position.turn;
      return { cells, turn: position.turn === 1 ? -1 : 1 };
    },
    terminal: ({ cells }) => {
      for (const line of noughtsLines(noughtsSize(cells))) {
        const first = cells[line[0]!]!;
        if (first && line.every((index) => cells[index] === first)) return first === root ? 1 : -1;
      }
      return cells.includes(0) ? null : 0;
    },
    evaluate: ({ cells }) => {
      const size = noughtsSize(cells);
      let score = 0;
      const lines = noughtsLines(size);
      for (const line of lines) {
        const own = line.filter((index) => cells[index] === root).length;
        const other = line.filter((index) => cells[index] === -root).length;
        if (size === 3) {
          if (!other) score += own;
          if (!own) score -= other;
        } else {
          const weight = [0, 1, 5, 32, 128];
          if (!other) score += weight[own]!;
          if (!own) score -= weight[other]!;
        }
      }
      // Heuristics stay strictly below terminal wins/losses.
      return size === 3 ? score / 100 : (score / (lines.length * 128 + 1)) * 0.9;
    },
  };
}

/** Strict limits apply even when a page embeds the extension-owned worker frame. */
export function isThreeSearchTask(value: unknown): value is ThreeSearchTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<ThreeSearchTask>;
  const position = task.position;
  const bounded = (input: unknown, min: number, max: number): boolean =>
    typeof input === "number" && Number.isSafeInteger(input) && input >= min && input <= max;
  return (
    task.kind === "three-in-row" &&
    !!position &&
    Array.isArray(position.cells) &&
    [9, 16, 25].includes(position.cells.length) &&
    Array.from(position.cells).every((cell) => cell === -1 || cell === 0 || cell === 1) &&
    (position.turn === 1 || position.turn === -1) &&
    (task.method === "minimax" || task.method === "monte-carlo") &&
    bounded(task.depth, 1, 9) &&
    bounded(task.maxNodes, 1, 100_000) &&
    bounded(task.simulations, 1, 640) &&
    bounded(task.seed, 0, 0xffffffff)
  );
}

export function solveThree(task: ThreeSearchTask): SearchResult<number> {
  if (!isThreeSearchTask(task)) throw new Error("Invalid search task");
  const { position } = task;
  const rules = threeRules(position.turn);
  if (task.method === "minimax")
    return minimax(position, rules, { depth: task.depth, maxNodes: task.maxNodes });
  return monteCarlo(position, rules, new RNG(task.seed), {
    simulations: task.simulations,
    maxPlayout: position.cells.length,
  });
}
