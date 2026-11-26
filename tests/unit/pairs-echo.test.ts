// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Input, type GameAction } from "../../src/engine/input";
import { EchoGame } from "../../src/games/echo/game";
import { EchoLocalGame } from "../../src/games/echo/echo.2p";
import { ECHO_ACTIONS } from "../../src/games/echo/display";
import { PairsBoard } from "../../src/games/pairs/logic";
import { pairsStatus } from "../../src/games/pairs/display";
import { PairsLocalGame } from "../../src/games/pairs/pairs.2p";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function setup(seed = 4) {
  const input = new Input();
  input.setEnabled(true);
  const context = {
    width: 640,
    height: 360,
    input,
    rng: new RNG(seed),
    settings: { ...DEFAULT_SETTINGS },
    sound: { play: vi.fn() },
    announce: vi.fn(),
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  return { input, context, status: () => vi.mocked(context.announce!).mock.lastCall?.[0] ?? "" };
}
function press(game: { fixedUpdate(dt: number): void }, input: Input, action: GameAction): void {
  input.virtualDown(action, "test");
  input.virtualUp(action, "test");
  game.fixedUpdate(0.02);
}

describe("PAIRS", () => {
  it("shuffles eight pairs, conceals unflipped cards, and blocks a mismatch until hidden", () => {
    const board = new PairsBoard(new RNG(22));
    expect(new Set(board.cards).size).toBe(8);
    for (const symbol of new Set(board.cards))
      expect(board.cards.filter((item) => item === symbol)).toHaveLength(2);
    expect(pairsStatus(board, 0)).not.toMatch(/[A-H] matched/);
    expect(board.flip(0)).toBe("first");
    expect(board.flip(0)).toBe("invalid");
    const different = board.cards.findIndex((card) => card !== board.cards[0]);
    expect(board.flip(different)).toBe("miss");
    expect(board.flip(2)).toBe("invalid");
    board.hideMismatch();
    expect(board.faceUp).toEqual([]);
    const match = board.cards.findIndex((card, index) => index > 0 && card === board.cards[0]);
    expect(board.flip(0)).toBe("first");
    expect(board.flip(match)).toBe("match");
    expect(board.pairs).toBe(1);
    expect(board.flip(0)).toBe("invalid");
  });
  it("awards the current player a point and another turn, switching after a miss", () => {
    const { input, context, status } = setup(11);
    const arrangement = new PairsBoard(new RNG(11)).cards;
    const game = new PairsLocalGame();
    game.init(context);
    let cursor = 0;
    const goto = (target: number) => {
      while (Math.floor(cursor / 4) < Math.floor(target / 4)) {
        press(game, input, "down");
        cursor += 4;
      }
      while (Math.floor(cursor / 4) > Math.floor(target / 4)) {
        press(game, input, "up");
        cursor -= 4;
      }
      while (cursor % 4 < target % 4) {
        press(game, input, "right");
        cursor++;
      }
      while (cursor % 4 > target % 4) {
        press(game, input, "left");
        cursor--;
      }
    };
    const match = arrangement.findIndex((card, index) => index > 0 && card === arrangement[0]);
    press(game, input, "primary");
    goto(match);
    press(game, input, "primary");
    expect(status()).toContain("PLAYER 1 1, PLAYER 2 0");
    expect(status()).toContain("PLAYER 1 turn");
    const first = arrangement.findIndex((_, index) => index !== 0 && index !== match);
    const second = arrangement.findIndex(
      (card, index) => index !== 0 && index !== match && card !== arrangement[first],
    );
    goto(first);
    press(game, input, "primary");
    goto(second);
    press(game, input, "primary");
    expect(status()).toContain("Not a pair");
    expect(status()).toContain("PLAYER 2 turn");
    game.fixedUpdate(1.3);
    expect(status()).toContain("Cards hidden again");
    expect(game.recordsAllowed).toBe(false);
  });
});

describe("ECHO", () => {
  it("plays a seeded sequence and ends on the wrong response", () => {
    const { input, context, status } = setup(7);
    const game = new EchoGame();
    game.init(context);
    const first = new RNG(7).int(0, 3);
    game.fixedUpdate(0.8);
    expect(status()).toContain("Your turn");
    press(game, input, ECHO_ACTIONS[first]!);
    expect(game.score).toBe(100);
    game.fixedUpdate(1.5);
    expect(status()).toContain("Repeat 2 signals");
    press(game, input, ECHO_ACTIONS[(first + 1) % 4]!);
    expect(status()).toContain("Run over");
    expect(context.reportGameOver).toHaveBeenCalledOnce();
  });
  it("alternates repeating and extending, awarding the other player a win on a mistake", () => {
    const { input, context, status } = setup();
    const game = new EchoLocalGame();
    game.init(context);
    press(game, input, "up");
    expect(status()).toContain("Player 2, repeat 0 of 1");
    press(game, input, "up");
    expect(status()).toContain("Player 2, add a signal");
    press(game, input, "right");
    expect(status()).toContain("Player 1, repeat 0 of 2");
    press(game, input, "up");
    expect(status()).toContain("1 of 2");
    press(game, input, "left");
    expect(status()).toContain("PLAYER 2 WINS");
    expect(game.recordsAllowed).toBe(false);
    expect(context.reportGameOver).toHaveBeenCalledOnce();
  });
});
