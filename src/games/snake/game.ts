/**
 * SNAKE — canvas renderer + ArcadeGame binding.
 */
import type { ArcadeGame, GameContext } from "../types";
import { SNAKE_MANIFEST } from "../manifest";
import { SnakeLogic } from "./logic";
import { TOKENS } from "../../../design/tokens";
import { drawGridDots, drawText } from "../shared";

const CELL = 20;
const COLS = 32;
const ROWS = 18;

export class SnakeGame implements ArcadeGame {
  readonly manifest = SNAKE_MANIFEST;
  readonly readyHint = "ARROWS STEER · SWIPE ON TOUCH";
  score = 0;

  private g!: GameContext;
  private logic!: SnakeLogic;

  init(ctx: GameContext): void {
    this.g = ctx;
    this.score = 0;
    this.logic = new SnakeLogic({
      cols: COLS,
      rows: ROWS,
      wrap: ctx.settings.snakeWrap,
      seed: Math.floor(ctx.rng.next() * 0xffffffff),
    });
  }

  destroy(): void {
    /* logic holds nothing external */
  }

  fixedUpdate(dt: number): void {
    this.logic.wrap = this.g.settings.snakeWrap;
    const input = this.g.input;
    if (input.wasPressedWithin("left", 140, true)) this.logic.setDirection({ x: -1, y: 0 });
    if (input.wasPressedWithin("right", 140, true)) this.logic.setDirection({ x: 1, y: 0 });
    if (input.wasPressedWithin("up", 140, true)) this.logic.setDirection({ x: 0, y: -1 });
    if (input.wasPressedWithin("down", 140, true)) this.logic.setDirection({ x: 0, y: 1 });
    for (const swipe of input.drainSwipes()) {
      const dir =
        swipe === "left"
          ? { x: -1, y: 0 }
          : swipe === "right"
            ? { x: 1, y: 0 }
            : swipe === "up"
              ? { x: 0, y: -1 }
              : { x: 0, y: 1 };
      this.logic.setDirection(dir);
    }

    const events = this.logic.update(dt);
    for (const event of events) {
      switch (event.kind) {
        case "eat": {
          const cx = event.at.x * CELL + CELL / 2;
          const cy = event.at.y * CELL + CELL / 2;
          this.g.sound.play(event.bonus ? "coin" : "blip");
          this.g.scorePop(cx, cy, event.bonus ? "+30" : "+10");
          this.g.particles.burst(cx, cy, event.bonus ? 14 : 8, {
            color: event.bonus ? ["#FFD36B", "#FFB000"] : ["#FFB000"],
            speed: 70,
            size: 2,
          });
          if (event.bonus) this.g.hitStop(60);
          break;
        }
        case "bonusSpawn":
          this.g.sound.play("powerup");
          break;
        case "die": {
          const head = this.logic.snake[0] ?? { x: 8, y: 9 };
          this.g.sound.play("explosion");
          this.g.shake(6, 0.35);
          this.g.hitStop(140);
          this.g.particles.burst(head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, 26, {
            color: ["#D6452B", "#FFB000", "#FFD36B"],
            speed: 130,
            size: 3,
          });
          this.score = this.logic.score;
          void this.g.reportGameOver();
          break;
        }
      }
    }
    this.score = this.logic.score;
  }

  render(alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    drawGridDots(ctx, 0, 0, COLS, ROWS, CELL);

    const f = this.logic.food;
    ctx.fillStyle = TOKENS.phosphor;
    ctx.fillRect(f.x * CELL + 5, f.y * CELL + 5, CELL - 10, CELL - 10);
    ctx.fillStyle = TOKENS.phosphorHot;
    ctx.fillRect(f.x * CELL + 8, f.y * CELL + 8, 4, 4);

    if (this.logic.bonus) {
      const b = this.logic.bonus.cell;
      const blink = Math.floor(this.logic.bonus.ttl * 2) % 2 === 0;
      ctx.fillStyle = blink ? TOKENS.signalRed : "#8A2B1C";
      ctx.fillRect(b.x * CELL + 3, b.y * CELL + 4, CELL - 6, CELL - 8);
      ctx.fillStyle = TOKENS.signalGreen;
      ctx.fillRect(b.x * CELL + CELL / 2 - 1, b.y * CELL + 1, 2, 5);
    }

    const n = this.logic.snake.length;
    this.logic.snake.forEach((seg, i) => {
      const prev = this.logic.previousSnake[i] ?? this.logic.previousSnake.at(-1) ?? seg;
      const progress = this.logic.movementProgress(alpha);
      const crossesWrap = Math.abs(prev.x - seg.x) > 1 || Math.abs(prev.y - seg.y) > 1;
      const x = Math.round((crossesWrap ? seg.x : prev.x + (seg.x - prev.x) * progress) * CELL);
      const y = Math.round((crossesWrap ? seg.y : prev.y + (seg.y - prev.y) * progress) * CELL);
      const t = n <= 1 ? 1 : 1 - i / (n - 1);
      ctx.fillStyle =
        i === 0 ? TOKENS.phosphorHot : blendAmber(TOKENS.phosphor, TOKENS.phosphorDim, 1 - t);
      const inset = i === 0 ? 1 : 2;
      ctx.fillRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2);
      if (i === 0) {
        ctx.fillStyle = TOKENS.ink;
        const d = this.logic.direction;
        const ex = d.x * 4;
        const ey = d.y * 4;
        ctx.fillRect(x + 6 + ex, y + 6 + ey, 3, 3);
        ctx.fillRect(x + CELL - 9 + ex, y + 6 + ey, 3, 3);
      }
    });

    drawText(ctx, "SNAKE", (COLS * CELL) / 2, ROWS * CELL - 4, {
      font: "10px Silkscreen, monospace",
      color: "rgba(255,176,0,0.25)",
      align: "center",
    });
  }
}

function blendAmber(hot: string, cold: string, t: number): string {
  const a = hexToRgb(hot);
  const b = hexToRgb(cold);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${mix(a.r, b.r)},${mix(a.g, b.g)},${mix(a.b, b.b)})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
