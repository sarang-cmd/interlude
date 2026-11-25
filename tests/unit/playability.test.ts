import { describe, expect, it } from "vitest";
import { BIRD_X, FlappyLogic } from "../../src/games/flappy/logic";
import { DashlineLogic } from "../../src/games/dashline/logic";
import { PongLogic } from "../../src/games/pong/logic";

const STEP = 1 / 60;
describe("seeded playable patterns", () => {
  it("the Pong AI only re-aims on its reaction ticks", () => {
    const game = new PongLogic({ seed: 1, difficulty: "regular" });
    game.update(1); // serve
    game.aiY = 151; // centered at its initial target
    game.ball = { x: 320, y: 60, vx: 300, vy: 0 };
    game.update(0.1);
    expect(game.aiY).toBeCloseTo(151);
    game.update(0.11);
    expect(game.aiY).toBeLessThan(151);
  });
  it("a bounded-speed player can beat the regular Pong AI in a short five-point match", () => {
    for (const seed of [1, 2, 4]) {
      const game = new PongLogic({ seed, difficulty: "regular", firstTo: 5 });
      let time = 0;
      while (game.alive && time < 90) {
        const target = game.ball.y - 42 + (game.ball.vx < 0 ? 35 : 0);
        const delta = target - game.playerY;
        game.nudgePlayer(Math.sign(delta) * Math.min(Math.abs(delta), 380 * STEP));
        game.update(STEP); time += STEP;
      }
      expect(game.winner, `seed ${seed}`).toBe("player");
      expect(time).toBeGreaterThan(20); expect(time).toBeLessThan(90);
    }
  });
  it("Flapper's seeded pipe sequences can be flown with a human-rate tap cadence", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const game = new FlappyLogic({ seed });
      let time = 0, cooldown = 0;
      while (game.alive && time < 30) {
        const target = game.pipes.find((pipe) => pipe.x + 52 >= BIRD_X - 5)?.gapY ?? 180;
        if (cooldown <= 0 && game.birdY > target + 20 && game.birdVy > -80) { game.flap(); cooldown = 0.24; }
        game.update(STEP); time += STEP; cooldown -= STEP;
      }
      expect(game.alive, `seed ${seed}`).toBe(true);
      expect(game.score).toBeGreaterThan(15);
    }
  });
  it("runner patterns remain jumpable across seeds", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const game = new DashlineLogic({ seed });
      let time = 0, held = 0;
      while (game.alive && time < 35) {
        const next = game.obstacles.find((o) => o.x + o.width >= game.playerX - 10);
        if (next && !next.flying && game.grounded && (next.x - game.playerX) / game.speed < 0.25) { game.queueJump(); held = 0.2; }
        game.update(STEP, held > 0); time += STEP; held -= STEP;
      }
      expect(game.alive, `seed ${seed}`).toBe(true);
      expect(game.score).toBeGreaterThan(200);
    }
  });
});
