/**
 * BREAKOUT — pure logic. Paddle physics, brick HP, power-ups, levels.
 * Unit-tested in tests/breakout.test.ts.
 */
import { RNG } from "../../shared/rng";

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  stuck: boolean;
}

export interface Brick {
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export type PowerUpKind = "wide" | "multi" | "slow";

export interface PowerUp {
  kind: PowerUpKind;
  x: number;
  y: number;
  vy: number;
  taken: boolean;
}

export type BreakoutEvent =
  | { kind: "paddleHit" }
  | { kind: "brickHit"; brick: Brick; destroyed: boolean; x: number; y: number }
  | { kind: "powerupDrop"; powerup: PowerUpKind; x: number; y: number }
  | { kind: "powerupTake"; powerup: PowerUpKind }
  | { kind: "ballLost" }
  | { kind: "levelClear"; level: number }
  | { kind: "gameOver" };

export interface BreakoutOptions {
  width?: number;
  height?: number;
  seed?: number;
  level?: number;
}

export const PADDLE_W_BASE = 92;
export const PADDLE_W_WIDE = 150;
export const PADDLE_H = 12;
export const PADDLE_Y = 322;
export const BRICK_COLS = 10;
export const BRICK_ROWS = 5;
export const BRICK_W = 56;
export const BRICK_H = 16;
export const BRICK_GAP = 4;
export const BRICK_TOP = 48;

export class BreakoutLogic {
  readonly width: number;
  readonly height: number;
  private rng: RNG;

  paddleX: number;
  paddleW = PADDLE_W_BASE;
  balls: Ball[] = [];
  bricks: Brick[] = [];
  powerups: PowerUp[] = [];
  level: number;
  score = 0;
  lives = 3;
  alive = true;
  private wideUntil = 0;
  private slowUntil = 0;
  private time = 0;

  constructor(options: BreakoutOptions = {}) {
    this.width = options.width ?? 640;
    this.height = options.height ?? 360;
    this.rng = new RNG(options.seed ?? Date.now());
    this.level = options.level ?? 1;
    this.paddleX = this.width / 2;
    this.buildLevel(this.level);
    this.serve();
  }

