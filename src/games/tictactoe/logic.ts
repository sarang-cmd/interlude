import {
  noughtsLines,
  noughtsSize,
  type Cell,
  type NoughtsSize,
  type ThreePosition,
} from "../../ai/three-in-row";

export type Mark = Exclude<Cell, 0>;
export type ThreeOutcome = "playing" | "draw" | "x" | "o";

/** One match. X goes first; the two larger boards require four in a row. */
export class TicTacToeLogic {
  private cells: Cell[];
  private current: Mark = 1;
  private outcomeValue: ThreeOutcome = "playing";
  private winning: readonly number[] | null = null;

  constructor(readonly size: NoughtsSize = 3) {
    if (![3, 4, 5].includes(size)) throw new Error("Invalid board size");
    this.cells = Array<Cell>(size * size).fill(0);
  }
  get position(): ThreePosition {
    return { cells: [...this.cells], turn: this.current };
  }
  get outcome(): ThreeOutcome {
    return this.outcomeValue;
  }
  get winningLine(): readonly number[] | null {
    return this.winning ? [...this.winning] : null;
  }
  get legalMoves(): number[] {
    if (this.outcomeValue !== "playing") return [];
    return this.cells.flatMap((cell, index) => (cell === 0 ? [index] : []));
  }

  move(index: number): boolean {
    if (
      this.outcomeValue !== "playing" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.cells.length ||
      this.cells[index] !== 0
    )
      return false;
    this.cells[index] = this.current;
    for (const line of noughtsLines(this.size)) {
      if (line.every((cell) => this.cells[cell] === this.current)) {
        this.winning = line;
        this.outcomeValue = this.current === 1 ? "x" : "o";
        return true;
      }
    }
    if (!this.cells.includes(0)) this.outcomeValue = "draw";
    else this.current = this.current === 1 ? -1 : 1;
    return true;
  }
}

/** Bounded, synchronous safety move used only if an isolated worker fails. */
export function tacticalFallback(position: ThreePosition): number | null {
  const legal = position.cells.flatMap((cell, index) => (cell === 0 ? [index] : []));
  if (!legal.length) return null;
  const size = noughtsSize(position.cells);
  const wins = (candidate: number, mark: Mark): boolean =>
    noughtsLines(size).some(
      (line) =>
        line.some((index) => index === candidate) &&
        line.every((index) => index === candidate || position.cells[index] === mark),
    );
  const middle = (size - 1) / 2;
  const nearest = [...legal].sort((a, b) => {
    const distance = (index: number): number =>
      Math.abs(Math.floor(index / size) - middle) + Math.abs((index % size) - middle);
    return distance(a) - distance(b) || a - b;
  });
  return (
    legal.find((move) => wins(move, position.turn)) ??
    legal.find((move) => wins(move, position.turn === 1 ? -1 : 1)) ??
    (size === 3 && legal.includes(4) ? 4 : undefined) ??
    (size === 3 ? legal.find((move) => [0, 2, 6, 8].includes(move)) : undefined) ??
    nearest[0]!
  );
}
