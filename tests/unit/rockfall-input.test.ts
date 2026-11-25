import { expect, it, vi } from "vitest";
import { Input } from "../../src/engine/input";
import { RockfallGame } from "../../src/games/rockfall/game";
import { RockfallLogic } from "../../src/games/rockfall/logic";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

it("holding fire repeats on cooldown without requiring key-repeat events", () => {
  const input = new Input();
  input.setEnabled(true);
  const play = vi.fn();
  const ctx = {
    rng: new RNG(4),
    settings: DEFAULT_SETTINGS,
    input,
    sound: { play },
    particles: { burst() {} },
    scorePop() {},
    shake() {},
    hitStop() {},
    reportGameOver: async () => {},
  } as unknown as GameContext;
  const game = new RockfallGame();
  game.init(ctx);
  input.virtualDown("primary");
  for (let frame = 0; frame < 60; frame++) game.fixedUpdate(1 / 60);
  expect(play.mock.calls.filter(([name]) => name === "blip").length).toBeGreaterThanOrEqual(4);
  input.virtualUp("primary");
});

it("reports the original impact point before the ship respawns", () => {
  const game = new RockfallLogic({ seed: 1 });
  game.ship.x = 120;
  game.ship.y = 70;
  game.ship.invulnerableUntil = 0;
  game.asteroids = [
    { id: 100, x: 120, y: 70, vx: 0, vy: 0, size: 1, verts: [1, 1, 1], radius: 12 },
  ];
  expect(game.update(0)).toContainEqual({ kind: "shipHit", x: 120, y: 70 });
  expect(game.ship.x).toBe(320);
});
