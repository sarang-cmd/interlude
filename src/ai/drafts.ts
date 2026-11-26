import { minimax, type SearchResult, type SearchRules } from "./search";

/** English-style draughts: men move forward, captures are compulsory, kings move both ways. */
export type DraftSide = -1 | 1;
export type DraftPiece = -2 | -1 | 0 | 1 | 2;
export interface DraftPosition {
  cells: readonly DraftPiece[];
  turn: DraftSide;
  /** A jumping piece must continue its capture, or -1 when there is no restriction. */
  forced: number;
  quiet: number;
}
export interface DraftSearchTask {
  kind: "drafts";
  position: DraftPosition;
  depth: number;
  maxNodes: number;
}
export function initialDrafts(): DraftPosition {
  const cells = Array<DraftPiece>(64).fill(0);
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 0) continue;
      if (row < 3) cells[row * 8 + col] = -1;
      else if (row > 4) cells[row * 8 + col] = 1;
    }
  return { cells, turn: 1, forced: -1, quiet: 0 };
}
export const encodeDraftMove = (from: number, to: number): number => from * 64 + to;
export const decodeDraftMove = (move: number): [number, number] => [
  Math.floor(move / 64),
  move % 64,
];
function sideOf(piece: DraftPiece): number {
  return Math.sign(piece);
}
function capturesFrom(position: DraftPosition, from: number): number[] {
  const piece = position.cells[from];
  if (!piece || sideOf(piece) !== position.turn) return [];
  const row = Math.floor(from / 8),
    col = from % 8;
  const directions = Math.abs(piece) === 2 ? [-1, 1] : [position.turn === 1 ? -1 : 1];
  const moves: number[] = [];
  for (const dr of directions)
    for (const dc of [-1, 1]) {
      const r = row + 2 * dr,
        c = col + 2 * dc;
      if (r < 0 || r >= 8 || c < 0 || c >= 8) continue;
      const middle = position.cells[(row + dr) * 8 + col + dc],
        to = r * 8 + c;
      if (middle && sideOf(middle) === -position.turn && position.cells[to] === 0)
        moves.push(encodeDraftMove(from, to));
    }
  return moves;
}
function rawMoves(position: DraftPosition): number[] {
  if (position.forced >= 0) return capturesFrom(position, position.forced);
  const captures: number[] = [];
  for (let from = 0; from < 64; from++) captures.push(...capturesFrom(position, from));
  if (captures.length) return captures;
  const moves: number[] = [];
  for (let from = 0; from < 64; from++) {
    const piece = position.cells[from];
    if (!piece || sideOf(piece) !== position.turn) continue;
    const row = Math.floor(from / 8),
      col = from % 8;
    const directions = Math.abs(piece) === 2 ? [-1, 1] : [position.turn === 1 ? -1 : 1];
    for (const dr of directions)
      for (const dc of [-1, 1]) {
        const r = row + dr,
          c = col + dc;
        if (r >= 0 && r < 8 && c >= 0 && c < 8 && position.cells[r * 8 + c] === 0)
          moves.push(encodeDraftMove(from, r * 8 + c));
      }
  }
  return moves;
}
export function draftsOutcome(position: DraftPosition): DraftSide | 0 | null {
  if (!rawMoves(position).length) return position.turn === 1 ? -1 : 1;
  return position.quiet >= 80 ? 0 : null;
}
export function draftMoves(position: DraftPosition): number[] {
  return position.quiet >= 80 ? [] : rawMoves(position);
}
export function applyDraftMove(position: DraftPosition, move: number): DraftPosition {
  if (!Number.isInteger(move) || !draftMoves(position).includes(move))
    throw new Error("Illegal draught move");
  const [from, to] = decodeDraftMove(move),
    cells = [...position.cells];
  let piece = cells[from]!;
  cells[from] = 0;
  const fromRow = Math.floor(from / 8),
    toRow = Math.floor(to / 8);
  const capture = Math.abs(toRow - fromRow) === 2;
  if (capture) cells[((fromRow + toRow) / 2) * 8 + ((from % 8) + (to % 8)) / 2] = 0;
  const crowned = Math.abs(piece) === 1 && (position.turn === 1 ? toRow === 0 : toRow === 7);
  if (crowned) piece = (2 * position.turn) as DraftPiece;
  cells[to] = piece;
  const next: DraftPosition = {
    cells,
    turn: position.turn,
    forced: -1,
    quiet: capture ? 0 : position.quiet + 1,
  };
  // Under English draughts rules crowning ends the move, even if a king jump exists.
  if (capture && !crowned && capturesFrom(next, to).length) return { ...next, forced: to };
  return { ...next, turn: position.turn === 1 ? -1 : 1 };
}
export function draftsRules(root: DraftSide): SearchRules<DraftPosition, number> {
  return {
    moves: draftMoves,
    apply: applyDraftMove,
    maximizing: (position) => position.turn === root,
    terminal: (position) => {
      const winner = draftsOutcome(position);
      return winner === null ? null : winner === 0 ? 0 : winner === root ? 1 : -1;
    },
    evaluate: (position) => {
      let value = 0;
      for (let index = 0; index < 64; index++) {
        const piece = position.cells[index]!;
        if (!piece) continue;
        const progress =
          piece === 1 ? 7 - Math.floor(index / 8) : piece === -1 ? Math.floor(index / 8) : 0;
        const weight = Math.abs(piece) === 2 ? 3 : 2 + progress / 30;
        value += Math.sign(piece) === root ? weight : -weight;
      }
      return value / 45;
    },
  };
}
export function isDraftSearchTask(value: unknown): value is DraftSearchTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<DraftSearchTask>,
    p = task.position;
  if (
    task.kind !== "drafts" ||
    !p ||
    !Array.isArray(p.cells) ||
    p.cells.length !== 64 ||
    (p.turn !== 1 && p.turn !== -1)
  )
    return false;
  if (
    !Array.from(p.cells).every(
      (cell, index) =>
        [-2, -1, 0, 1, 2].includes(cell) &&
        (!cell || (Math.floor(index / 8) + (index % 8)) % 2 === 1),
    )
  )
    return false;
  if (
    p.cells.filter((cell) => cell > 0).length > 12 ||
    p.cells.filter((cell) => cell < 0).length > 12
  )
    return false;
  if (
    !Number.isSafeInteger(p.forced) ||
    p.forced < -1 ||
    p.forced >= 64 ||
    !Number.isSafeInteger(p.quiet) ||
    p.quiet < 0 ||
    p.quiet > 80
  )
    return false;
  if (
    !Number.isSafeInteger(task.depth) ||
    task.depth! < 1 ||
    task.depth! > 6 ||
    !Number.isSafeInteger(task.maxNodes) ||
    task.maxNodes! < 1 ||
    task.maxNodes! > 40_000
  )
    return false;
  return p.forced === -1 || capturesFrom(p, p.forced).length > 0;
}
export function solveDrafts(task: DraftSearchTask): SearchResult<number> {
  if (!isDraftSearchTask(task)) throw new Error("Invalid search task");
  return minimax(task.position, draftsRules(task.position.turn), {
    depth: task.depth,
    maxNodes: task.maxNodes,
  });
}
