import { minimax, type SearchResult, type SearchRules } from "./search";
import type { Cell } from "./three-in-row";

export type BoxSide = -1 | 1;
/** Four by four boxes, with twenty horizontal then twenty vertical edges. */
export interface BoxesPosition {
  edges: readonly Cell[];
  boxes: readonly Cell[];
  turn: BoxSide;
}
export interface BoxesSearchTask {
  kind: "dots-and-boxes";
  position: BoxesPosition;
  depth: number;
  maxNodes: number;
}
export const initialBoxes = (): BoxesPosition => ({
  edges: Array<Cell>(40).fill(0),
  boxes: Array<Cell>(16).fill(0),
  turn: 1,
});
export const boxEdges = (box: number): readonly number[] => {
  const row = Math.floor(box / 4),
    column = box % 4;
  return [
    row * 4 + column,
    (row + 1) * 4 + column,
    20 + row * 5 + column,
    20 + row * 5 + column + 1,
  ];
};
export function boxesOutcome(position: BoxesPosition): -1 | 0 | 1 | null {
  if (position.edges.includes(0)) return null;
  const total = position.boxes.reduce<number>((sum, value) => sum + value, 0);
  return total > 0 ? 1 : total < 0 ? -1 : 0;
}
export function applyBoxEdge(position: BoxesPosition, edge: number): BoxesPosition {
  if (!Number.isInteger(edge) || edge < 0 || edge >= 40 || position.edges[edge] !== 0)
    throw new Error("Illegal edge");
  const edges = [...position.edges],
    boxes = [...position.boxes];
  edges[edge] = position.turn;
  let completed = 0;
  for (let box = 0; box < 16; box++) {
    if (boxes[box] === 0 && boxEdges(box).every((index) => edges[index] !== 0)) {
      boxes[box] = position.turn;
      completed++;
    }
  }
  return { edges, boxes, turn: completed ? position.turn : position.turn === 1 ? -1 : 1 };
}
function rankEdge(position: BoxesPosition, edge: number): number {
  let completed = 0,
    exposed = 0;
  for (let box = 0; box < 16; box++) {
    const surrounding = boxEdges(box);
    if (!surrounding.includes(edge) || position.boxes[box]) continue;
    const filled = surrounding.filter((index) => position.edges[index] !== 0).length;
    if (filled === 3) completed++;
    else if (filled === 2) exposed++;
  }
  return completed * 100 - exposed * 10;
}
export function boxMoves(position: BoxesPosition): number[] {
  const moves = position.edges.flatMap((value, index) => (value === 0 ? [index] : []));
  return moves.sort((a, b) => rankEdge(position, b) - rankEdge(position, a) || a - b);
}
export function boxesRules(root: BoxSide): SearchRules<BoxesPosition, number> {
  return {
    moves: boxMoves,
    apply: applyBoxEdge,
    maximizing: (position) => position.turn === root,
    terminal: (position) => {
      const winner = boxesOutcome(position);
      return winner === null ? null : winner === 0 ? 0 : winner === root ? 1 : -1;
    },
    evaluate: (position) => {
      const score = position.boxes.reduce<number>((sum, value) => sum + value * root, 0);
      const freeThrees = position.boxes.reduce<number>(
        (sum, value, box) =>
          sum +
          (!value && boxEdges(box).filter((edge) => position.edges[edge] !== 0).length === 3
            ? 1
            : 0),
        0,
      );
      return score / 18 + freeThrees * (position.turn === root ? 0.003 : -0.003);
    },
  };
}
export function isBoxesSearchTask(value: unknown): value is BoxesSearchTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<BoxesSearchTask>,
    p = task.position;
  if (
    task.kind !== "dots-and-boxes" ||
    !p ||
    !Array.isArray(p.edges) ||
    p.edges.length !== 40 ||
    !Array.isArray(p.boxes) ||
    p.boxes.length !== 16
  )
    return false;
  const cells = (values: readonly Cell[]): boolean =>
    Array.from(values).every((cell) => cell === -1 || cell === 0 || cell === 1);
  if (!cells(p.edges) || !cells(p.boxes) || (p.turn !== 1 && p.turn !== -1)) return false;
  if (
    !Number.isSafeInteger(task.depth) ||
    task.depth! < 1 ||
    task.depth! > 4 ||
    !Number.isSafeInteger(task.maxNodes) ||
    task.maxNodes! < 1 ||
    task.maxNodes! > 40_000
  )
    return false;
  return p.boxes.every(
    (owner, box) => !!owner === boxEdges(box).every((edge) => p.edges[edge] !== 0),
  );
}
export function solveBoxes(task: BoxesSearchTask): SearchResult<number> {
  if (!isBoxesSearchTask(task)) throw new Error("Invalid search task");
  return minimax(task.position, boxesRules(task.position.turn), {
    depth: task.depth,
    maxNodes: task.maxNodes,
  });
}
