/**
 * PONG — pure logic. Beatable AI, rally speed ramp, first to N.
 * Unit-tested in tests/pong.test.ts.
 */
import { RNG } from "../../shared/rng";

export type PongDifficulty = "rookie" | "regular" | "veteran";

export interface PongEvent {
  kind: "paddleHit" | "score" | "wallBounce" | "matchOver";
  side?: "player" | "ai";
}

const PADDLE_W = 10;
const PADDLE_H = 84;
const BALL_R = 6;
const FIELD_TOP = 26;
const RALLY_SPEEDUP = 1.045;
const MAX_BALL_SPEED = 640;
const SERVE_SPEED = 300;

/** AI model: max tracking speed + aim error in px per difficulty. */
const AI_MODEL: Record<PongDifficulty, { maxSpeed: number; error: number; reactDelay: number }> = {
  rookie: { maxSpeed: 210, error: 46, reactDelay: 0.32 },
  regular: { maxSpeed: 280, error: 28, reactDelay: 0.2 },
  veteran: { maxSpeed: 330, error: 18, reactDelay: 0.16 },
};

export class PongLogic {
  readonly width: number;
  readonly height: number;
  private rng: RNG;

  ball = { x: 320, y: 190, vx: 300, vy: 120 };
  playerY = 200;
  aiY = 160;
  playerScore = 0;
  aiScore = 0;
  rallyHits = 0;
  firstTo: number;
  difficulty: PongDifficulty;
  alive = true;
  winner: "player" | "ai" | null = null;
  private aiErrorOffset = 0;
  private aiReactTimer = 0;
  private aiTargetY = 0;
  private serveTimer = 0;
  private serveDir: 1 | -1 = 1;

  constructor(
    options: {
      width?: number;
      height?: number;
      seed?: number;
      difficulty?: PongDifficulty;
      firstTo?: number;
    } = {},
  ) {
    this.width = options.width ?? 640;
    this.height = options.height ?? 360;
    this.rng = new RNG(options.seed ?? Date.now());
    this.difficulty = options.difficulty ?? "regular";
    this.firstTo = options.firstTo ?? 5;
    this.playerY = this.height / 2 - PADDLE_H / 2;
    this.aiY = this.height / 2 - PADDLE_H / 2;
    this.aiTargetY = FIELD_TOP + (this.height - FIELD_TOP) / 2;
    this.serve(this.rng.chance(0.5) ? 1 : -1);
  }

  get isServing(): boolean {
    return this.serveTimer > 0;
  }

  private serve(direction: 1 | -1): void {
    this.serveDir = direction;
    this.serveTimer = 0.9;
    this.ball.x = this.width / 2;
    this.ball.y = FIELD_TOP + (this.height - FIELD_TOP) / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.rallyHits = 0;
    this.aiErrorOffset = this.rng.range(-1, 1);
    this.aiReactTimer = 0;
    this.aiTargetY = FIELD_TOP + (this.height - FIELD_TOP) / 2;
  }

  movePlayer(y: number): void {
    this.playerY = Math.max(FIELD_TOP, Math.min(this.height - PADDLE_H, y));
  }

  nudgePlayer(dy: number): void {
    this.movePlayer(this.playerY + dy);
  }

