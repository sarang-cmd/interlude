import type { ArcadeGame, GameContext } from "../types";
import { TWENTY48_MANIFEST } from "../manifest";
import { Game2048, type Direction, type TileTransition } from "./logic";
import { loadHighScores, saveHighScore } from "../../shared/storage";
import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";

const CELL = 66,
  GAP = 8,
  BOARD = 4 * CELL + 5 * GAP;
const X = Math.round((640 - BOARD) / 2),
  Y = 27,
  DURATION = 0.12;
const TILE_COLORS: Record<number, string> = {
  2: "#1E1810",
  4: "#26200F",
  8: "#3A2B0E",
  16: "#54401A",
  32: "#7A5600",
  64: "#9A6B00",
  128: "#B88100",
  256: "#D69A00",
  512: "#FFB000",
  1024: "#FFC545",
  2048: "#FFD36B",
};

export class Game2048Game implements ArcadeGame {
  readonly manifest = TWENTY48_MANIFEST;
  readyHint = "ARROWS SLIDE — U UNDOES";
  score = 0;
  private g!: GameContext;
  private logic!: Game2048;
  private animation: { tiles: TileTransition[]; elapsed: number } | null = null;
  private pending: Direction | null = null;
  private personalTile = 0;
  private secondsRemaining = 0;
  private elapsedSeconds = 0;
  private clockLimit = 0;
  private timed = false;
  private ended = false;
  init(ctx: GameContext): void {
    this.g = ctx;
    this.score = 0;
    this.animation = null;
    this.pending = null;
    this.ended = false;
    const limit = Number.isFinite(ctx.settings.twenty48Seconds)
      ? Math.max(0, Math.min(600, Math.round(ctx.settings.twenty48Seconds)))
      : 90;
    this.timed = limit > 0;
    this.secondsRemaining = limit;
    this.clockLimit = limit;
    this.elapsedSeconds = 0;
    this.readyHint = this.timed
      ? `${limit} SEC · ARROWS SLIDE · U UNDO`
      : "ARROWS SLIDE — U UNDOES";
    this.logic = new Game2048({
      seed: Math.floor(ctx.rng.next() * 0xffffffff),
      undoLimit: ctx.settings.undo2048,
    });
    void loadHighScores().then((scores) => {
      this.personalTile = Math.max(this.personalTile, scores["twenty48:tile"] ?? 0);
    });
  }
  destroy(): void {
    /* no retained listeners */
  }
  settingsChanged(): void {
    this.logic.setUndoLimit(this.g.settings.undo2048);
    const limit = this.g.settings.twenty48Seconds;
    if (limit !== this.clockLimit) {
      this.clockLimit = limit;
      this.timed = limit > 0;
      this.secondsRemaining = Math.max(0, limit - this.elapsedSeconds);
      this.readyHint = this.timed
        ? `${limit} SEC · ARROWS SLIDE · U UNDO`
        : "ARROWS SLIDE — U UNDOES";
    }
  }
  fixedUpdate(dt: number): void {
    if (this.ended) return;
    this.elapsedSeconds += dt;
    if (this.timed) {
      this.secondsRemaining = Math.max(0, this.clockLimit - this.elapsedSeconds);
      if (this.secondsRemaining === 0) {
        this.end();
        return;
      }
    }
    if (this.animation) {
      this.animation.elapsed += dt;
      if (this.animation.elapsed >= DURATION) {
        this.animation = null;
        if (!this.logic.alive) {
          this.end();
          return;
        }
        if (this.pending) {
          const next = this.pending;
          this.pending = null;
          this.move(next);
        }
      }
    }
    const input = this.g.input;
    for (const direction of ["left", "right", "up", "down"] as const)
      if (input.wasPressedWithin(direction, 180, true)) this.move(direction);
    for (const swipe of input.drainSwipes()) this.move(swipe);
    if (input.wasPressedWithin("secondary", 180, true) && this.logic.undo()) {
      this.animation = null;
      this.pending = null;
      this.g.sound.play("undo");
    }
    this.score = this.logic.score;
  }
  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.score = this.logic.score;
    this.recordBestTile();
    void this.g.reportGameOver();
  }
  private move(direction: Direction): void {
    if (this.animation) {
      this.pending = direction;
      return;
    }
    const result = this.logic.move(direction);
    if (!result.moved) {
      if (!this.logic.alive) this.end();
      return;
    }
    this.animation = { tiles: result.tiles, elapsed: 0 };
    this.score = this.logic.score;
    this.recordBestTile();
    this.g.sound.play(result.gained ? "coin" : "blip");
    if (result.gained) {
      this.g.scorePop(490, 175, `+${result.gained}`);
      this.g.particles.burst(490, 170, 6, {
        color: TOKENS.phosphor,
        speed: 30,
        size: 1,
        life: 0.3,
      });
      if (result.mergedMax >= 64) this.g.shake(2, 0.1);
      if (result.mergedMax >= 256) this.g.hitStop(35);
    }
  }
  private recordBestTile(): void {
    if (this.logic.bestTile <= this.personalTile) return;
    this.personalTile = this.logic.bestTile;
    if (this.g.preview) return;
    // Persist at the merge, not only at game-over: a waiting session can close
    // at any time. This stores the maximum even if a later undo is used.
    void saveHighScore("twenty48:tile", this.personalTile).then(({ best }) => {
      this.personalTile = Math.max(this.personalTile, best);
    });
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    ctx.fillStyle = "#141009";
    ctx.fillRect(X, Y, BOARD, BOARD);
    ctx.strokeStyle = TOKENS.phosphorDim;
    ctx.strokeRect(X + 0.5, Y + 0.5, BOARD - 1, BOARD - 1);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = TOKENS.ink;
        ctx.fillRect(X + GAP + c * (CELL + GAP), Y + GAP + r * (CELL + GAP), CELL, CELL);
      }
    if (this.animation) {
      const t = Math.min(1, Math.floor((this.animation.elapsed / DURATION) * 6) / 6);
      for (const tile of this.animation.tiles)
        this.tile(
          tile.value,
          tile.from.r + (tile.to.r - tile.from.r) * t,
          tile.from.c + (tile.to.c - tile.from.c) * t,
        );
    } else {
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const value = this.logic.grid[r]?.[c] ?? 0;
          if (value) this.tile(value, r, c);
        }
    }
    drawText(ctx, `TILE ${this.logic.bestTile}`, X, Y + BOARD + 15, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
    });
    drawText(ctx, `UNDO ${this.logic.undoRemaining}`, X + BOARD, Y + BOARD + 15, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "right",
    });
    drawText(ctx, "BEST", 90, 165, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
      align: "center",
    });
    drawText(ctx, String(Math.max(this.personalTile, this.logic.bestTile)), 90, 190, {
      font: "18px Silkscreen, monospace",
      color: TOKENS.phosphorHot,
      align: "center",
    });
    drawText(ctx, "CLOCK", 550, 165, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
      align: "center",
    });
    const clock = this.timed ? String(Math.ceil(this.secondsRemaining)).padStart(2, "0") : "OFF";
    drawText(ctx, clock, 550, 190, {
      font: "18px Silkscreen, monospace",
      color: this.timed && this.secondsRemaining <= 10 ? TOKENS.signalRed : TOKENS.phosphorHot,
      align: "center",
    });
  }
  private tile(value: number, r: number, c: number): void {
    const ctx = this.g.ctx,
      x = Math.round(X + GAP + c * (CELL + GAP)),
      y = Math.round(Y + GAP + r * (CELL + GAP));
    ctx.fillStyle = TILE_COLORS[value] ?? TOKENS.phosphorHot;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = value >= 512 ? TOKENS.phosphorHot : "rgba(0,0,0,0.45)";
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    const size = value < 100 ? 24 : value < 1000 ? 20 : 15;
    drawText(ctx, String(value), x + CELL / 2, y + CELL / 2 + size / 3, {
      font: `${size}px Silkscreen, monospace`,
      color: value >= 128 ? TOKENS.ink : TOKENS.phosphorHot,
      align: "center",
    });
  }
}
