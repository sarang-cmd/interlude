/** Website-only shared memory board. Matching earns a point and another turn. */
import { pairsStatus } from "./display";
import { PairsGame } from "./game";
import type { FlipResult } from "./logic";
import type { GameContext } from "../types";

export class PairsLocalGame extends PairsGame {
  private player: 0 | 1 = 0;
  private points: [number, number] = [0, 0];
  override get recordsAllowed(): boolean {
    return false;
  }
  override get resultLabel(): string | undefined {
    if (!this.ended) return undefined;
    return this.points[0] === this.points[1]
      ? "DRAW"
      : `PLAYER ${this.points[0] > this.points[1] ? 1 : 2} WINS`;
  }
  override init(ctx: GameContext): void {
    this.player = 0;
    this.points = [0, 0];
    super.init(ctx);
  }
  protected override pairResolved(result: Extract<FlipResult, "match" | "miss">): void {
    if (result === "match") this.points[this.player]++;
    else this.player = this.player === 0 ? 1 : 0;
  }
  protected override header(): string {
    return `P1 ${this.points[0]} / P2 ${this.points[1]} · PLAYER ${this.player + 1} TURN`;
  }
  protected override announce(message = ""): void {
    this.g.announce?.(
      `PAIRS. ${message} PLAYER 1 ${this.points[0]}, PLAYER 2 ${this.points[1]}. ${this.ended ? this.resultLabel : `PLAYER ${this.player + 1} turn`}. ${pairsStatus(this.board, this.cursor)}`,
    );
  }
}
