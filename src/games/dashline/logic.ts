/**
 * DASHLINE — pure logic for the one-button runner.
 * Jump height scales with hold time (coyote time + input buffer included).
 * Unit-tested in tests/dashline.test.ts.
 */
import { RNG } from "../../shared/rng";

export interface Obstacle {
  id: number;
  x: number;
  width: number;
  /** Height of the obstacle from the ground. */
  height: number;
  /** Flying obstacles have a y above the ground. */
  flying: boolean;
  passed: boolean;
}

export type DashlineEvent =
  | { kind: "jump" }
  | { kind: "land" }
  | { kind: "pass"; x: number }
  | { kind: "hit" };

export interface DashlineOptions {
  width?: number;
  height?: number;
  seed?: number;
}

export const GROUND_Y = 296;
const GRAVITY_HOLD = 2600; // while held and rising — floatier
const GRAVITY_RELEASE = 4200; // released or falling — snappier
const JUMP_VELOCITY = -880;
const MAX_FALL = 1250;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;
const START_SPEED = 240;
const MAX_SPEED = 560;
const SPEED_RAMP = 6.5; // px/s gained per second survived

/** Obstacle pattern table — picked with fairness constraints. */
const PATTERNS: Array<{ width: number; height: number; flying: boolean }> = [
  { width: 26, height: 34, flying: false }, // single block
  { width: 34, height: 46, flying: false }, // tall block
  { width: 52, height: 26, flying: false }, // wide hurdle
  { width: 22, height: 30, flying: true }, // flyer — must NOT jump
  { width: 30, height: 58, flying: false }, // pillar — needs full hold
];

export class DashlineLogic {
  readonly width: number;
  readonly height: number;
  private rng: RNG;

  playerY = GROUND_Y;
  playerVy = 0;
  grounded = true;
  speed = START_SPEED;
  distance = 0;
  score = 0;
  alive = true;
  obstacles: Obstacle[] = [];
  private nextId = 1;
  private spawnTimer = 0.8;
  private coyote = 0;
  private buffer = 0;
  private airTime = 0;

  constructor(options: DashlineOptions = {}) {
    this.width = options.width ?? 640;
    this.height = options.height ?? 360;
    this.rng = new RNG(options.seed ?? Date.now());
  }

  get runSpeed(): number {
    return this.speed;
  }

  /** Queue a jump — call on press edge. Consumed by update(). */
  queueJump(): void {
    this.buffer = JUMP_BUFFER;
  }

  update(dt: number, jumpHeld: boolean): DashlineEvent[] {
    const events: DashlineEvent[] = [];
    if (!this.alive) return events;

    this.time += dt;
    this.speed = Math.min(MAX_SPEED, START_SPEED + this.time * SPEED_RAMP);
    this.distance += this.speed * dt;
    this.score = Math.floor(this.distance / 40);

    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt);

    // Jump consume — buffered + coyote-friendly
    if (this.buffer > 0 && (this.grounded || this.coyote > 0)) {
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.playerVy = JUMP_VELOCITY;
      this.airTime = 0;
      events.push({ kind: "jump" });
    }

    // Variable-height gravity: lighter on the way up while held
    const rising = this.playerVy < 0;
    const gravity = rising && jumpHeld ? GRAVITY_HOLD : GRAVITY_RELEASE;
    this.playerVy = Math.min(MAX_FALL, this.playerVy + gravity * dt);
    const wasAirborne = !this.grounded;
    this.playerY += this.playerVy * dt;
    if (this.playerY >= GROUND_Y) {
      if (wasAirborne && this.airTime > 0.05) events.push({ kind: "land" });
      this.playerY = GROUND_Y;
      this.playerVy = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
    }

    // Spawn obstacles — min gap scales with current speed
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const pattern = this.pickPattern();
      this.obstacles.push({
        id: this.nextId++,
        x: this.width + 20,
        width: pattern.width,
        height: pattern.height,
        flying: pattern.flying,
        passed: false,
      });
      // Gap in px = distance traveled between spawns; scales with speed
      const minGap = Math.max(210, this.speed * 0.85);
      const jitter = this.rng.range(0, Math.max(40, this.speed * 0.35 - 120));
      this.spawnTimer = (minGap + jitter) / this.speed;
    }

    // Move + recycle
    for (const o of this.obstacles) {
      o.x -= this.speed * dt;
      if (!o.passed && o.x + o.width < this.playerX) {
        o.passed = true;
        events.push({ kind: "pass", x: o.x + o.width });
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.x + o.width > -10);

    // Collision — AABB, hitbox slightly forgiving (inset 5px)
    const px = this.playerX;
    const pTop = this.playerY - 34;
    const pBottom = this.playerY;
    for (const o of this.obstacles) {
      // The drone is drawn at ground-84 with an 18px body and a 3px bob.
      // Keep its collision envelope aligned with that silhouette, not with
      // invisible extra space above and below it.
      const oTop = o.flying ? GROUND_Y - 87 : GROUND_Y - o.height;
      const oBottom = o.flying ? GROUND_Y - 63 : GROUND_Y;
      const overlapX = px + 12 > o.x + 5 && px - 12 < o.x + o.width - 5;
      const overlapY = pBottom > oTop + 4 && pTop < oBottom - 4;
      if (overlapX && overlapY) {
        this.alive = false;
        events.push({ kind: "hit" });
        return events;
      }
    }

    return events;
  }

  private time = 0;

  get playerX(): number {
    return 110;
  }

  private pickPattern(): { width: number; height: number; flying: boolean } {
    const index = this.rng.int(0, PATTERNS.length - 1);
    return PATTERNS[index] as { width: number; height: number; flying: boolean };
  }
}
