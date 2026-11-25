/**
 * SNAKE — pure logic. No DOM, no canvas. Unit-tested in tests/snake.test.ts.
 *
 * Grid movement with queued turns, speed ramp, bonus food.
 * Wrap mode (setting) lets the snake pass through walls.
 */
import { RNG } from "../../shared/rng";

export interface Cell {
  x: number;
  y: number;
}

export interface BonusFood {
  cell: Cell;
  /** Ticks remaining before it despawns. */
  ttl: number;
}

export type SnakeEvent =
  | { kind: "eat"; at: Cell; bonus: boolean }
  | { kind: "bonusSpawn"; at: Cell }
  | { kind: "bonusExpire" }
  | { kind: "die"; cause: "wall" | "self" };

export interface SnakeOptions {
  cols?: number;
  rows?: number;
  wrap?: boolean;
  seed?: number;
}

const BASE_INTERVAL = 0.15; // seconds per step at start
const MIN_INTERVAL = 0.055;
const RAMP_PER_FOOD = 0.0045;
const BONUS_TTL_TICKS = 40;
const BONUS_EVERY = 4; // bonus check every N foods

export class SnakeLogic {
  readonly cols: number;
  readonly rows: number;
  wrap: boolean;

  snake: Cell[] = [];
  previousSnake: Cell[] = [];
  direction: Cell = { x: 1, y: 0 };
  private queue: Cell[] = [];
  food: Cell = { x: 0, y: 0 };
  bonus: BonusFood | null = null;
  score = 0;
  foodsEaten = 0;
  alive = true;
  private rng: RNG;
  private stepTimer = 0;

  constructor(options: SnakeOptions = {}) {
    this.cols = options.cols ?? 32;
    this.rows = options.rows ?? 18;
    this.wrap = options.wrap ?? false;
    this.rng = new RNG(options.seed ?? Date.now());
    this.reset();
  }

  reset(): void {
    const midX = Math.floor(this.cols / 2);
    const midY = Math.floor(this.rows / 2);
    this.snake = [
      { x: midX, y: midY },
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY },
    ];
    this.previousSnake = this.snake.map((cell) => ({ ...cell }));
    this.direction = { x: 1, y: 0 };
    this.queue = [];
    this.food = this.spawnFood();
    this.bonus = null;
    this.score = 0;
    this.foodsEaten = 0;
    this.alive = true;
    this.stepTimer = 0;
  }

  /** Seconds between grid steps for the current speed. */
  get stepInterval(): number {
    return Math.max(MIN_INTERVAL, BASE_INTERVAL - this.foodsEaten * RAMP_PER_FOOD);
  }

  /** Progress between the previous and current grid positions. */
  movementProgress(alpha = 0): number {
    return Math.max(0, Math.min(1, (this.stepTimer + alpha / 60) / this.stepInterval));
  }

  /** Queue a direction change. Reversals and duplicates are rejected. */
  setDirection(dir: Cell): void {
    const last = this.queue[this.queue.length - 1] ?? this.direction;
    if (dir.x === -last.x && dir.y === -last.y) return; // no 180s
    if (dir.x === last.x && dir.y === last.y) return;
    if (this.queue.length >= 3) return; // small buffer, no input spam
    this.queue.push({ ...dir });
  }

  private spawnFood(): Cell {
    return this.freeCell();
  }

  private freeCell(): Cell {
    const occupied = new Set(this.snake.map((s) => `${s.x},${s.y}`));
    if (this.bonus) occupied.add(`${this.bonus.cell.x},${this.bonus.cell.y}`);
    const free: Cell[] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) return { x: 0, y: 0 }; // board full — win state-ish
    return this.rng.pick(free);
  }

  /** Advance timers; returns events that fired. */
  update(dt: number): SnakeEvent[] {
    const events: SnakeEvent[] = [];
    if (!this.alive) return events;

    // Bonus TTL counts in real time so waiting for it is a real decision.
    if (this.bonus) {
      this.bonus.ttl -= dt / this.stepInterval;
      if (this.bonus.ttl <= 0) {
        this.bonus = null;
        events.push({ kind: "bonusExpire" });
      }
    }

    this.stepTimer += dt;
    while (this.stepTimer >= this.stepInterval && this.alive) {
      this.stepTimer -= this.stepInterval;
      events.push(...this.step());
    }
    return events;
  }

  private step(): SnakeEvent[] {
    const events: SnakeEvent[] = [];
    const next = this.queue.shift();
    if (next) this.direction = next;

    this.previousSnake = this.snake.map((cell) => ({ ...cell }));
    const head = this.snake[0] as Cell;
    let nx = head.x + this.direction.x;
    let ny = head.y + this.direction.y;

    if (this.wrap) {
      nx = (nx + this.cols) % this.cols;
      ny = (ny + this.rows) % this.rows;
    } else if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
      this.alive = false;
      events.push({ kind: "die", cause: "wall" });
      return events;
    }

    const eating = nx === this.food.x && ny === this.food.y;
    const eatingBonus =
      this.bonus !== null && nx === this.bonus.cell.x && ny === this.bonus.cell.y;

    // Self collision: the tail cell will move away unless we're growing.
    const body = eating || eatingBonus ? this.snake : this.snake.slice(0, -1);
    if (body.some((s) => s.x === nx && s.y === ny)) {
      this.alive = false;
      events.push({ kind: "die", cause: "self" });
      return events;
    }

    this.snake.unshift({ x: nx, y: ny });

    if (eating) {
      this.foodsEaten += 1;
      this.score += 10;
      events.push({ kind: "eat", at: { x: nx, y: ny }, bonus: false });
      this.food = this.spawnFood();
      // Every N foods, offer a bonus cherry if none is active.
      if (this.foodsEaten % BONUS_EVERY === 0 && !this.bonus) {
        const cell = this.freeCell();
        // Don't spawn the bonus on the fresh food cell.
        if (!(cell.x === this.food.x && cell.y === this.food.y)) {
          this.bonus = { cell, ttl: BONUS_TTL_TICKS };
          events.push({ kind: "bonusSpawn", at: { ...cell } });
        }
      }
    } else if (eatingBonus) {
      this.foodsEaten += 1;
      this.score += 30;
      events.push({ kind: "eat", at: { x: nx, y: ny }, bonus: true });
      this.bonus = null;
    } else {
      this.snake.pop();
    }

    return events;
  }
}
