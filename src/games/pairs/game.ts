import { TOKENS } from "../../../design/tokens";
import { gridCellAt, gridCellName, moveGridCursor } from "../grid-input";
import { PAIRS_MANIFEST } from "../manifest";
import type { ArcadeGame, GameContext } from "../types";
import { drawPairs, PAIRS_CELL, PAIRS_LEFT, PAIRS_TOP, pairsStatus } from "./display";
import { PairsBoard, type FlipResult } from "./logic";

export class PairsGame implements ArcadeGame {
  readonly manifest = PAIRS_MANIFEST;
  readonly readyHint = "ARROWS SELECT · SPACE OR TAP FLIPS";
  score = 0;
  protected g!: GameContext;
  protected board!: PairsBoard;
  protected cursor = 0;
  protected waiting = 0;
  protected ended = false;
  get recordsAllowed(): boolean {
    return true;
  }
  get resultLabel(): string | undefined {
    return this.ended ? "ALL PAIRS FOUND" : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.board = new PairsBoard(ctx.rng);
    this.cursor = 0;
    this.waiting = 0;
    this.ended = false;
    this.score = 0;
    this.announce("Find all eight pairs.");
  }
  destroy(): void {}
  fixedUpdate(dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    const directions = (["left", "right", "up", "down"] as const).filter((key) =>
      input.wasPressedWithin(key, 180, true),
    );
    const select = input.wasPressedWithin("primary", 180, true),
      taps = input.drainTaps();
    input.drainSwipes();
    if (this.waiting > 0) {
      this.waiting -= Math.max(0, dt);
      if (this.waiting <= 0) {
        this.board.hideMismatch();
        this.announce("Cards hidden again.");
      }
      return;
    }
    let changed = false;
    for (const direction of directions) {
      const next = moveGridCursor(this.cursor, direction, 4, 4);
      changed ||= next !== this.cursor;
      this.cursor = next;
    }
    for (const tap of taps) {
      const cell = gridCellAt(tap.x, tap.y, PAIRS_LEFT, PAIRS_TOP, PAIRS_CELL, 4, 4);
      if (cell !== null) {
        this.cursor = cell;
        this.flip();
        return;
      }
    }
    if (select) this.flip();
    else if (changed) this.announce();
  }
  private flip(): void {
    const symbol = this.board.cards[this.cursor]!,
      result = this.board.flip(this.cursor);
    if (result === "invalid") {
      this.announce("Choose a hidden card.");
      return;
    }
    this.g.sound.play(result === "match" ? "coin" : "blip");
    if (result === "miss") this.waiting = 1.2;
    if (result === "match" || result === "miss") this.pairResolved(result);
    this.score = this.board.pairs * 100;
    const message = `Flipped ${gridCellName(this.cursor, 4)}: ${symbol}. ${result === "match" ? "A pair!" : result === "miss" ? "Not a pair." : "Choose another card."}`;
    if (this.board.finished) {
      this.ended = true;
      this.score = Math.max(100, 3000 - this.board.attempts * 50);
      this.announce(`${message} ${this.resultLabel}.`);
      void this.g.reportGameOver();
    } else this.announce(message);
  }
  protected pairResolved(_result: Extract<FlipResult, "match" | "miss">): void {}
  protected header(): string {
    return `PAIRS ${this.board.pairs} / 8 · ATTEMPTS ${this.board.attempts}`;
  }
  protected announce(message = ""): void {
    this.g.announce?.(
      `PAIRS. ${message} ${this.board.pairs} of 8 pairs, ${this.board.attempts} attempts. ${pairsStatus(this.board, this.cursor)}`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    drawPairs(ctx, this.board, this.cursor, this.header());
  }
}
