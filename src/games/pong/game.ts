/**
 * PONG — canvas renderer.
 */
import type { ArcadeGame, GameContext } from "../types";
import { PONG_MANIFEST } from "../manifest";
import { PongLogic } from "./logic";
import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";

const PADDLE_H = 84;

export class PongGame implements ArcadeGame {
  readonly manifest = PONG_MANIFEST;
  readyHint = "MOUSE OR ARROWS — FIRST TO 5";
  score = 0;

  private g!: GameContext;
  private logic!: PongLogic;

  init(ctx: GameContext): void {
    this.g = ctx;
    this.score = 0;
    this.readyHint = `MOUSE OR ARROWS — FIRST TO ${ctx.settings.pongFirstTo}`;
    this.logic = new PongLogic({
      seed: Math.floor(ctx.rng.next() * 0xffffffff),
      difficulty: ctx.settings.pongDifficulty,
      firstTo: ctx.settings.pongFirstTo,
    });
  }

  destroy(): void {
    /* nothing retained */
  }

  fixedUpdate(dt: number): void {
    const input = this.g.input;
    const pointer = input.pointerPosition();
    if (input.isDown("up")) this.logic.nudgePlayer(-430 * dt);
    else if (input.isDown("down")) this.logic.nudgePlayer(430 * dt);
    else if (pointer.hasPosition) this.logic.movePlayer(pointer.y - PADDLE_H / 2);
    // Touch drag: finger on the left half moves the paddle
    if (pointer.isDown) this.logic.movePlayer(pointer.y - PADDLE_H / 2);

    const events = this.logic.update(dt);
    for (const event of events) {
      switch (event.kind) {
        case "paddleHit":
          this.g.sound.play("paddle");
          this.g.shake(1.2, 0.06);
          break;
        case "wallBounce":
          this.g.sound.play("blip");
          break;
        case "score":
          if (event.side === "player") {
            this.g.sound.play("coin");
            this.g.scorePop(this.g.width / 2, 120, "POINT");
          } else {
            this.g.sound.play("hit");
            this.g.shake(3, 0.18);
          }
          break;
        case "matchOver":
          this.score = this.logic.playerScore * 1000 + this.logic.rallyHits;
          if (event.side === "player") this.g.sound.play("levelUp");
          void this.g.reportGameOver();
          break;
      }
    }
    // Live score: points × 100 + rally hits — rewards long rallies
    this.score = this.logic.playerScore * 1000 + this.logic.rallyHits;
  }

  render(_alpha: number): void {
    const ctx = this.g.ctx;
    const w = this.g.width;
    const h = this.g.height;

    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, w, h);

    // Center net — dashed hairline
    ctx.fillStyle = "rgba(255,176,0,0.3)";
    for (let y = 30; y < h; y += 18) ctx.fillRect(w / 2 - 1, y, 2, 10);

    // Field bounds
    ctx.fillStyle = TOKENS.phosphorDim;
    ctx.fillRect(0, 25, w, 1);

    // Scores, big
    drawText(ctx, String(this.logic.playerScore), w / 2 - 70, 86, {
      font: '46px Silkscreen, monospace',
      color: TOKENS.phosphorHot,
      align: "center",
    });
    drawText(ctx, String(this.logic.aiScore), w / 2 + 70, 86, {
      font: '46px Silkscreen, monospace',
      color: TOKENS.phosphorDim,
      align: "center",
    });
    drawText(ctx, "PLAYER 1", w / 2 - 70, 108, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
      align: "center",
    });
    drawText(ctx, "MACHINE", w / 2 + 70, 108, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
      align: "center",
    });

    // Paddles
    ctx.fillStyle = TOKENS.phosphor;
    ctx.fillRect(6, Math.round(this.logic.playerY), 10, PADDLE_H);
    ctx.fillStyle = TOKENS.phosphorHot;
    ctx.fillRect(6, Math.round(this.logic.playerY), 3, PADDLE_H);
    ctx.fillStyle = TOKENS.phosphorDim;
    ctx.fillRect(w - 16, Math.round(this.logic.aiY), 10, PADDLE_H);

    // Ball with ghost trail
    const b = this.logic.ball;
    ctx.fillStyle = "rgba(255,211,107,0.18)";
    ctx.fillRect(Math.round(b.x - b.vx * 0.02) - 5, Math.round(b.y - b.vy * 0.02) - 5, 10, 10);
    ctx.fillStyle = TOKENS.phosphorHot;
    ctx.fillRect(Math.round(b.x) - 5, Math.round(b.y) - 5, 10, 10);

    // Serve countdown
    if (this.logic.isServing) {
      drawText(ctx, "SERVE…", w / 2, h - 40, {
        font: '16px VT323, monospace',
        color: TOKENS.phosphor,
        align: "center",
      });
    }
    drawText(ctx, `RALLY ${this.logic.rallyHits}`, 10, h - 10, {
      font: '12px VT323, monospace',
      color: TOKENS.phosphorDim,
    });
    drawText(ctx, `FIRST TO ${this.logic.firstTo} · ${this.logic.difficulty.toUpperCase()}`, w - 10, h - 10, {
      font: '12px VT323, monospace',
      color: TOKENS.phosphorDim,
      align: "right",
    });
  }
}
