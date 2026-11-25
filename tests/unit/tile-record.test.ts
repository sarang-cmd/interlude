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