  /** Row patterns per level; hp scales with row from the bottom up. */
  private buildLevel(level: number): void {
    this.bricks = [];
    const gridW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP;
    const x0 = (this.width - gridW) / 2;
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        // Hollow/checker patterns on later levels.
        if (level >= 2 && (row + col) % 4 === 3) continue;
        if (level >= 3 && row === 0 && col % 2 === 0) continue;
        const hp = row < 1 + Math.min(2, level - 1) ? 3 : row < 3 ? 2 : 1;
        this.bricks.push({
          col,
          row,
          hp,
          maxHp: hp,
          alive: true,
        });
        void x0;
      }
    }
    this.brickX0 = x0;
    this.brickY0 = BRICK_TOP;
  }

  private brickX0 = 0;
  private brickY0 = BRICK_TOP;

  brickRect(brick: Brick): { x: number; y: number; w: number; h: number } {
    return {
      x: this.brickX0 + brick.col * (BRICK_W + BRICK_GAP),
      y: this.brickY0 + brick.row * (BRICK_H + BRICK_GAP),
      w: BRICK_W,
      h: BRICK_H,
    };
  }

  private serve(): void {
    this.balls = [
      {
        x: this.paddleX,
        y: PADDLE_Y - 8,
        vx: 0,
        vy: 0,
        r: 6,
        stuck: true,
      },
    ];
  }

  launch(): void {
    for (const ball of this.balls) {
      if (ball.stuck) {
        const angle = -Math.PI / 2 + this.rng.range(-0.4, 0.4);
        const speed = this.ballSpeed();
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.stuck = false;
      }
    }
  }

  private ballSpeed(): number {
    const slow = this.time < this.slowUntil ? 0.72 : 1;
    return Math.min(460, (250 + (this.level - 1) * 45) * slow);
  }

  movePaddleTo(x: number): void {
    const half = this.paddleW / 2;
    this.paddleX = Math.max(half, Math.min(this.width - half, x));
    for (const ball of this.balls) {
      if (ball.stuck) ball.x = this.paddleX;
    }
  }

  nudgePaddle(dx: number): void {
    this.movePaddleTo(this.paddleX + dx);
  }

  update(dt: number): BreakoutEvent[] {
    const events: BreakoutEvent[] = [];
    if (!this.alive) return events;
    this.time += dt;

    // Timed power-up expiry
    if (this.wideUntil !== 0 && this.time >= this.wideUntil) {
      this.paddleW = PADDLE_W_BASE;
      this.wideUntil = 0;
    }

    // Balls
    for (const ball of this.balls) {
      if (ball.stuck) continue;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Walls
      if (ball.x - ball.r < 0) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx);
      } else if (ball.x + ball.r > this.width) {
        ball.x = this.width - ball.r;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y - ball.r < 28) { // under the HUD strip
        ball.y = 28 + ball.r;
        ball.vy = Math.abs(ball.vy);
      }

      // Paddle
      const half = this.paddleW / 2;
      if (
        ball.vy > 0 &&
        ball.y + ball.r >= PADDLE_Y &&
        ball.y - ball.r <= PADDLE_Y + PADDLE_H &&
        Math.abs(ball.x - this.paddleX) <= half + ball.r
      ) {
        // Paddle-angle control: offset −1..1 → −60°..+60° from vertical.
        const offset = Math.max(-1, Math.min(1, (ball.x - this.paddleX) / half));
        const angle = -Math.PI / 2 + offset * (Math.PI / 3);
        const speed = Math.min(this.ballSpeed() * 1.06, 520);
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.y = PADDLE_Y - ball.r - 0.5;
        events.push({ kind: "paddleHit" });
      }

      // Bricks
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        const rect = this.brickRect(brick);
        if (
          ball.x + ball.r < rect.x ||
          ball.x - ball.r > rect.x + rect.w ||
          ball.y + ball.r < rect.y ||
          ball.y - ball.r > rect.y + rect.h
        ) {
          continue;
        }
        // Resolve along the axis of least penetration.
        const overlapX = Math.min(ball.x + ball.r - rect.x, rect.x + rect.w - (ball.x - ball.r));
        const overlapY = Math.min(ball.y + ball.r - rect.y, rect.y + rect.h - (ball.y - ball.r));
        if (overlapX < overlapY) ball.vx = ball.x < rect.x + rect.w / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
        else ball.vy = ball.y < rect.y + rect.h / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);

        brick.hp -= 1;
        const destroyed = brick.hp <= 0;
        if (destroyed) {
          brick.alive = false;
          this.score += 50 * this.level + 10 * brick.maxHp;
          // 18% drop chance
          if (this.rng.chance(0.18)) {
            const kind = this.rng.pick(["wide", "multi", "slow"] as const);
            this.powerups.push({ kind, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, vy: 130, taken: false });
            events.push({ kind: "powerupDrop", powerup: kind, x: rect.x + rect.w / 2, y: rect.y });
          }
        }
        events.push({ kind: "brickHit", brick, destroyed, x: ball.x, y: ball.y });
        break; // one brick per ball per step
      }
    }

    // Ball lost
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i] as Ball;
      if (ball.y - ball.r > this.height) {
        this.balls.splice(i, 1);
        events.push({ kind: "ballLost" });
      }
    }
    if (this.balls.length === 0) {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.alive = false;
        events.push({ kind: "gameOver" });
      } else {
        this.serve();
      }
    }

    // Power-ups fall
    for (const p of this.powerups) {
      if (p.taken) continue;
      p.y += p.vy * dt;
      const half = this.paddleW / 2;
      if (p.y >= PADDLE_Y && Math.abs(p.x - this.paddleX) <= half + 10) {
        p.taken = true;
        this.applyPowerUp(p.kind);
        events.push({ kind: "powerupTake", powerup: p.kind });
      } else if (p.y > this.height + 20) {
        p.taken = true;
      }
    }
    this.powerups = this.powerups.filter((p) => !p.taken);

    // Level clear?
    if (this.bricks.every((b) => !b.alive)) {
      events.push({ kind: "levelClear", level: this.level });
      this.level += 1;
      this.buildLevel(this.level);
      this.serve();
    }

    return events;
  }

  private applyPowerUp(kind: PowerUpKind): void {
    switch (kind) {
      case "wide":
        this.paddleW = PADDLE_W_WIDE;
        this.wideUntil = this.time + 12;
        break;
      case "slow":
        this.slowUntil = this.time + 8;
        for (const b of this.balls) {
          b.vx *= 0.72;
          b.vy *= 0.72;
        }
        break;
      case "multi": {
        const source = this.balls[0];
        if (source) {
          const speed = Math.max(this.ballSpeed(), Math.hypot(source.vx, source.vy));
          for (const angle of [-0.5, 0.5]) {
            const base = Math.atan2(source.vy, source.vx) + angle;
            this.balls.push({
              x: source.x,
              y: source.y,
              vx: Math.cos(base) * speed,
              vy: Math.sin(base) * speed,
              r: 6,
              stuck: false,
            });
          }
        }
        break;
      }
    }
  }
}
