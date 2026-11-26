/** Website-only shared-device match. */
import type { BoxSide } from "../../ai/dots-and-boxes";
import { DotsBoxesGame } from "./game";
export class DotsBoxesLocalGame extends DotsBoxesGame {
  override get recordsAllowed(): boolean {
    return false;
  }
  protected override isCpuTurn(_side: BoxSide): boolean {
    return false;
  }
  protected override sideName(side: BoxSide): string {
    return side === 1 ? "PLAYER 1 / X" : "PLAYER 2 / O";
  }
}
