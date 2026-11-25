/**
 * PONG — pure logic. Beatable AI, rally speed ramp, first to N.
 * Unit-tested in tests/pong.test.ts.
 */
import { RNG } from "../../shared/rng";
import {
  AdaptiveDifficulty,
  AI_PROFILES,
  aimError,
  ReactionClock,
  type AIDifficulty,
} from "../../ai/difficulty";

export type PongDifficulty = AIDifficulty;

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

/** Paddle-specific movement and aim. Reaction cadence comes from the shared AI profile. */
const AI_MODEL: Record<PongDifficulty, { maxSpeed: number; error: number }> = {
  rookie: { maxSpeed: 210, error: 46 },
  easy: { maxSpeed: 245, error: 36 },
  regular: { maxSpeed: 280, error: 28 },
  hard: { maxSpeed: 310, error: 22 },
  veteran: { maxSpeed: 330, error: 18 },
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
  adaptive: boolean;
  watch: boolean;
  alive = true;
  winner: "player" | "ai" | null = null;
  private readonly adaptiveAI: AdaptiveDifficulty;
  private adaptiveBase: PongDifficulty;
  private aiErrorOffset = 0;
  private readonly aiClock = new ReactionClock();
  private readonly playerBotClock = new ReactionClock();
  private aiTargetY = 0;
  private playerBotTargetY = 0;
  private serveTimer = 0;
  private serveDir: 1 | -1 = 1;

  constructor(
    options: {
      width?: number;
      height?: number;
      seed?: number;
      difficulty?: PongDifficulty;
      firstTo?: number;
      adaptive?: boolean;
      watch?: boolean;
    } = {},
  ) {
    this.width = options.width ?? 640;
    this.height = options.height ?? 360;
    this.rng = new RNG(options.seed ?? Date.now());
    this.difficulty = options.difficulty ?? "regular";
    this.adaptiveBase = this.difficulty;
    this.adaptiveAI = new AdaptiveDifficulty(this.difficulty);
    this.adaptive = options.adaptive ?? false;
    this.watch = options.watch ?? false;
    this.firstTo = options.firstTo ?? 5;
    this.playerY = this.height / 2 - PADDLE_H / 2;
    this.aiY = this.height / 2 - PADDLE_H / 2;
    this.aiTargetY = FIELD_TOP + (this.height - FIELD_TOP) / 2;
    this.playerBotTargetY = this.aiTargetY;
    this.serve(this.rng.chance(0.5) ? 1 : -1);
  }

  get isServing(): boolean {
    return this.serveTimer > 0;
  }

  get effectiveDifficulty(): PongDifficulty {
    return this.adaptive ? this.adaptiveAI.level : this.difficulty;
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
    this.aiClock.reset();
    this.playerBotClock.reset();
    this.aiTargetY = FIELD_TOP + (this.height - FIELD_TOP) / 2;
    this.playerBotTargetY = this.aiTargetY;
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
    if (this.adaptiveBase !== this.difficulty) {
      this.adaptiveBase = this.difficulty;
      this.adaptiveAI.reset(this.difficulty);
    }

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

    // Sample the ball only on a reaction tick, then commit to the target.
    const level = this.effectiveDifficulty;
    const model = AI_MODEL[level];
    if (this.aiClock.tick(dt, AI_PROFILES[level].reactionSeconds)) {
      this.aiErrorOffset = aimError(this.rng, model.error);
      this.aiTargetY =
        this.ball.vx > 0
          ? this.ball.y + this.aiErrorOffset
          : FIELD_TOP + (this.height - FIELD_TOP) / 2;
    }
    this.aiY = this.moveBot(this.aiY, this.aiTargetY, model.maxSpeed, dt);

    if (this.watch) {
      const leftModel = AI_MODEL[this.difficulty];
      if (this.playerBotClock.tick(dt, AI_PROFILES[this.difficulty].reactionSeconds)) {
        this.playerBotTargetY =
          this.ball.vx < 0
            ? this.ball.y + aimError(this.rng, leftModel.error)
            : FIELD_TOP + (this.height - FIELD_TOP) / 2;
      }
      this.playerY = this.moveBot(this.playerY, this.playerBotTargetY, leftModel.maxSpeed, dt);
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
      if (this.adaptive) this.adaptiveAI.record("loss");
      events.push({ kind: "score", side: "ai" });
      this.afterPoint(-1);
    } else if (this.ball.x - BALL_R > this.width) {
      this.playerScore += 1;
      if (this.adaptive) this.adaptiveAI.record("win");
      events.push({ kind: "score", side: "player" });
      this.afterPoint(1);
    }
    if (!this.alive) {
      events.push({ kind: "matchOver", side: this.playerScore > this.aiScore ? "player" : "ai" });
    }

    return events;
  }

  private moveBot(y: number, target: number, speed: number, dt: number): number {
    const delta = target - (y + PADDLE_H / 2);
    if (Math.abs(delta) <= 2) return y;
    const next = y + Math.sign(delta) * Math.min(Math.abs(delta), speed * dt);
    return Math.max(FIELD_TOP, Math.min(this.height - PADDLE_H, next));
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
