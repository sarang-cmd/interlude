import type { SwipeDirection } from "../engine/input";

/** Shared coordinate helpers. Moves are clamped rather than wrapping at edges. */
export function moveGridCursor(
  index: number,
  direction: SwipeDirection,
  columns: number,
  rows: number,
): number {
  const row = Math.floor(index / columns),
    col = index % columns;
  const r = Math.max(
    0,
    Math.min(rows - 1, row + (direction === "up" ? -1 : direction === "down" ? 1 : 0)),
  );
  const c = Math.max(
    0,
    Math.min(columns - 1, col + (direction === "left" ? -1 : direction === "right" ? 1 : 0)),
  );
  return r * columns + c;
}
export function gridCellAt(
  x: number,
  y: number,
  left: number,
  top: number,
  size: number,
  columns: number,
  rows: number,
): number | null {
  if (x < left || x >= left + columns * size || y < top || y >= top + rows * size) return null;
  return Math.floor((y - top) / size) * columns + Math.floor((x - left) / size);
}
export function gridCellName(index: number, columns: number): string {
  return `row ${Math.floor(index / columns) + 1}, column ${(index % columns) + 1}`;
}
