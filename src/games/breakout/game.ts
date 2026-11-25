/**
 * BREAKOUT — canvas renderer + ArcadeGame binding.
 */
import type { ArcadeGame, GameContext } from "../types";
import { BREAKOUT_MANIFEST } from "../manifest";
import {
  BRICK_H,
  BRICK_W,
  BreakoutLogic,
  PADDLE_H,
  PADDLE_Y,
  type PowerUpKind,
} from "./logic";
import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";

const POWERUP_GLYPH: Record<PowerUpKind, string> = {
  wide: "W",
  multi: "M",
  slow: "S",
};

export class BreakoutGame implements ArcadeGame {
  readonly manifest = BREAKOUT_MANIFEST;
  readonly readyHint = "MOUSE OR ARROWS — SPACE TO LAUNCH";
  score = 0;

  private g!: GameContext;
  private logic!: BreakoutLogic;

  init(ctx: GameContext): void {
    this.g = ctx;
    this.score = 0;
    this.logic = new BreakoutLogic({ seed: (Math.random() * 0xffffffff) >>> 0 });
  }

  destroy(): void {
    /* nothing retained */
  }

  fixedUpdate(dt: number): void {
    const input = this.g.input;
    // Pointer — paddle follows x position (mouse and touch drag)
    const pointer = input.pointerPosition();
    if (input.isDown("left")) this.logic.nudgePaddle(-380 * dt);
    else if (input.isDown("right")) this.logic.nudgePaddle(380 * dt);
    else if (pointer.hasPosition) this.logic.movePaddleTo(pointer.x);
    if (input.wasPressedWithin("primary", 120, true)) this.logic.launch();
    if (input.drainTaps().length > 0) this.logic.launch();

    const events = this.logic.update(dt);
    for (const event of events) {
      switch (event.kind) {
        case "paddleHit":
          this.g.sound.play("paddle");
          break;
        case "brickHit":
          this.g.sound.play("breakBrick");
          if (event.destroyed) {
            this.g.particles.burst(event.x, event.y, 10, {
              color: ["#FFB000", "#FFD36B", "#7A5600"],
              speed: 80,
              size: 2,
            });
            this.g.scorePop(event.x, event.y, "+50");
            this.g.hitStop(30);
          }
          break;
        case "powerupTake":
          this.g.sound.play("powerup");
          this.g.scorePop(this.logic.paddleX, PADDLE_Y - 20, event.powerup.toUpperCase());
          break;
        case "ballLost":
          this.g.sound.play("hit");
          this.g.shake(4, 0.25);
          break;
        case "levelClear":
          this.g.sound.play("levelUp");
          this.g.scorePop(this.g.width / 2, 140, "LEVEL CLEAR");
          break;
        case "gameOver":
          this.score = this.logic.score;
          void this.g.reportGameOver();
          break;
      }
    }
    this.score = this.logic.score;
  }

  render(_alpha: number): void {
    const ctx = this.g.ctx;
    const w = this.g.width;
    const h = this.g.height;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, w, h);

    // Wall seam under HUD
    ctx.fillStyle = TOKENS.phosphorDim;
    ctx.fillRect(0, 27, w, 1);

    // Bricks — hp shown by brightness tier
    for (const brick of this.logic.bricks) {
      if (!brick.alive) continue;
      const rect = this.logic.brickRect(brick);
      ctx.fillStyle =
        brick.hp >= 3 ? TOKENS.phosphorHot : brick.hp === 2 ? TOKENS.phosphor : TOKENS.phosphorDim;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(rect.x, rect.y + rect.h - 3, rect.w, 3);
      if (brick.hp > 1) {
        ctx.fillStyle = "rgba(14,11,7,0.6)";
        ctx.fillRect(rect.x + rect.w / 2 - 1, rect.y + 4, 2, rect.h - 8);
      }
    }

    // Power-ups falling
    for (const p of this.logic.powerups) {
      ctx.fillStyle = TOKENS.ink;
      ctx.fillRect(p.x - 9, p.y - 9, 18, 18);
      ctx.strokeStyle = TOKENS.signalGreen;
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - 9.5, p.y - 9.5, 19, 19);
      drawText(ctx, POWERUP_GLYPH[p.kind], p.x, p.y + 4, {
        font: '12px "IBM Plex Mono", monospace',
        color: TOKENS.signalGreen,
        align: "center",
      });
    }

    // Paddle — with edge caps
    const half = this.logic.paddleW / 2;
    ctx.fillStyle = TOKENS.phosphor;
    ctx.fillRect(this.logic.paddleX - half, PADDLE_Y, this.logic.paddleW, PADDLE_H);
    ctx.fillStyle = TOKENS.phosphorHot;
    ctx.fillRect(this.logic.paddleX - half, PADDLE_Y, this.logic.paddleW, 3);
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(this.logic.paddleX - half + 4, PADDLE_Y + 5, 4, 3);
    ctx.fillRect(this.logic.paddleX + half - 8, PADDLE_Y + 5, 4, 3);

    // Balls
    for (const ball of this.logic.balls) {
      ctx.fillStyle = TOKENS.phosphorHot;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,211,107,0.25)";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lives + level
    drawText(ctx, `LV ${this.logic.level}`, 10, 44, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
    });
    drawText(ctx, `LIVES ${"▮".repeat(this.logic.lives)}`, w - 10, 44, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "right",
    });
    // Launch hint when ball is stuck
    if (this.logic.balls.some((b) => b.stuck)) {
      drawText(ctx, "SPACE / TAP TO LAUNCH", w / 2, h - 60, {
        font: '15px VT323, monospace',
        color: TOKENS.phosphorHot,
        align: "center",
      });
    }
  }
}
