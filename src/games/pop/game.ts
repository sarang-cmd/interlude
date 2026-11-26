import { TOKENS } from "../../../design/tokens";
import { gridCellAt, gridCellName, moveGridCursor } from "../grid-input";
import { POP_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";

const COLS = 5,
  ROWS = 3,
  CELL = 56,
  LEFT = 180,
  TOP = 86,
  ROUND_SECONDS = 45,
  LIFETIME = 1.8;
export class PopGame implements ArcadeGame {
  readonly manifest = POP_MANIFEST;
  readonly readyHint = "ARROWS AIM · SPACE POP · TAP TARGET";
  score = 0;
  private g!: GameContext;
  private cursor = 7;
  private target = 0;
  private left = ROUND_SECONDS;
  private age = 0;
  private hits = 0;
  private ended = false;
  get resultLabel(): string | undefined {
    return this.ended ? `${this.hits} TARGETS POPPED` : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.cursor = 7;
    this.target = ctx.rng.int(0, COLS * ROWS - 1);
    this.left = ROUND_SECONDS;
    this.age = 0;
    this.hits = 0;
    this.score = 0;
    this.ended = false;
    this.announce("Pop the lit square before it moves.");
  }
  destroy(): void {}
  fixedUpdate(dt: number): void {
    if (this.ended) return;
    this.left = Math.max(0, this.left - Math.max(0, dt));
    this.age += Math.max(0, dt);
    if (this.left === 0) {
      this.ended = true;
      this.announce("Time is up.");
      void this.g.reportGameOver();
      return;
    }
    if (this.age >= LIFETIME) {
      this.newTarget();
      this.announce("Target moved.");
    }
    const input = this.g.input;
    let moved = false;
    for (const key of ["left", "right", "up", "down"] as const)
      if (input.wasPressedWithin(key, 180, true)) {
        const next = moveGridCursor(this.cursor, key, COLS, ROWS);
        moved ||= next !== this.cursor;
        this.cursor = next;
      }
    const select = input.wasPressedWithin("primary", 180, true),
      taps = input.drainTaps();
    input.drainSwipes();
    for (const tap of taps) {
      const cell = gridCellAt(tap.x, tap.y, LEFT, TOP, CELL, COLS, ROWS);
      if (cell !== null) {
        this.cursor = cell;
        this.pop();
        return;
      }
    }
    if (select) this.pop();
    else if (moved) this.announce();
  }
  private newTarget(): void {
    const next = this.g.rng.int(0, COLS * ROWS - 2);
    this.target = next >= this.target ? next + 1 : next;
    this.age = 0;
  }
  private pop(): void {
    if (this.cursor === this.target) {
      this.hits++;
      this.score += 100;
      this.g.sound.play("coin");
      this.newTarget();
      this.announce("Pop!");
    } else {
      this.score = Math.max(0, this.score - 10);
      this.g.sound.play("blip");
      this.announce("Miss.");
    }
  }
  private announce(message = ""): void {
    this.g.announce?.(
      `POP. ${message} ${this.hits} targets. ${Math.ceil(this.left)} seconds. Target ${gridCellName(this.target, COLS)}. Selected ${gridCellName(this.cursor, COLS)}.`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    drawText(ctx, `TIME ${Math.ceil(this.left)} · POPPED ${this.hits}`, 320, 61, {
      font: '14px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorHot,
      align: "center",
    });
    for (let index = 0; index < COLS * ROWS; index++) {
      const x = LEFT + (index % COLS) * CELL,
        y = TOP + Math.floor(index / COLS) * CELL,
        target = index === this.target;
      ctx.fillStyle = target ? TOKENS.phosphor : "#171209";
      ctx.fillRect(x + 5, y + 5, CELL - 10, CELL - 10);
      ctx.strokeStyle = index === this.cursor ? TOKENS.phosphorHot : TOKENS.phosphorDim;
      ctx.lineWidth = index === this.cursor ? 3 : 1;
      ctx.strokeRect(x + 3.5, y + 3.5, CELL - 7, CELL - 7);
      if (target)
        drawText(ctx, "POP", x + CELL / 2, y + 34, {
          font: '12px "IBM Plex Mono", monospace',
          color: TOKENS.ink,
          align: "center",
        });
    }
    drawText(ctx, "ARROWS AIM · SPACE OR TAP POPS", 320, 306, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "center",
    });
  }
}
