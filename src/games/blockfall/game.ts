/**
 * BLOCKFALL — canvas renderer.
 */
import type { ArcadeGame, GameContext } from "../types";
import { BLOCKFALL_MANIFEST } from "../manifest";
import { BlockfallLogic, COLS, PIECES, PIECE_IDS, ROWS, type PieceKind } from "./logic";
import { TOKENS } from "../../../design/tokens";
import { drawLabel, drawText } from "../shared";

const CELL = 15;
const BOARD_X = 245;
const BOARD_Y = 34;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;

const PIECE_COLORS: Record<number, string> = {
  1: TOKENS.phosphorHot, // I
  2: TOKENS.phosphor, // O
  3: "#E08600", // T
  4: TOKENS.signalGreen, // S
  5: TOKENS.signalRed, // Z
  6: "#D9A85C", // J
  7: "#B8710A", // L
};
const KIND_TO_COLOR: Record<PieceKind, string> = {
  I: PIECE_COLORS[1]!,
  O: PIECE_COLORS[2]!,
  T: PIECE_COLORS[3]!,
  S: PIECE_COLORS[4]!,
  Z: PIECE_COLORS[5]!,
  J: PIECE_COLORS[6]!,
  L: PIECE_COLORS[7]!,
};

export class BlockfallGame implements ArcadeGame {
  readonly manifest = BLOCKFALL_MANIFEST;
  readonly readyHint = "ARROWS MOVE — SPACE HARD DROPS — C HOLDS";
  score = 0;

  private g!: GameContext;
  private logic!: BlockfallLogic;
  private flashT = 0;
  private softDropHeld = false;
  private softTimer = 0;
  private horizontal: "left" | "right" | null = null;
  private horizontalTimer = 0;

  init(ctx: GameContext): void {
    this.g = ctx;
    this.score = 0;
    this.flashT = 0;
    this.logic = new BlockfallLogic({ seed: Math.floor(ctx.rng.next() * 0xffffffff) });
  }

  destroy(): void {
    /* nothing retained */
  }

  fixedUpdate(dt: number): void {
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    const input = this.g.input;

    for (const direction of ["left", "right"] as const) {
      if (input.wasPressedWithin(direction, 160, true)) {
        this.logic.move(direction === "left" ? -1 : 1);
        this.horizontal = direction;
        this.horizontalTimer = 0.18;
      }
    }
    if (this.horizontal && input.isDown(this.horizontal)) {
      this.horizontalTimer -= dt;
      if (this.horizontalTimer <= 0) {
        this.logic.move(this.horizontal === "left" ? -1 : 1);
        this.horizontalTimer = 0.055;
      }
    } else this.horizontal = null;
    if (input.wasPressedWithin("up", 120, true)) {
      this.logic.rotate(1);
      this.g.sound.play("blip");
    }
    // Down = soft drop, repeatable while held
    if (input.isDown("down")) {
      this.softDropHeld = true;
      this.softTimer -= dt;
      if (this.softTimer <= 0) {
        this.logic.softDrop();
        this.softTimer = 0.045;
      }
    } else {
      this.softDropHeld = false;
      this.softTimer = 0;
    }
    if (input.wasPressedWithin("primary", 120, true)) {
      const events = this.logic.hardDrop();
      this.g.shake(3, 0.12);
      this.g.sound.play("hit");
      for (const e of events) {
        if (e.kind === "hardDrop") this.flashT = Math.max(this.flashT, 0.05);
      }
      this.handleEvents(events);
    }
    if (this.g.settings.blockfallHold && input.wasPressedWithin("secondary", 140, true)) {
      const events = this.logic.hold();
      if (events.length > 0) this.g.sound.play("hold");
      this.handleEvents(events);
    }
    // Touch: tap upper board rotates, lower third hard drops, sides move
    for (const tap of input.drainTaps()) {
      if (tap.y < BOARD_Y + BOARD_H * 0.45) {
        this.logic.rotate(1);
        this.g.sound.play("blip");
      } else if (tap.y > BOARD_Y + BOARD_H * 0.75) {
        this.handleEvents(this.logic.hardDrop());
        this.g.shake(3, 0.12);
      } else {
        this.logic.move(tap.x < BOARD_X + BOARD_W / 2 ? -1 : 1);
      }
    }

    this.handleEvents(this.logic.update(dt));
    this.score = this.logic.score;
  }

