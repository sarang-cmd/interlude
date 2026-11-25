/**
 * DASHLINE — canvas renderer.
 */
import type { ArcadeGame, GameContext } from "../types";
import { DASHLINE_MANIFEST } from "../manifest";
import { DashlineLogic, GROUND_Y } from "./logic";
import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";

export class DashlineGame implements ArcadeGame {
  readonly manifest = DASHLINE_MANIFEST;
  readonly readyHint = "HOLD SPACE TO JUMP HIGHER";
  score = 0;

  private g!: GameContext;
  private logic!: DashlineLogic;
  private elapsed = 0;

  init(ctx: GameContext): void {
    this.g = ctx;
    this.score = 0;
    this.elapsed = 0;
    this.logic = new DashlineLogic({ seed: Math.floor(ctx.rng.next() * 0xffffffff) });
  }

  destroy(): void {
    /* nothing retained */
  }

  fixedUpdate(dt: number): void {
    this.elapsed += dt;
    const input = this.g.input;
    if (input.wasPressedWithin("primary", 130, true)) this.logic.queueJump();
    input.drainTaps();

    const jumpHeld = input.isDown("primary") || input.pointerPosition().isDown;
    const events = this.logic.update(dt, jumpHeld);
    for (const event of events) {
      switch (event.kind) {
        case "jump":
          this.g.sound.play("jump");
          break;
        case "land":
          // small dust puffs reward clean landings
          this.g.particles.burst(this.logic.playerX, GROUND_Y, 4, {
            color: ["#7A5600"],
            speed: 30,
            size: 1,
            gravity: -20,
            life: 0.4,
          });
          break;
        case "pass":
          this.g.sound.play("blip");
          break;
        case "hit":
          this.g.sound.play("explosion");
          this.g.shake(6, 0.35);
          this.g.hitStop(130);
          this.g.particles.burst(this.logic.playerX, this.logic.playerY - 18, 24, {
            color: ["#D6452B", "#FFB000", "#FFD36B"],
            speed: 120,
            size: 2,
          });
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

    // Parallax skyline — two layers, moves with speed
    const t = this.logic.distance;
    ctx.fillStyle = "#14100A";
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 211 - (t * 0.22) % 211) + w) % (w + 211) - 105;
      const bh = 26 + ((i * 73) % 42);
      ctx.fillRect(Math.round(bx), GROUND_Y - 60 - bh, 46, bh + 60);
    }
    ctx.fillStyle = "#1B150D";
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 173 - (t * 0.45) % 173) + w) % (w + 173) - 86;
      const bh = 18 + ((i * 41) % 26);
      ctx.fillRect(Math.round(bx), GROUND_Y - bh, 30, bh);
    }

    // Ground
    ctx.fillStyle = TOKENS.phosphorDim;
    ctx.fillRect(0, GROUND_Y, w, 2);
    ctx.fillStyle = "#171209";
    ctx.fillRect(0, GROUND_Y + 2, w, h - GROUND_Y);
    // Moving ground ticks
    ctx.fillStyle = "rgba(255,176,0,0.18)";
    for (let x = -((t * 1) % 36); x < w; x += 36) {
      ctx.fillRect(Math.round(x), GROUND_Y + 16, 14, 2);
    }

    // Obstacles — hard amber blocks; flyers bob
    for (const o of this.logic.obstacles) {
      const oTop = o.flying ? GROUND_Y - 96 : GROUND_Y - o.height;
      if (o.flying) {
        // flyer: hovering drone with blinking lamp
        const bob = Math.sin(this.elapsed * 6.25 + o.id) * 3;
        ctx.fillStyle = "#2E2412";
        ctx.fillRect(Math.round(o.x) - 2, Math.round(GROUND_Y - 84 + bob) , o.width + 4, 18);
        ctx.strokeStyle = TOKENS.signalRed;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(o.x) - 1.5, Math.round(GROUND_Y - 83 + bob), o.width + 3, 17);
        ctx.fillStyle = Math.floor(this.elapsed * (1000 / 240)) % 2 === 0 ? TOKENS.signalRed : "#5A2015";
        ctx.fillRect(Math.round(o.x) + o.width / 2 - 2, Math.round(GROUND_Y - 77 + bob), 4, 4);
      } else {
        ctx.fillStyle = "#241B0E";
        ctx.fillRect(Math.round(o.x), oTop, o.width, o.height);
        ctx.strokeStyle = TOKENS.phosphor;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(o.x) + 0.5, oTop + 0.5, o.width - 1, o.height - 1);
        ctx.fillStyle = "rgba(255,176,0,0.14)";
        ctx.fillRect(Math.round(o.x) + 3, oTop + 4, o.width - 6, 2);
      }
    }

    // Runner — small phosphor robot, animated leg frames
    const px = this.logic.playerX;
    const py = this.logic.playerY;
    const running = this.logic.grounded && this.logic.alive;
    const frame = Math.floor(t / 18) % 2;
    ctx.fillStyle = TOKENS.phosphorHot;
    ctx.fillRect(Math.round(px) - 8, Math.round(py) - 34, 16, 16); // torso
    ctx.fillStyle = TOKENS.phosphor;
    ctx.fillRect(Math.round(px) - 6, Math.round(py) - 44, 12, 9); // head
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(Math.round(px) + 1, Math.round(py) - 41, 3, 3); // eye
    // legs
    ctx.fillStyle = TOKENS.phosphor;
    if (!this.logic.grounded) {
      ctx.fillRect(Math.round(px) - 8, Math.round(py) - 18, 5, 8);
      ctx.fillRect(Math.round(px) + 3, Math.round(py) - 18, 5, 8);
    } else if (running) {
      if (frame === 0) {
        ctx.fillRect(Math.round(px) - 8, Math.round(py) - 18, 5, 18);
        ctx.fillRect(Math.round(px) + 3, Math.round(py) - 13, 5, 13);
      } else {
        ctx.fillRect(Math.round(px) - 8, Math.round(py) - 13, 5, 13);
        ctx.fillRect(Math.round(px) + 3, Math.round(py) - 18, 5, 18);
      }
    }

    // Speed readout
    drawText(ctx, `${Math.round(this.logic.runSpeed)} PX/S`, 10, 44, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
    });
  }
}
