import { TOKENS } from "../../../design/tokens";
import type { SwipeDirection } from "../../engine/input";
import { gridCellAt } from "../grid-input";
import { SLIDE_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import { createSlide, slideDistance, slideNeighbor, slideSolved, slideSwap } from "./logic";

const SIZE = 64,
  LEFT = 192,
  TOP = 49;
export class SlideGame implements ArcadeGame {
  readonly manifest = SLIDE_MANIFEST;
  readonly readyHint = "ARROWS MOVE THE GAP · TAP A NEIGHBOR";
  score = 0;
  private g!: GameContext;
  private board: number[] = [];
  private moves = 0;
  private ended = false;
  get resultLabel(): string | undefined {
    return this.ended ? "PUZZLE SOLVED" : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.board = createSlide(ctx.rng);
    this.moves = 0;
    this.ended = false;
    this.updateScore();
    this.announce("Arrange tiles 1 to 15, leaving the gap last.");
  }
  destroy(): void {}
  fixedUpdate(_dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    const directions = (["left", "right", "up", "down"] as const).filter((key) =>
      input.wasPressedWithin(key, 180, true),
    );
    directions.push(...input.drainSwipes());
    const taps = input.drainTaps();
    for (const direction of directions) this.moveDirection(direction);
    for (const tap of taps) {
      const cell = gridCellAt(tap.x, tap.y, LEFT, TOP, SIZE, 4, 4);
      if (cell !== null) this.moveCell(cell);
    }
  }
  private moveDirection(direction: SwipeDirection): void {
    const cell = slideNeighbor(this.board.indexOf(0), direction);
    if (cell !== null) this.moveCell(cell);
    else this.announce("The gap cannot move that way.");
  }
  private moveCell(index: number): void {
    const tile = this.board[index],
      next = slideSwap(this.board, index);
    if (!next || this.ended) {
      if (!this.ended) this.announce("Choose a tile next to the gap.");
      return;
    }
    this.board = next;
    this.moves++;
    this.updateScore();
    this.g.sound.play("blip");
    if (slideSolved(this.board)) {
      this.ended = true;
      this.score = Math.max(5000, 10000 - this.moves * 10);
      this.announce("Puzzle solved.");
      void this.g.reportGameOver();
    } else this.announce(`Moved tile ${tile}.`);
  }
  private updateScore(): void {
    this.score = Math.max(0, 1600 - slideDistance(this.board) * 20);
  }
  private announce(message = ""): void {
    if (!this.g) return;
    const rows = Array.from(
      { length: 4 },
      (_, r) =>
        `row ${r + 1}: ${this.board
          .slice(r * 4, r * 4 + 4)
          .map((tile) => tile || "gap")
          .join(", ")}`,
    ).join("; ");
    this.g.announce?.(`SLIDE. ${message} ${this.moves} moves. ${rows}.`);
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    this.board.forEach((tile, index) => {
      const x = LEFT + (index % 4) * SIZE,
        y = TOP + Math.floor(index / 4) * SIZE;
      ctx.fillStyle = tile ? "#2E240F" : "#100D08";
      ctx.fillRect(x + 3, y + 3, SIZE - 6, SIZE - 6);
      ctx.strokeStyle = tile ? TOKENS.phosphorDim : "#302614";
      ctx.strokeRect(x + 3.5, y + 3.5, SIZE - 7, SIZE - 7);
      if (tile)
        drawText(ctx, String(tile), x + SIZE / 2, y + 42, {
          font: "23px Silkscreen, monospace",
          color: TOKENS.phosphorHot,
          align: "center",
        });
    });
    drawText(ctx, `MOVES ${this.moves} · ARROWS MOVE GAP`, 320, 330, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "center",
    });
  }
}
