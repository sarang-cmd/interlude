import { TicTacToeGame } from "./game";
import type { Mark } from "./logic";

/** Website-only hot-seat match. Both players share the same control set. */
export class TicTacToeLocalGame extends TicTacToeGame {
  constructor() {
    super(false);
  }
  override get recordsAllowed(): boolean {
    return false;
  }
  protected override isCpuTurn(_side: Mark): boolean {
    return false;
  }
  protected override sideName(side: Mark): string {
    return side === 1 ? "PLAYER 1 / X" : "PLAYER 2 / O";
  }
}
