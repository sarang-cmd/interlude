import type { SwipeDirection } from "../../engine/input";
import type { RNG } from "../../shared/rng";

export const SLIDE_SIDE = 4;
export const SLIDE_SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0] as const;
export function slideNeighbor(blank: number, direction: SwipeDirection): number | null {
  const row = Math.floor(blank / 4),
    col = blank % 4;
  const r = row + (direction === "up" ? -1 : direction === "down" ? 1 : 0);
  const c = col + (direction === "left" ? -1 : direction === "right" ? 1 : 0);
  return r < 0 || r >= 4 || c < 0 || c >= 4 ? null : r * 4 + c;
}
export function slideSwap(board: readonly number[], index: number): number[] | null {
  if (board.length !== 16 || !Number.isInteger(index) || index < 0 || index >= 16) return null;
  const blank = board.indexOf(0);
  if (
    blank < 0 ||
    Math.abs(Math.floor(blank / 4) - Math.floor(index / 4)) +
      Math.abs((blank % 4) - (index % 4)) !==
      1
  )
    return null;
  const next = [...board];
  next[blank] = next[index]!;
  next[index] = 0;
  return next;
}
export function slideSolved(board: readonly number[]): boolean {
  return board.length === 16 && board.every((item, index) => item === SLIDE_SOLVED[index]);
}
export function slideDistance(board: readonly number[]): number {
  return board.reduce((sum, value, index) => {
    if (!value) return sum;
    const goal = value - 1;
    return (
      sum +
      Math.abs(Math.floor(index / 4) - Math.floor(goal / 4)) +
      Math.abs((index % 4) - (goal % 4))
    );
  }, 0);
}
/** A sequence of legal swaps guarantees the shuffle remains solvable. */
export function createSlide(rng: RNG): number[] {
  let board: number[] = [...SLIDE_SOLVED],
    previous = -1;
  for (let i = 0; i < 80; i++) {
    const blank = board.indexOf(0);
    const neighbors = (["left", "right", "up", "down"] as const)
      .map((direction) => slideNeighbor(blank, direction))
      .filter((item): item is number => item !== null && item !== previous);
    const choice = rng.pick(neighbors);
    previous = blank;
    board = slideSwap(board, choice)!;
  }
  if (slideSolved(board)) board = slideSwap(board, 14)!;
  return board;
}
