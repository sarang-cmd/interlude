/** Website-only shared-control match. The extension never loads this module. */
import type { GridKind, GridSide } from "../../ai/grid-games";
import { GridDuelGame } from "./game";
export class LocalGridGame extends GridDuelGame {
  constructor(kind: GridKind) {
    super(kind);
  }
  override get recordsAllowed(): boolean {
    return false;
  }
  protected override isCpuTurn(_side: GridSide): boolean {
    return false;
  }
  protected override sideName(side: GridSide): string {
    return side === 1 ? "PLAYER 1 / X" : "PLAYER 2 / O";
  }
}
