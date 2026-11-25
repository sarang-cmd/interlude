/**
 * ROCKFALL BELT — pure logic. Inertia flight, splitting rocks, wrap-around.
 * Unit-tested in tests/rockfall.test.ts.
 */
import { RNG } from "../../shared/rng";

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // radians, 0 = up
  thrusting: boolean;
  invulnerableUntil: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
}

export const ROCK_LARGE = 3;
export const ROCK_MEDIUM = 2;
export const ROCK_SMALL = 1;

export interface Asteroid {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 3 = large, 2 = medium, 1 = small */
  size: number;
  verts: number[];
  radius: number;
}

export interface ShieldPickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  taken: boolean;
}

export type RockfallEvent =
  | { kind: "shoot" }
  | { kind: "rockSplit"; x: number; y: number; size: number }
  | { kind: "rockDestroyed"; x: number; y: number; size: number }
  | { kind: "shipHit" }
  | { kind: "shieldSpawn"; x: number; y: number }
  | { kind: "shieldTake" }
  | { kind: "waveClear"; wave: number }
  | { kind: "gameOver" };

export const ROCK_RADIUS: Record<number, number> = { 3: 42, 2: 24, 1: 12 };
export const ROCK_SCORE: Record<number, number> = { 3: 20, 2: 50, 1: 100 };
const TURN_RATE = 3.4; // rad/s
const THRUST = 340; // px/s²
const DRAG = 0.35; // exponential damping per second
const MAX_SPEED = 420;
const BULLET_SPEED = 520;
const BULLET_TTL = 0.9;
const MAX_BULLETS = 6;
const SHIELD_DURATION = 5;

export class RockfallLogic {
  readonly width: number;
  readonly height: number;
  private rng: RNG;

  ship: Ship;
  bullets: Bullet[] = [];
  asteroids: Asteroid[] = [];
  shields: ShieldPickup[] = [];
  score = 0;
  lives = 3;
  wave = 1;
  alive = true;
  shieldUntil = 0;
  private time = 0;
  private nextId = 1;
  private fireCooldown = 0;

  constructor(options: { width?: number; height?: number; seed?: number } = {}) {
    this.width = options.width ?? 640;
    this.height = options.height ?? 360;
    this.rng = new RNG(options.seed ?? Date.now());
    this.ship = this.freshShip();
    this.spawnWave(1);
  }

  private freshShip(): Ship {
    return {
      x: this.width / 2,
      y: this.height / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      thrusting: false,
      invulnerableUntil: this.time + 2.5,
    };
  }

  /** Ship is shielded right now (spawn protection or pickup). */
  get shielded(): boolean {
    return this.time < this.shieldUntil || this.time < this.ship.invulnerableUntil;
  }

  private randomEdgePoint(): { x: number; y: number } {
    // Spawn on the perimeter, away from the ship.
    for (let attempt = 0; attempt < 12; attempt++) {
      const side = this.rng.int(0, 3);
      const p =
        side === 0 ? { x: this.rng.range(0, this.width), y: 0 }
        : side === 1 ? { x: this.rng.range(0, this.width), y: this.height }
        : side === 2 ? { x: 0, y: this.rng.range(0, this.height) }
        : { x: this.width, y: this.rng.range(0, this.height) };
      if (Math.hypot(p.x - this.ship.x, p.y - this.ship.y) > 180) return p;
    }
    return { x: 0, y: 0 };
  }

  private makeAsteroid(x: number, y: number, size: number, vx?: number, vy?: number): Asteroid {
    const speed = 40 + (4 - size) * 26 + this.wave * 8;
    const angle = this.rng.range(0, Math.PI * 2);
    const verts: number[] = [];
    const n = 9;
    for (let i = 0; i < n; i++) verts.push(0.72 + this.rng.next() * 0.45);
    return {
      id: this.nextId++,
      x,
      y,
      vx: vx ?? Math.cos(angle) * speed,
      vy: vy ?? Math.sin(angle) * speed,
      size,
      verts,
      radius: ROCK_RADIUS[size] ?? 20,
    };
  }

  spawnWave(wave: number): void {
    this.wave = wave;
    const count = 2 + wave;
    for (let i = 0; i < count; i++) {
      const p = this.randomEdgePoint();
      this.asteroids.push(this.makeAsteroid(p.x, p.y, ROCK_LARGE));
    }
  }

  rotate(direction: -1 | 1, dt: number): void {
    this.ship.angle += direction * TURN_RATE * dt;
  }

  setThrust(on: boolean): void {
    this.ship.thrusting = on;
  }

  /** Fire if off cooldown and under the bullet cap. */
  fire(): boolean {
    if (this.fireCooldown > 0 || this.bullets.length >= MAX_BULLETS) return false;
    this.fireCooldown = 0.16;
    const nx = Math.sin(this.ship.angle);
    const ny = -Math.cos(this.ship.angle);
    this.bullets.push({
      x: this.ship.x + nx * 14,
      y: this.ship.y + ny * 14,
      vx: this.ship.vx + nx * BULLET_SPEED,
      vy: this.ship.vy + ny * BULLET_SPEED,
      ttl: BULLET_TTL,
    });
    return true;
  }

