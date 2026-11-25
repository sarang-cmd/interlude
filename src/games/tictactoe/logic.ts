import { THREE_LINES, type Cell, type ThreePosition } from "../../ai/three-in-row";

export type Mark = Exclude<Cell, 0>;
export type ThreeOutcome = "playing" | "draw" | "x" | "o";

/** A single match. X goes first. Invalid moves never change the turn. */
export class TicTacToeLogic {
  private cells: Cell[] = Array<Cell>(9).fill(0);
  private current: Mark = 1;
  private outcomeValue: ThreeOutcome = "playing";
  private winning: readonly number[] | null = null;

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
      index >= 9 ||
      this.cells[index] !== 0
    )
      return false;
    this.cells[index] = this.current;
    for (const line of THREE_LINES) {
      const [a, b, c] = line;
      if (
        this.cells[a] === this.current &&
        this.cells[b] === this.current &&
        this.cells[c] === this.current
      ) {
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
  const wins = (candidate: number, mark: Mark): boolean =>
    THREE_LINES.some(
      (line) =>
        line.some((index) => index === candidate) &&
        line.every((index) => index === candidate || position.cells[index] === mark),
    );
  return (
    legal.find((move) => wins(move, position.turn)) ??
    legal.find((move) => wins(move, position.turn === 1 ? -1 : 1)) ??
    (legal.includes(4) ? 4 : undefined) ??
    legal.find((move) => [0, 2, 6, 8].includes(move)) ??
    legal[0]!
  );
}