  update(dt: number): PongEvent[] {
    if (!this.alive) return [];
    const events: PongEvent[] = [];

    // Serve countdown
    if (this.serveTimer > 0) {
      this.serveTimer -= dt;
      if (this.serveTimer <= 0) {
        const angle = this.rng.range(-Math.PI / 5, Math.PI / 5);
        this.ball.vx = Math.cos(angle) * SERVE_SPEED * this.serveDir;
        this.ball.vy = Math.sin(angle) * SERVE_SPEED;
      }
      return events;
    }

    // ---- AI ----
    const model = AI_MODEL[this.difficulty];
    this.aiReactTimer += dt;
    if (this.aiReactTimer >= model.reactDelay) {
      this.aiReactTimer = 0;
      this.aiErrorOffset = this.rng.range(-1, 1) * model.error;
      // Sample the ball only on a reaction tick, then commit to that target.
      // Updating a random error on a timer while tracking every frame makes
      // the hard opponent unrealistically perfect.
      this.aiTargetY =
        this.ball.vx > 0
          ? this.ball.y + this.aiErrorOffset
          : FIELD_TOP + (this.height - FIELD_TOP) / 2;
    }
    const aiCenter = this.aiY + PADDLE_H / 2;
    const delta = this.aiTargetY - aiCenter;
    const maxStep = model.maxSpeed * dt;
    if (Math.abs(delta) > 2) {
      this.aiY += Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
      this.aiY = Math.max(FIELD_TOP, Math.min(this.height - PADDLE_H, this.aiY));
    }

    // ---- Ball ----
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    // Top/bottom walls
    if (this.ball.y - BALL_R < FIELD_TOP) {
      this.ball.y = FIELD_TOP + BALL_R;
      this.ball.vy = Math.abs(this.ball.vy);
      events.push({ kind: "wallBounce" });
    } else if (this.ball.y + BALL_R > this.height) {
      this.ball.y = this.height - BALL_R;
      this.ball.vy = -Math.abs(this.ball.vy);
      events.push({ kind: "wallBounce" });
    }

    // Player paddle (left)
    if (
      this.ball.vx < 0 &&
      this.ball.x - BALL_R <= PADDLE_W + 6 &&
      this.ball.x - BALL_R >= 0 &&
      this.ball.y >= this.playerY - BALL_R &&
      this.ball.y <= this.playerY + PADDLE_H + BALL_R
    ) {
      this.bounceOff(this.playerY + PADDLE_H / 2, 1, events);
    }

    // AI paddle (right)
    if (
      this.ball.vx > 0 &&
      this.ball.x + BALL_R >= this.width - PADDLE_W - 6 &&
      this.ball.x + BALL_R <= this.width &&
      this.ball.y >= this.aiY - BALL_R &&
      this.ball.y <= this.aiY + PADDLE_H + BALL_R
    ) {
      this.bounceOff(this.aiY + PADDLE_H / 2, -1, events);
    }

    // Scoring
    if (this.ball.x + BALL_R < 0) {
      this.aiScore += 1;
      events.push({ kind: "score", side: "ai" });
      this.afterPoint(-1);
    } else if (this.ball.x - BALL_R > this.width) {
      this.playerScore += 1;
      events.push({ kind: "score", side: "player" });
      this.afterPoint(1);
    }
    if (!this.alive) {
      events.push({ kind: "matchOver", side: this.playerScore > this.aiScore ? "player" : "ai" });
    }

    return events;
  }

  private bounceOff(paddleCenter: number, direction: 1 | -1, events: PongEvent[]): void {
    const half = PADDLE_H / 2;
    const offset = Math.max(-1, Math.min(1, (this.ball.y - paddleCenter) / half));
    const speed = Math.min(MAX_BALL_SPEED, Math.hypot(this.ball.vx, this.ball.vy) * RALLY_SPEEDUP);
    const angle = offset * (Math.PI / 3.2); // ±~56°
    this.ball.vx = Math.cos(angle) * speed * direction;
    this.ball.vy = Math.sin(angle) * speed;
    this.ball.x = direction === 1 ? PADDLE_W + 6 + BALL_R : this.width - PADDLE_W - 6 - BALL_R;
    this.rallyHits += 1;
    events.push({ kind: "paddleHit" });
  }

  private afterPoint(directionToward: 1 | -1): void {
    if (this.playerScore >= this.firstTo || this.aiScore >= this.firstTo) {
      this.alive = false;
      this.winner = this.playerScore > this.aiScore ? "player" : "ai";
      return;
    }
    // Concede serve to the player who was scored on? Classic: loser serves.
    this.serve(directionToward);
  }

  get rallySpeed(): number {
    return Math.hypot(this.ball.vx, this.ball.vy);
  }
}