  private wrap(x: number, y: number): { x: number; y: number } {
    return {
      x: (x + this.width) % this.width,
      y: (y + this.height) % this.height,
    };
  }

  update(dt: number): RockfallEvent[] {
    const events: RockfallEvent[] = [];
    if (!this.alive) return events;
    this.time += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    // Ship motion
    if (this.ship.thrusting) {
      this.ship.vx += Math.sin(this.ship.angle) * THRUST * dt;
      this.ship.vy -= Math.cos(this.ship.angle) * THRUST * dt;
    }
    const damp = Math.exp(-DRAG * dt);
    this.ship.vx *= damp;
    this.ship.vy *= damp;
    const speed = Math.hypot(this.ship.vx, this.ship.vy);
    if (speed > MAX_SPEED) {
      this.ship.vx = (this.ship.vx / speed) * MAX_SPEED;
      this.ship.vy = (this.ship.vy / speed) * MAX_SPEED;
    }
    const p = this.wrap(this.ship.x + this.ship.vx * dt, this.ship.y + this.ship.vy * dt);
    this.ship.x = p.x;
    this.ship.y = p.y;

    // Bullets
    for (const b of this.bullets) {
      const bp = this.wrap(b.x + b.vx * dt, b.y + b.vy * dt);
      b.x = bp.x;
      b.y = bp.y;
      b.ttl -= dt;
    }
    this.bullets = this.bullets.filter((b) => b.ttl > 0);

    // Asteroids drift
    for (const a of this.asteroids) {
      const ap = this.wrap(a.x + a.vx * dt, a.y + a.vy * dt);
      a.x = ap.x;
      a.y = ap.y;
    }

    // Shield pickups drift slowly
    for (const s of this.shields) {
      const sp = this.wrap(s.x + s.vx * dt, s.y + s.vy * dt);
      s.x = sp.x;
      s.y = sp.y;
      s.ttl -= dt;
    }
    this.shields = this.shields.filter((s) => s.ttl > 0 && !s.taken);

    // Bullet ↔ asteroid
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const bullet = this.bullets[bi]!;
      let consumed = false;
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const rock = this.asteroids[ai]!;
        if (Math.hypot(bullet.x - rock.x, bullet.y - rock.y) > rock.radius) continue;
        consumed = true;
        this.asteroids.splice(ai, 1);
        this.score += ROCK_SCORE[rock.size] ?? 0;
        // Split
        if (rock.size > ROCK_SMALL) {
          for (let k = 0; k < 2; k++) {
            const child = this.makeAsteroid(rock.x, rock.y, rock.size - 1);
            // children get a meaningful kick apart
            const kick = 0.6 + this.rng.next() * 0.8;
            child.vx = -rock.vx * kick + this.rng.range(-40, 40);
            child.vy = -rock.vy * kick + this.rng.range(-40, 40);
            this.asteroids.push(child);
          }
          // Large rocks sometimes drop a shield pickup
          if (rock.size === ROCK_LARGE && this.rng.chance(0.35)) {
            this.shields.push({
              x: rock.x,
              y: rock.y,
              vx: this.rng.range(-30, 30),
              vy: this.rng.range(-30, 30),
              ttl: 14,
              taken: false,
            });
            events.push({ kind: "shieldSpawn", x: rock.x, y: rock.y });
          }
          events.push({ kind: "rockSplit", x: rock.x, y: rock.y, size: rock.size });
        } else {
          events.push({ kind: "rockDestroyed", x: rock.x, y: rock.y, size: rock.size });
        }
        break;
      }
      if (consumed) this.bullets.splice(bi, 1);
    }

    // Ship ↔ shield pickup
    for (const s of this.shields) {
      if (s.taken) continue;
      if (Math.hypot(s.x - this.ship.x, s.y - this.ship.y) < 22) {
        s.taken = true;
        this.shieldUntil = this.time + SHIELD_DURATION;
        events.push({ kind: "shieldTake" });
      }
    }

    // Ship ↔ asteroid
    if (!this.shielded) {
      for (const rock of this.asteroids) {
        if (Math.hypot(rock.x - this.ship.x, rock.y - this.ship.y) < rock.radius + 10) {
          events.push({ kind: "shipHit" });
          this.lives -= 1;
          if (this.lives <= 0) {
            this.alive = false;
            events.push({ kind: "gameOver" });
          } else {
            this.ship = this.freshShip();
          }
          break;
        }
      }
    }

    // Wave cleared?
    if (this.asteroids.length === 0) {
      events.push({ kind: "waveClear", wave: this.wave });
      this.spawnWave(this.wave + 1);
    }

    return events;
  }
}
