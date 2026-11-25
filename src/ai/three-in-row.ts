import { RNG } from "../shared/rng";
import { minimax, monteCarlo, type SearchResult, type SearchRules } from "./search";

export type Cell = -1 | 0 | 1;
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
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function threeRules(root: -1 | 1): SearchRules<ThreePosition, number> {
  return {
    moves: ({ cells }) => cells.flatMap((cell, index) => (cell === 0 ? [index] : [])),
    apply: (position, index) => {
      const cells = [...position.cells];
      if (cells[index] !== 0) throw new Error("Illegal move");
      cells[index] = position.turn;
      return { cells, turn: position.turn === 1 ? -1 : 1 };
    },
    terminal: ({ cells }) => {
      for (const [a, b, c] of LINES) {
        if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c])
          return cells[a] === root ? 1 : -1;
      }
      return cells.includes(0) ? null : 0;
    },
    evaluate: ({ cells }) => {
      let score = 0;
      for (const line of LINES) {
        const own = line.filter((index) => cells[index] === root).length;
        const other = line.filter((index) => cells[index] === -root).length;
        if (!other) score += own;
        if (!own) score -= other;
      }
      return score / 100;
    },
  };
}

export function solveThree(task: ThreeSearchTask): SearchResult<number> {
  const { position } = task;
  if (
    task.kind !== "three-in-row" ||
    !position ||
    !Array.isArray(position.cells) ||
    position.cells.length !== 9 ||
    !position.cells.every((cell) => cell === -1 || cell === 0 || cell === 1) ||
    (position.turn !== 1 && position.turn !== -1) ||
    (task.method !== "minimax" && task.method !== "monte-carlo")
  )
    throw new Error("Invalid search task");
  const rules = threeRules(position.turn);
  if (task.method === "minimax")
    return minimax(position, rules, { depth: task.depth, maxNodes: task.maxNodes });
  return monteCarlo(position, rules, new RNG(task.seed), {
    simulations: task.simulations,
    maxPlayout: 9,
  });
}
