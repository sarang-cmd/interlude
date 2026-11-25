import { describe, expect, it, vi } from "vitest";
import { PongLogic } from "../../src/games/pong/logic";
import { PongGame } from "../../src/games/pong/game";
import type { GameContext } from "../../src/games/types";
import { Input } from "../../src/engine/input";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function context(watch = false): GameContext {
  return {
    width: 640,
    height: 360,
    rng: new RNG(3),
    input: new Input(),
    settings: { ...DEFAULT_SETTINGS, pongWatch: watch, pongFirstTo: 1 },
    sound: { play: vi.fn() },
    shake: vi.fn(),
    scorePop: vi.fn(),
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
}

describe("Pong AI", () => {
  it("moves the watched paddle and replays a bot match from a seed", () => {
    const a = new PongLogic({ seed: 88, watch: true, firstTo: 3 });
    const b = new PongLogic({ seed: 88, watch: true, firstTo: 3 });
    for (let step = 0; step < 60 * 30; step++) {
      a.update(1 / 60);
      b.update(1 / 60);
    }
    expect({
      ball: a.ball,
      left: a.playerY,
      right: a.aiY,
      score: [a.playerScore, a.aiScore],
    }).toEqual({
      ball: b.ball,
      left: b.playerY,
      right: b.aiY,
      score: [b.playerScore, b.aiScore],
    });
    const bot = new PongLogic({ seed: 3, watch: true });
    bot.update(1);
    bot.ball = { x: 200, y: 60, vx: -200, vy: 0 };
    const before = bot.playerY;
    bot.update(0.21);
    expect(bot.playerY).toBeLessThan(before);
  });

  it("raises the adaptive opponent after three consecutive player points", () => {
    const game = new PongLogic({ seed: 3, adaptive: true, firstTo: 11, difficulty: "regular" });
    for (let index = 0; index < 3; index++) {
      game.update(1);
      game.ball = { x: 660, y: 200, vx: 300, vy: 0 };
      game.update(0.01);
    }
    expect(game.playerScore).toBe(3);
    expect(game.effectiveDifficulty).toBe("hard");
    game.difficulty = "easy";
    game.update(0.01);
    expect(game.effectiveDifficulty).toBe("easy");
  });

  it("never marks an automated or partly automated run eligible for records", () => {
    const watched = new PongGame();
    const watchedContext = context(true);
    watched.init(watchedContext);
    expect(watched.recordsAllowed).toBe(false);
    const human = new PongGame();
    const humanContext = context(false);
    human.init(humanContext);
    expect(human.recordsAllowed).toBe(true);
    humanContext.settings.pongWatch = true;
    human.fixedUpdate(0.01);
    humanContext.settings.pongWatch = false;
    human.fixedUpdate(0.01);
    expect(human.recordsAllowed).toBe(false);
    human.init(humanContext);
    expect(human.recordsAllowed).toBe(true);
    const forcedWatch = new PongGame(true);
    forcedWatch.init(context(false));
    expect(forcedWatch.recordsAllowed).toBe(false);
  });
});
