import { afterEach, expect, it, vi } from "vitest";
import { Game2048Game } from "../../src/games/2048/game";
import { Game2048 } from "../../src/games/2048/logic";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS, loadHighScores } from "../../src/shared/storage";

afterEach(() => vi.unstubAllGlobals());
it("records the best tile as soon as it is earned, including before game-over", async () => {
  const store: Record<string, unknown> = {};
  vi.stubGlobal("chrome", { storage: { local: {
    get: async (key: string) => ({ [key]: structuredClone(store[key]) }),
    set: async (values: Record<string, unknown>) => { Object.assign(store, structuredClone(values)); },
  } } });
  const context = { rng: new RNG(8), settings: DEFAULT_SETTINGS, sound: { play() {} }, scorePop() {}, particles: { burst() {} }, shake() {}, hitStop() {} } as unknown as GameContext;
  const game = new Game2048Game(); game.init(context);
  const internal = game as unknown as { logic: Game2048; move(direction: "left"): void };
  internal.logic.grid = [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  internal.logic.bestTile = 2;
  internal.move("left");
  expect(internal.logic.alive).toBe(true);
  await vi.waitFor(async () => expect((await loadHighScores())["twenty48:tile"]).toBe(4));
});

it("2048 time attack ends once at its limit and can be disabled", async () => {
  const { Input } = await import("../../src/engine/input");
  const report = vi.fn(async () => {});
  const context = { rng: new RNG(8), settings: { ...DEFAULT_SETTINGS, twenty48Seconds: 2 }, input: new Input(), sound: { play() {} }, scorePop() {}, particles: { burst() {} }, shake() {}, hitStop() {}, reportGameOver: report } as unknown as GameContext;
  const timed = new Game2048Game(); timed.init(context);
  timed.fixedUpdate(1); expect(report).not.toHaveBeenCalled();
  timed.fixedUpdate(1); timed.fixedUpdate(1); expect(report).toHaveBeenCalledTimes(1);
  const unlimited = new Game2048Game();
  unlimited.init({ ...context, settings: { ...DEFAULT_SETTINGS, twenty48Seconds: 0 } });
  unlimited.fixedUpdate(200); expect(report).toHaveBeenCalledTimes(1);
});
