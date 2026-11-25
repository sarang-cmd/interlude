// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Input } from "../../src/engine/input";
import type { ArcadeGame, GameContext } from "../../src/games/types";
import type { SnakeLogic } from "../../src/games/snake/logic";
import type { BreakoutLogic } from "../../src/games/breakout/logic";
import type { FlappyLogic } from "../../src/games/flappy/logic";
import type { Game2048 } from "../../src/games/2048/logic";
import type { BlockfallLogic } from "../../src/games/blockfall/logic";
import type { RockfallLogic } from "../../src/games/rockfall/logic";
import type { DashlineLogic } from "../../src/games/dashline/logic";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";
import { loadLocalGame } from "../../src/twoplayer/registry";
import type { RaceGameId } from "../../src/twoplayer/race-settings";
import type { SplitRaceGame } from "../../src/twoplayer/split-race";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function setup<T>(id: RaceGameId) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    imageSmoothingEnabled: false,
  } as unknown as CanvasRenderingContext2D);
  const canvas = document.createElement("canvas");
  const input = new Input();
  input.attach(canvas, () => ({ x: 0, y: 0 }));
  input.setEnabled(true);
  const game = (await loadLocalGame(id, "local")) as SplitRaceGame;
  const ctx = {
    canvas,
    width: 640,
    height: 360,
    input,
    rng: new RNG(1),
    settings: { ...DEFAULT_SETTINGS },
    sound: { play: vi.fn() },
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  game.init(ctx);
  const players = (game as unknown as { players: Array<{ game: ArcadeGame & { logic: T } }> })
    .players;
  return {
    game,
    left: players[0]!.game.logic,
    right: players[1]!.game.logic,
    close: () => {
      game.destroy();
      input.detach();
    },
  };
}

it("drives both Snake games with independent simultaneous directions", async () => {
  const { game, left, right, close } = await setup<SnakeLogic>("snake");
  expect(left.food).toEqual(right.food);
  game.setControl(0, "up", true, "left-test");
  game.setControl(1, "down", true, "right-test");
  game.fixedUpdate(0.16);
  expect(left.direction).toEqual({ x: 0, y: -1 });
  expect(right.direction).toEqual({ x: 0, y: 1 });
  close();
});

it("launches both shared Breakout games", async () => {
  const { game, left, right, close } = await setup<BreakoutLogic>("breakout");
  expect(left.balls[0]!.stuck).toBe(true);
  game.setControl(0, "primary", true, "left-test");
  game.setControl(1, "primary", true, "right-test");
  game.fixedUpdate(0.016);
  expect(left.balls[0]!.stuck).toBe(false);
  expect(right.balls[0]!.stuck).toBe(false);
  close();
});

it("flaps both birds against the same seeded pipe sequence", async () => {
  const { game, left, right, close } = await setup<FlappyLogic>("flappy");
  expect(left.pipes).toEqual(right.pipes);
  const y = left.birdY;
  game.setControl(0, "primary", true, "left-test");
  game.setControl(1, "primary", true, "right-test");
  game.fixedUpdate(0.016);
  expect(left.birdY).toBeLessThan(y);
  expect(right.birdY).toBeLessThan(y);
  close();
});

it("moves two identical 2048 openings independently", async () => {
  const { game, left, right, close } = await setup<Game2048>("twenty48");
  expect(left.grid).toEqual(right.grid);
  game.setControl(0, "left", true, "left-test");
  game.setControl(1, "right", true, "right-test");
  game.fixedUpdate(0.016);
  expect(left.grid).not.toEqual(right.grid);
  close();
});

it("moves two Blockfall pieces and keeps their seeded queues aligned", async () => {
  const { game, left, right, close } = await setup<BlockfallLogic>("blockfall");
  expect(left.peekQueue(3)).toEqual(right.peekQueue(3));
  expect(left.active?.kind).toBe(right.active?.kind);
  game.setControl(0, "left", true, "left-test");
  game.setControl(1, "right", true, "right-test");
  game.fixedUpdate(0.016);
  expect(left.active!.x).toBeLessThan(right.active!.x);
  close();
});

it("fires both Rockfall ships", async () => {
  const { game, left, right, close } = await setup<RockfallLogic>("rockfall");
  game.setControl(0, "primary", true, "left-test");
  game.setControl(1, "primary", true, "right-test");
  game.fixedUpdate(0.016);
  expect(left.bullets.length).toBeGreaterThan(0);
  expect(right.bullets.length).toBeGreaterThan(0);
  close();
});

it("jumps both Dashline runners", async () => {
  const { game, left, right, close } = await setup<DashlineLogic>("dashline");
  const y = left.playerY;
  game.setControl(0, "primary", true, "left-test");
  game.setControl(1, "primary", true, "right-test");
  game.fixedUpdate(0.016);
  expect(left.playerY).toBeLessThan(y);
  expect(right.playerY).toBeLessThan(y);
  close();
});
