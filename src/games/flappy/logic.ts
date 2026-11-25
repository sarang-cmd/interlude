/**
 * FLAPPY-STYLE — pure logic. Tuned gravity/flap, fair pipe generation.
 * Unit-tested in tests/flappy.test.ts.
 */
import { RNG } from "../../shared/rng";

export interface Pipe {
  x: number;
  gapY: number;
  gapH: number;
  passed: boolean;
}

export type FlappyEvent =
  | { kind: "flap" }
  | { kind: "score"; x: number }
  | { kind: "hit" };

export interface FlappyOptions {
  width?: number;
  height?: number;
  seed?: number;
}

export const GRAVITY = 1500; // px/s²
export const FLAP_VELOCITY = -430; // px/s
export const MAX_FALL = 640; // px/s
export const PIPE_SPEED = 132; // px/s, ramps with score
export const PIPE_SPACING = 215;
export const GAP_START = 128;
export const GAP_MIN = 96;
export const BIRD_X = 150;
export const BIRD_R = 11;

export class FlappyLogic {
  readonly width: number;
  readonly height: number;
  private rng: RNG;

  birdY: number;
  birdVy = 0;
  pipes: Pipe[] = [];
  score = 0;
  alive = true;
  private lastGapY = 0;

  constructor(options: FlappyOptions = {}) {
    this.width = options.width ?? 640;
    this.height = options.height ?? 360;
    this.rng = new RNG(options.seed ?? Date.now());
    this.birdY = this.height / 2;
    this.lastGapY = this.height / 2;
    // Pre-seed two pipes so the run starts readable.
    this.spawnPipe(this.width * 0.72);
    this.spawnPipe(this.width * 0.72 + PIPE_SPACING);
  }

  private pipeSpeed(): number {
    return Math.min(215, PIPE_SPEED + this.score * 4.5);
  }

  private gapHeight(): number {
    return Math.max(GAP_MIN, GAP_START - this.score * 2);
  }

  /** Gap center — clamped so consecutive gaps stay physically reachable. */
  private nextGapY(): number {
    const gap = this.gapHeight();
    const margin = gap / 2 + 34;
    const maxDelta = 120; // fairness rule: gap moves at most ±120 px per pipe
    const lo = Math.max(margin, this.lastGapY - maxDelta);
    const hi = Math.min(this.height - margin, this.lastGapY + maxDelta);
    const y = this.rng.range(lo, hi);
    this.lastGapY = y;
    return y;
  }

  private spawnPipe(atX: number): void {
    this.pipes.push({ x: atX, gapY: this.nextGapY(), gapH: this.gapHeight(), passed: false });
  }

  flap(): void {
    if (!this.alive) return;
    this.birdVy = FLAP_VELOCITY;
  }

  /** One fixed step. */
  update(dt: number): FlappyEvent[] {
    const events: FlappyEvent[] = [];
    if (!this.alive) return events;

    // Bird physics — slight gravity softening near the top keeps taps from feeling dead.
    this.birdVy = Math.min(MAX_FALL, this.birdVy + GRAVITY * dt);
    this.birdY += this.birdVy * dt;

    // Ceiling and floor
    if (this.birdY < BIRD_R + 26) {
      this.birdY = BIRD_R + 26;
      this.birdVy = Math.max(this.birdVy, 40);
    }
    if (this.birdY > this.height - BIRD_R - 14) {
      this.birdY = this.height - BIRD_R - 14;
      this.alive = false;
      events.push({ kind: "hit" });
      return events;
    }

    // Pipes
    const speed = this.pipeSpeed();
    for (const pipe of this.pipes) {
      pipe.x -= speed * dt;

      // Scoring
      if (!pipe.passed && pipe.x + 52 < BIRD_X) {
        pipe.passed = true;
        this.score += 1;
        events.push({ kind: "score", x: BIRD_X });
      }

      // Collision — rect vs circle, inflated slightly for fairness in the player's favor
      const pipeW = 52;
      const withinX = BIRD_X + BIRD_R - 3 > pipe.x && BIRD_X - BIRD_R + 3 < pipe.x + pipeW;
      if (withinX) {
        const gapTop = pipe.gapY - pipe.gapH / 2;
        const gapBottom = pipe.gapY + pipe.gapH / 2;
        if (this.birdY - BIRD_R + 3 < gapTop || this.birdY + BIRD_R - 3 > gapBottom) {
          this.alive = false;
          events.push({ kind: "hit" });
          return events;
        }
      }
    }

    // Recycle off-screen pipes
    this.pipes = this.pipes.filter((p) => p.x > -70);

    // Maintain spacing — one new pipe when the trailing pipe crosses the right edge
    const rightmost = this.pipes.reduce((m, p) => Math.max(m, p.x), Number.NEGATIVE_INFINITY);
    if (Number.isFinite(rightmost) ? rightmost <= this.width : true) {
      this.spawnPipe(Number.isFinite(rightmost) ? rightmost + PIPE_SPACING : this.width);
    }

    return events;
  }
}