  private handleEvents(events: Array<{ kind: string; lines?: number; score?: number }>): void {
    this.score = this.logic.score;
    let gameOver = false;
    for (const event of events) {
      switch (event.kind) {
        case "lock":
          this.g.sound.play("blip");
          break;
        case "lineClear": {
          const lines = event.lines ?? 1;
          this.flashT = 0.22;
          this.g.sound.play("lineClear");
          this.g.hitStop(60 + lines * 40);
          for (let i = 0; i < 26; i++) {
            this.g.particles.burst(
              BOARD_X + Math.random() * BOARD_W,
              BOARD_Y + Math.random() * BOARD_H,
              2,
              {
                color: ["#FFD36B", "#FFB000", "#D9A85C"],
                speed: 70,
                size: 1,
                gravity: 120,
                life: 0.6,
              },
            );
          }
          if (lines === 4) {
            this.g.scorePop(BOARD_X + BOARD_W / 2, 160, "BLOCKFALL ×4");
            this.g.shake(4, 0.25);
          }
          break;
        }
        case "levelUp":
          this.g.sound.play("levelUp");
          this.g.scorePop(BOARD_X + BOARD_W / 2, 120, "LEVEL UP");
          break;
        case "gameOver":
          gameOver = true;
          break;
      }
    }
    if (gameOver) {
      this.g.sound.play("explosion");
      void this.g.reportGameOver();
    }
  }

  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);

    // ---- Hold box (left) ----
    drawLabel(ctx, "HOLD", 120, 46);
    this.drawBox(ctx, 78, 54, 84, 56);
    if (this.g.settings.blockfallHold && this.logic.holdKind)
      this.drawPreviewPiece(ctx, this.logic.holdKind, 120, 82, this.logic.holdUsed ? 0.35 : 1);

    // ---- Board ----
    ctx.fillStyle = "#100D08";
    ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
    ctx.strokeStyle = TOKENS.phosphor;
    ctx.lineWidth = 1;
    ctx.strokeRect(BOARD_X + 0.5, BOARD_Y + 0.5, BOARD_W - 1, BOARD_H - 1);
    // Faint column guides
    ctx.fillStyle = "rgba(255,176,0,0.05)";
    for (let c = 1; c < COLS; c++) ctx.fillRect(BOARD_X + c * CELL, BOARD_Y, 1, BOARD_H);

    // Locked cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = this.logic.board[r]?.[c];
        if (v)
          this.drawCell(
            ctx,
            BOARD_X + c * CELL,
            BOARD_Y + r * CELL,
            PIECE_COLORS[v] ?? TOKENS.phosphor,
            1,
          );
      }
    }

    const active = this.logic.active;
    if (active) {
      // Ghost piece
      const ghostY = this.logic.ghostY();
      if (this.g.settings.blockfallGhost && ghostY !== active.y) {
        for (const cell of this.cellsAt(active.kind, active.rotation, active.x, ghostY)) {
          if (cell.y >= 0) {
            ctx.strokeStyle = "rgba(255,176,0,0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(
              BOARD_X + cell.x * CELL + 0.5,
              BOARD_Y + cell.y * CELL + 0.5,
              CELL - 1,
              CELL - 1,
            );
          }
        }
      }
      // Active piece
      const color = KIND_TO_COLOR[active.kind];
      for (const cell of this.cellsAt(active.kind, active.rotation, active.x, active.y)) {
        if (cell.y >= 0)
          this.drawCell(ctx, BOARD_X + cell.x * CELL, BOARD_Y + cell.y * CELL, color, 1);
      }
    }

    // Line-clear flash
    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(255,211,107,${Math.min(0.5, this.flashT * 2.2)})`;
      ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
    }

    // ---- Next queue (right) ----
    drawLabel(ctx, "NEXT", 502, 46);
    const upcoming = this.logic.peekQueue(3);
    upcoming.forEach((kind, i) => {
      const cy = 84 + i * 64;
      this.drawBox(ctx, 460, cy - 24, 84, 50, i === 0 ? TOKENS.phosphorDim : "#1C160E");
      this.drawPreviewPiece(ctx, kind, 502, cy, i === 0 ? 1 : 0.6);
    });

    // ---- Stats (right, below next) ----
    drawLabel(ctx, "LINES", 502, 262);
    drawText(ctx, String(this.logic.lines), 502, 282, {
      font: "18px Silkscreen, monospace",
      color: TOKENS.phosphorHot,
      align: "center",
    });
    drawLabel(ctx, "LEVEL", 502, 306);
    drawText(ctx, String(this.logic.level), 502, 326, {
      font: "18px Silkscreen, monospace",
      color: TOKENS.phosphor,
      align: "center",
    });

    // Controls hint (left, below hold)
    if (!this.softDropHeld) {
      drawText(ctx, "UP ROTATE", 120, 150, {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
      drawText(ctx, "SPACE DROP", 120, 166, {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
      drawText(ctx, "C HOLD", 120, 182, {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
    }
  }

  private cellsAt(kind: PieceKind, rotation: number, px: number, py: number) {
    const def = PIECES[kind];
    const size = def.length;
    let m = def.map((r) => [...r]);
    for (let t = 0; t < rotation % 4; t++) {
      const next: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) next[x]![size - 1 - y] = m[y]?.[x] ?? 0;
      m = next;
    }
    const cells: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if (m[y]?.[x]) cells.push({ x: px + x, y: py + y });
    return cells;
  }

  private drawCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    alpha: number,
  ): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, CELL - 2, 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(Math.round(x) + 1, Math.round(y) + CELL - 3, CELL - 2, 2);
    ctx.globalAlpha = 1;
  }

  private drawBox(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    fill = "#141009",
  ): void {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = TOKENS.phosphorDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private drawPreviewPiece(
    ctx: CanvasRenderingContext2D,
    kind: PieceKind,
    cx: number,
    cy: number,
    alpha: number,
  ): void {
    const def = PIECES[kind];
    const size = def.length;
    const cell = 11;
    const offset = (size * cell) / 2;
    ctx.globalAlpha = alpha;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!def[y]?.[x]) continue;
        ctx.fillStyle = KIND_TO_COLOR[kind];
        ctx.fillRect(
          Math.round(cx - offset + x * cell) + 1,
          Math.round(cy - offset + y * cell) + 1,
          cell - 2,
          cell - 2,
        );
      }
    }
    ctx.globalAlpha = 1;
    void PIECE_IDS;
  }
}
