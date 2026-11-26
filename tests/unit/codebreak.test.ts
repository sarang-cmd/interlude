// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Input, type GameAction } from "../../src/engine/input";
import { CodebreakGame } from "../../src/games/codebreak/game";
import { CodebreakLocalGame } from "../../src/games/codebreak/codebreak.2p";
import { codeFeedback, parseCode } from "../../src/games/codebreak/logic";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function setup() {
  const input = new Input();
  input.setEnabled(true);
  const ctx = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const context = {
    width: 640,
    height: 360,
    ctx,
    input,
    rng: new RNG(3),
    settings: { ...DEFAULT_SETTINGS },
    sound: { play: vi.fn() },
    announce: vi.fn(),
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  const press = (game: CodebreakGame, action: GameAction) => {
    input.virtualDown(action, "test");
    input.virtualUp(action, "test");
    game.fixedUpdate(0.02);
  };
  return {
    context,
    ctx,
    press,
    status: () => vi.mocked(context.announce!).mock.lastCall?.[0] ?? "",
  };
}
describe("CODEBREAK", () => {
  it("validates codes and scores duplicate digits without double-counting", () => {
    expect(parseCode("1234")).toEqual([1, 2, 3, 4]);
    expect(parseCode("0123")).toBeNull();
    expect(parseCode("12345")).toBeNull();
    expect(codeFeedback([1, 1, 2, 2], [1, 2, 1, 1])).toEqual({ exact: 1, misplaced: 2 });
    expect(codeFeedback([1, 2, 3, 4], [4, 3, 2, 1])).toEqual({ exact: 0, misplaced: 4 });
    expect(codeFeedback([1, 1, 1, 1], [1, 1, 1, 1])).toEqual({ exact: 4, misplaced: 0 });
    expect(codeFeedback([1, 2, 3, 4], [5, 5, 5, 5])).toEqual({ exact: 0, misplaced: 0 });
  });
  it("does not expose a solo secret in the announcement", () => {
    const { context, status, press } = setup();
    const game = new CodebreakGame();
    game.init(context);
    expect(status()).toContain("Current guess 1111");
    press(game, "primary");
    expect(status()).toContain("exact");
    expect(status()).toContain("misplaced");
  });
  it("accepts a private code, covers the hand-off and ends without recording a solo score", () => {
    const { context, ctx, press, status } = setup();
    const game = new CodebreakLocalGame();
    const refresh = vi.fn();
    game.onNeedsSecret = refresh;
    game.init(context);
    expect(game.needsSecret).toBe(true);
    expect(game.setSecret("7777")).toBe(false);
    expect(game.setSecret("2222")).toBe(true);
    expect(game.needsSecret).toBe(false);
    expect(status()).toContain("privacy screen");
    expect(status()).not.toContain("2222");
    press(game, "primary");
    expect(status()).toContain("Current guess 1111");
    expect(status()).not.toContain("2222");
    game.suspend();
    expect(status()).toContain("privacy screen");
    expect(ctx.fillRect).toHaveBeenCalled();
    press(game, "primary");
    for (let i = 0; i < 4; i++) {
      press(game, "up");
      if (i < 3) press(game, "right");
    }
    press(game, "primary");
    expect(status()).toContain("4 exact");
    expect(status()).toContain("CODE CRACKED");
    expect(game.recordsAllowed).toBe(false);
    expect(context.reportGameOver).toHaveBeenCalledOnce();
    game.destroy();
    game.init(context);
    expect(game.needsSecret).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });
});
