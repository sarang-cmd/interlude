import { describe, expect, it } from "vitest";
import { RNG } from "../../src/shared/rng";
import { SnakeLogic } from "../../src/games/snake/logic";
import { BreakoutLogic, PADDLE_Y, PADDLE_W_WIDE } from "../../src/games/breakout/logic";
import { FlappyLogic, FLAP_VELOCITY } from "../../src/games/flappy/logic";
import { Game2048 } from "../../src/games/2048/logic";
import { PongLogic } from "../../src/games/pong/logic";
import { BlockfallLogic, ROWS, COLS } from "../../src/games/blockfall/logic";
import { RockfallLogic } from "../../src/games/rockfall/logic";
import { DashlineLogic, GROUND_Y } from "../../src/games/dashline/logic";

describe("seeded games", () => {
  it("replays a seed identically", () => { const a = new RNG(42), b = new RNG(42); expect([a.next(), a.int(1, 9), a.next()]).toEqual([b.next(), b.int(1, 9), b.next()]); });
  it("snake queues valid turns, rejects reversals, grows and wraps", () => {
    const s = new SnakeLogic({ cols: 8, rows: 8, seed: 4, wrap: true });
    s.food = { x: 5, y: 4 }; s.setDirection({ x: -1, y: 0 });
    s.update(0.16); expect(s.snake[0]).toEqual({ x: 5, y: 4 }); expect(s.score).toBe(10); expect(s.snake).toHaveLength(4);
    s.setDirection({ x: 0, y: -1 }); s.setDirection({ x: -1, y: 0 });
    s.update(0.16); expect(s.direction).toEqual({ x: 0, y: -1 });
    s.update(0.16); expect(s.direction).toEqual({ x: -1, y: 0 });
    const w = new SnakeLogic({ cols: 8, rows: 8, seed: 2, wrap: true });
    w.snake = [{ x: 7, y: 2 }, { x: 6, y: 2 }, { x: 5, y: 2 }]; w.food = { x: 1, y: 1 };
    w.update(0.16); expect(w.snake[0]).toEqual({ x: 0, y: 2 }); expect(w.alive).toBe(true);
  });
  it("breakout reflects paddle shots and applies falling power-ups", () => {
    const b = new BreakoutLogic({ seed: 2 });
    b.balls = [{ x: b.paddleX + 30, y: PADDLE_Y - 7, vx: 0, vy: 200, r: 6, stuck: false }];
    expect(b.update(0.02).some((event) => event.kind === "paddleHit")).toBe(true);
    expect(b.balls[0]!.vy).toBeLessThan(0); expect(b.balls[0]!.vx).toBeGreaterThan(0);
    b.powerups.push({ kind: "wide", x: b.paddleX, y: PADDLE_Y - 1, vy: 130, taken: false });
    b.update(0.02); expect(b.paddleW).toBe(PADDLE_W_WIDE);
    b.powerups.push({ kind: "multi", x: b.paddleX, y: PADDLE_Y - 1, vy: 130, taken: false });
    b.update(0.02); expect(b.balls.length).toBe(3);
  });
  it("flapper gives an immediate impulse and keeps consecutive gaps reachable", () => {
    const f = new FlappyLogic({ seed: 7 }); f.flap(); expect(f.birdVy).toBe(FLAP_VELOCITY);
    expect(Math.abs(f.pipes[1]!.gapY - f.pipes[0]!.gapY)).toBeLessThanOrEqual(120);
    f.birdY = 349; f.birdVy = 500; expect(f.update(0.02).some((e) => e.kind === "hit")).toBe(true); expect(f.alive).toBe(false);
  });
  it("2048 merges once, animates source destinations and spends finite undo", () => {
    const g = new Game2048({ seed: 3, undoLimit: 1 });
    g.grid = [[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    const move = g.move("left"); expect(g.score).toBe(8); expect(g.grid[0]!.slice(0, 2)).toEqual([4, 4]); expect(move.tiles).toHaveLength(4);
    const first = g.grid.map((row) => [...row]); expect(g.undo()).toBe(true); expect(g.undoRemaining).toBe(0);
    g.move("left"); expect(g.grid).toEqual(first); expect(g.undo()).toBe(false);
  });
  it("pong accelerates on paddle contact and ends at the configured score", () => {
    const p = new PongLogic({ seed: 2, firstTo: 1 }); p.update(1);
    p.ball = { x: 22, y: p.playerY + 50, vx: -300, vy: 0 };
    expect(p.update(0.01).some((e) => e.kind === "paddleHit")).toBe(true); expect(p.rallySpeed).toBeGreaterThan(300);
    p.ball = { x: 650, y: 200, vx: 300, vy: 0 };
    expect(p.update(0.02).some((e) => e.kind === "matchOver")).toBe(true); expect(p.winner).toBe("player");
  });
  it("blockfall has a seven-bag, finite hold, SRS wall kicks, ghost and multi-line clear", () => {
    const g = new BlockfallLogic({ seed: 5 });
    const kinds = [g.active!.kind, ...g.peekQueue(6)]; expect(new Set(kinds).size).toBe(7);
    expect(g.hold().length).toBeGreaterThan(0); expect(g.hold()).toEqual([]);
    g.active = { kind: "T", rotation: 1, x: -1, y: 5 };
    expect(g.rotate(-1).some((e) => e.kind === "rotate")).toBe(true); expect(g.active.x).toBe(0);
    g.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    for (const row of [ROWS - 2, ROWS - 1]) for (let col = 0; col < COLS; col++) if (col !== 4 && col !== 5) g.board[row]![col] = 1;
    g.active = { kind: "O", rotation: 0, x: 4, y: 0 };
    expect(g.ghostY()).toBe(ROWS - 2);
    const events = g.hardDrop(); expect(events.find((e) => e.kind === "lineClear")?.lines).toBe(2);
    expect(g.board.every((row) => row.every((v) => v === 0))).toBe(true);
  });
  it("blockfall honors lock delay", () => {
    const g = new BlockfallLogic({ seed: 1 }); g.active = { kind: "O", rotation: 0, x: 4, y: ROWS - 2 };
    expect(g.update(0.49)).toEqual([]); expect(g.update(0.02).some((e) => e.kind === "lock")).toBe(true);
  });
  it("rockfall splits rocks, scores and wraps the ship", () => {
    const g = new RockfallLogic({ seed: 5 });
    g.asteroids = [{ id: 1, x: 50, y: 50, vx: 0, vy: 0, size: 3, verts: [1, 1, 1], radius: 42 }];
    g.bullets = [{ x: 50, y: 50, vx: 0, vy: 0, ttl: 1 }];
    const events = g.update(0); expect(events.some((e) => e.kind === "rockSplit")).toBe(true); expect(g.asteroids).toHaveLength(2); expect(g.score).toBe(20);
    g.ship.x = 639; g.ship.vx = 200; g.update(0.05); expect(g.ship.x).toBeLessThan(20);
  });
  it("runner jump height responds to hold and collision ends the run", () => {
    const held = new DashlineLogic({ seed: 1 }), tapped = new DashlineLogic({ seed: 1 });
    held.queueJump(); tapped.queueJump();
    for (let i = 0; i < 12; i++) { held.update(1 / 60, true); tapped.update(1 / 60, false); }
    expect(held.playerY).toBeLessThan(tapped.playerY);
    const g = new DashlineLogic({ seed: 1 });
    g.obstacles = [{ id: 1, x: 100, width: 30, height: 50, flying: false, passed: false }];
    g.playerY = GROUND_Y; expect(g.update(0.001, false).some((e) => e.kind === "hit")).toBe(true);
  });
});
