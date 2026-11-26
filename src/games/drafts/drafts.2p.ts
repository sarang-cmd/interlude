/** Website-only shared-device draughts match. */
import type { DraftSide } from "../../ai/drafts";
import { DraftsGame } from "./game";
export class LocalDraftsGame extends DraftsGame {
  override get recordsAllowed(): boolean {
    return false;
  }
  protected override isCpuTurn(_side: DraftSide): boolean {
    return false;
  }
  protected override sideName(side: DraftSide): string {
    return side === 1 ? "PLAYER 1 / X" : "PLAYER 2 / O";
  }
}
