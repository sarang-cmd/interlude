// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Input } from "../../src/engine/input";
import { QuickDrawGame } from "../../src/games/quickdraw/game";
import { QuickDrawDuelGame } from "../../src/games/quickdraw/quickdraw.2p";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function setup(seed = 7) {
  const canvas = document.createElement("canvas");
  const input = new Input();
  input.setEnabled(true);
  const context = {
    width: 640,
    height: 360,
    canvas,
    input,
    rng: new RNG(seed),
    settings: { ...DEFAULT_SETTINGS },
    sound: { play: vi.fn() },
    announce: vi.fn(),
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  return { context, input, status: () => vi.mocked(context.announce!).mock.lastCall?.[0] ?? "" };
}
function fire(input: Input, game: QuickDrawGame): void {
  input.virtualDown("primary", "test");
  input.virtualUp("primary", "test");
  game.fixedUpdate(0.02);
}
describe("QUICK DRAW", () => {
  it("rejects false starts, including none from the starting key", () => {
    const { context, input, status } = setup();
    input.virtualDown("primary", "start");
    const game = new QuickDrawGame();
    game.init(context);
    game.fixedUpdate(0.02);
    input.virtualUp("primary", "start");
    game.fixedUpdate(0.02);
    expect(context.reportGameOver).not.toHaveBeenCalled();
    fire(input, game);
    expect(status()).toContain("FALSE START");
    expect(game.score).toBe(0);
    expect(context.reportGameOver).toHaveBeenCalledOnce();
  });
  it("reports a reaction in game-time milliseconds after the cue", () => {
    const { context, input, status } = setup();
    const game = new QuickDrawGame();
    game.init(context);
    game.fixedUpdate(0.02);
    const cue = new RNG(7).range(2, 5);
    game.fixedUpdate(cue);
    expect(status()).toContain("GO!");
    game.fixedUpdate(0.2);
    fire(input, game);
    expect(game.resultLabel).toBe("200 MS");
    expect(game.score).toBe(4000);
  });
  it("duel punishes early draws, honors pause, and routes distinct F/J keys", () => {
    const { context, status } = setup();
    const game = new QuickDrawDuelGame();
    game.init(context);
    game.fixedUpdate(0.01);
    game.draw(1);
    expect(status()).toContain("PLAYER 2 WINS");
    expect(status()).toContain("FALSE START");
    expect(game.recordsAllowed).toBe(false);
    game.destroy();
    context.rng.setState(new RNG(7).getState());
    game.init(context);
    game.fixedUpdate(0.01);
    game.fixedUpdate(new RNG(7).range(2, 5));
    expect(status()).toContain("GO!");
    game.suspend();
    game.draw(1);
    expect(game.resultLabel).toBeUndefined();
    game.fixedUpdate(0.1);
    context.canvas.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", bubbles: true }));
    expect(status()).toContain("PLAYER 2 WINS");
    game.destroy();
  });
});
