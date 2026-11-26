import { TOKENS } from "../../../design/tokens";
import { gridCellAt, gridCellName, moveGridCursor } from "../grid-input";
import { SWEEP_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import { SweepBoard, SWEEP_MINES, SWEEP_SIDE } from "./logic";

const CELL = 29,
  LEFT = 189,
  TOP = 48;
export class SweepGame implements ArcadeGame {
  readonly manifest = SWEEP_MANIFEST;
  readonly readyHint = "ARROWS MOVE · SPACE OPEN · C FLAG";
  score = 0;
  private g!: GameContext;
  private board!: SweepBoard;
  private cursor = 40;
  private ended = false;
  get resultLabel(): string | undefined {
    return this.ended ? (this.board.outcome === "won" ? "CLEARED" : "MINE HIT") : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.board = new SweepBoard(ctx.rng);
    this.cursor = 40;
    this.score = 0;
    this.ended = false;
    this.announce("Find the safe squares. First opening is safe.");
  }
  destroy(): void {}
  fixedUpdate(_dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    let moved = false;
    for (const direction of ["left", "right", "up", "down"] as const)
      if (input.wasPressedWithin(direction, 180, true)) {
        const next = moveGridCursor(this.cursor, direction, SWEEP_SIDE, SWEEP_SIDE);
        moved ||= next !== this.cursor;
        this.cursor = next;
      }
    const reveal = input.wasPressedWithin("primary", 180, true),
      flag = input.wasPressedWithin("secondary", 180, true);
    const taps = input.drainTaps();
    input.drainSwipes();
    for (const tap of taps) {
      const cell = gridCellAt(tap.x, tap.y, LEFT, TOP, CELL, 9, 9);
      if (cell !== null) {
        this.cursor = cell;
        this.open();
        return;
      }
    }
    if (flag) {
      const changed = this.board.toggleFlag(this.cursor);
      this.announce(
        changed
          ? this.board.flagged[this.cursor]
            ? "Flag placed."
            : "Flag removed."
          : "Cannot flag an open square.",
      );
      return;
    }
    if (reveal) {
      this.open();
      return;
    }
    if (moved) this.announce();
  }
  private open(): void {
    if (!this.board.reveal(this.cursor)) {
      this.announce("Cannot open this square.");
      return;
    }
    this.score =
      this.board.open.filter(Boolean).length * 10 + (this.board.outcome === "won" ? 1000 : 0);
    this.g.sound.play(this.board.outcome === "lost" ? "hit" : "blip");
    if (this.board.outcome !== "playing") {
      this.ended = true;
      this.announce(this.resultLabel);
      void this.g.reportGameOver();
    } else this.announce("Opened.");
  }
  private announce(message = ""): void {
    if (!this.g) return;
    const i = this.cursor;
    const cell = this.board.open[i]
      ? this.board.mines[i]
        ? "mine"
        : `${this.board.adjacent(i)} neighboring mines`
      : this.board.flagged[i]
        ? "flagged"
        : "covered";
    this.g.announce?.(
      `SWEEP. ${message} Selected ${gridCellName(i, 9)}, ${cell}. ${this.board.open.filter(Boolean).length} safe squares open, ${this.board.flagged.filter(Boolean).length} flags, ${SWEEP_MINES} mines total.`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    for (let i = 0; i < 81; i++) {
      const x = LEFT + (i % 9) * CELL,
        y = TOP + Math.floor(i / 9) * CELL;
      ctx.fillStyle = this.board.open[i] ? "#2B2113" : i === this.cursor ? "#57400F" : "#171209";
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.strokeStyle = i === this.cursor ? TOKENS.phosphorHot : TOKENS.phosphorDim;
      ctx.lineWidth = i === this.cursor ? 2 : 1;
      ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      let text = "";
      let color: string = TOKENS.phosphorHot;
      if (this.board.open[i]) {
        if (this.board.mines[i]) {
          text = "*";
          color = TOKENS.signalRed;
        } else {
          const n = this.board.adjacent(i);
          text = n ? String(n) : "";
        }
      } else if (this.board.flagged[i]) text = "F";
      else if (this.ended && this.board.outcome === "lost" && this.board.mines[i]) {
        text = "*";
        color = TOKENS.signalRed;
      }
      if (text)
        drawText(ctx, text, x + CELL / 2, y + 21, {
          font: "16px Silkscreen, monospace",
          color,
          align: "center",
        });
    }
    drawText(
      ctx,
      `MINES ${SWEEP_MINES} / FLAGS ${this.board.flagged.filter(Boolean).length}`,
      320,
      330,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphor, align: "center" },
    );
  }
}
