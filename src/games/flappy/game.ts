/**
 * FLAPPY-STYLE — canvas renderer.
 */
import type { ArcadeGame, GameContext } from "../types";
import { FLAPPY_MANIFEST } from "../manifest";
import { BIRD_X, FlappyLogic } from "./logic";
import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";

export class FlappyGame implements ArcadeGame {
  readonly manifest = FLAPPY_MANIFEST;
  readonly readyHint = "SPACE OR TAP TO FLAP";
  score = 0;

  private g!: GameContext;
  private logic!: FlappyLogic;
  private flapBuffer = 0;
  private elapsed = 0;

  init(ctx: GameContext): void {
    this.g = ctx;
    this.score = 0;
    this.flapBuffer = 0;
    this.elapsed = 0;
    this.logic = new FlappyLogic({ seed: Math.floor(ctx.rng.next() * 0xffffffff) });
  }

  destroy(): void {
    /* nothing retained */
  }

  fixedUpdate(dt: number): void {
    this.elapsed += dt;
    const input = this.g.input;
    // Input buffer: a flap pressed up to 120 ms early still fires
    if (input.wasPressedWithin("primary", 140, true)) this.flapBuffer = 0.12;
    input.drainTaps();
    if (this.flapBuffer > 0) {
      this.logic.flap();
      this.flapBuffer = 0;
      this.g.sound.play("flap");
      this.g.particles.burst(BIRD_X - 8, this.logic.birdY + 6, 4, {
        color: ["#FFD36B"],
        speed: 40,
        size: 1,
        gravity: 30,
        life: 0.35,
      });
    }

    const events = this.logic.update(dt);
    for (const event of events) {
      if (event.kind === "score") {
        this.score = this.logic.score;
        this.g.sound.play("coin");
        this.g.scorePop(BIRD_X + 20, this.logic.birdY - 20, "+1");
      } else if (event.kind === "hit") {
        this.g.sound.play("explosion");
        this.g.shake(5, 0.35);
        this.g.hitStop(120);
        this.g.particles.burst(BIRD_X, this.logic.birdY, 20, {
          color: ["#D6452B", "#FFB000"],
          speed: 110,
          size: 2,
        });
        void this.g.reportGameOver();
      }
    }
    this.score = this.logic.score;
  }

  render(_alpha: number): void {
    const ctx = this.g.ctx;
    const w = this.g.width;
    const h = this.g.height;

    // Sky: ink with a dimmer horizon band (no gradients-to-purple, ever)
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#120E08";
    ctx.fillRect(0, h - 64, w, 64);

    // Distant cabinet-skyline silhouettes
    ctx.fillStyle = "#1A140C";
    for (const [x, bh] of [
      [30, 40],
      [95, 66],
      [170, 30],
      [250, 54],
      [330, 38],
      [420, 70],
      [505, 44],
      [580, 58],
    ] as const) {
      ctx.fillRect(x, h - 64 - bh, 34, bh);
    }

    // Ground strip
    ctx.fillStyle = TOKENS.phosphorDim;
    ctx.fillRect(0, h - 14, w, 1);
    ctx.fillStyle = "#171209";
    ctx.fillRect(0, h - 13, w, 13);
    drawText(ctx, "////////////", 0, h - 3, { font: "12px VT323, monospace", color: "#2A2114" });

    // Pipes — phosphor frames with dim fill, hard edges
    for (const pipe of this.logic.pipes) {
      const pipeW = 52;
      const gapTop = pipe.gapY - pipe.gapH / 2;
      const gapBottom = pipe.gapY + pipe.gapH / 2;
      this.drawPipeColumn(ctx, pipe.x, 26, gapTop - 26, pipeW, true);
      this.drawPipeColumn(ctx, pipe.x, gapBottom, h - 14 - gapBottom, pipeW, false);
    }

    // Bird — chunky phosphor bird with wing frame
    const y = this.logic.birdY;
    const wingUp = Math.sin(this.elapsed * 11) > 0;
    ctx.fillStyle = TOKENS.phosphorHot;
    ctx.fillRect(BIRD_X - 9, Math.round(y) - 7, 18, 14);
    ctx.fillStyle = TOKENS.phosphor;
    ctx.fillRect(BIRD_X - 9, Math.round(y) - 7, 18, 4);
    // Eye
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(BIRD_X + 3, Math.round(y) - 4, 3, 3);
    // Beak
    ctx.fillStyle = TOKENS.signalRed;
    ctx.fillRect(BIRD_X + 9, Math.round(y), 5, 3);
    // Wing
    ctx.fillStyle = TOKENS.phosphor;
    if (wingUp) ctx.fillRect(BIRD_X - 7, Math.round(y) - 11, 10, 4);
    else ctx.fillRect(BIRD_X - 7, Math.round(y) + 7, 10, 4);

    // Score, big and centered
    drawText(ctx, String(this.logic.score), w / 2, 64, {
      font: "34px Silkscreen, monospace",
      color: TOKENS.phosphorHot,
      align: "center",
    });
  }

  private drawPipeColumn(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    width: number,
    flip: boolean,
  ): void {
    if (height <= 0) return;
    ctx.fillStyle = "#241B0E";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = TOKENS.phosphor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    // Lip
    const lipH = 12;
    const lipY = flip ? y + height - lipH : y;
    ctx.fillStyle = "#2E2412";
    ctx.fillRect(x - 3, lipY, width + 6, lipH);
    ctx.strokeRect(x - 2, lipY + 1, width + 4, lipH - 2);
    // Dim scan lines on the pipe body
    ctx.fillStyle = "rgba(255,176,0,0.08)";
    for (let ly = y + 8; ly < y + height - 6; ly += 10) {
      ctx.fillRect(x + 3, ly, width - 6, 1);
    }
  }
}
