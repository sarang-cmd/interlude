// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseHand } from "../../src/ai/hand-signals";
import { Input } from "../../src/engine/input";
import { HandSignalsGame } from "../../src/games/handsignals/game";
import { LocalHandSignalsGame } from "../../src/games/handsignals/handsignals.2p";
import { EXTENDED_SIGNALS, handOutcome, handSignals } from "../../src/games/handsignals/logic";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

afterEach(() => document.body.replaceChildren());

describe("HAND SIGNALS", () => {
  it("has symmetric outcomes and two wins for each signal in the extended rules", () => {
    for (const first of EXTENDED_SIGNALS) {
      expect(handOutcome(first, first)).toBe(0);
      expect(EXTENDED_SIGNALS.filter((second) => handOutcome(first, second) === 1)).toHaveLength(2);
      for (const second of EXTENDED_SIGNALS)
        expect(handOutcome(first, second) + handOutcome(second, first)).toBe(0);
    }
    expect(handSignals(false)).toEqual(["rock", "paper", "scissors"]);
    expect(handOutcome("rock", "lizard")).toBe(1);
    expect(handOutcome("spock", "rock")).toBe(1);
  });
  it("CPU only uses previous moves and respects the enabled signal set", () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(handSignals(false)).toContain(
        chooseHand(["rock", "lizard"], false, "veteran", new RNG(seed)),
      );
      expect(handSignals(true)).toContain(
        chooseHand(["rock", "rock", "rock"], true, "veteran", new RNG(seed)),
      );
    }
    const counter = Array.from({ length: 1000 }, (_, seed) =>
      chooseHand(Array(10).fill("rock"), false, "veteran", new RNG(seed + 1)),
    );
    expect(counter.filter((choice) => choice === "paper").length).toBeGreaterThan(700);
  });
  function setup() {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const input = new Input();
    input.setEnabled(true);
    const ctx = {
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const context = {
      width: 640,
      height: 360,
      canvas,
      ctx,
      input,
      rng: new RNG(7),
      settings: { ...DEFAULT_SETTINGS },
      sound: { play: vi.fn() },
      announce: vi.fn(),
      reportGameOver: vi.fn(async () => {}),
    } as unknown as GameContext;
    const press = (game: HandSignalsGame | LocalHandSignalsGame, action: "primary" | "right") => {
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
  it("plays classic and restarts when optional rules change", () => {
    const { context, press, status } = setup();
    const game = new HandSignalsGame();
    game.init(context);
    expect(status()).toContain("Classic three signals");
    press(game, "primary");
    expect(status()).toContain("YOU chose ROCK. CPU chose");
    context.settings.handLizardSpock = true;
    game.settingsChanged();
    expect(status()).toContain("Rules changed");
    expect(status()).toContain("Lizard Spock is on");
    for (let i = 0; i < 4; i++) press(game, "right");
    expect(status()).toContain("Selected SPOCK");
    press(game, "primary");
    expect(status()).toContain("YOU chose SPOCK");
  });
  it("keeps the first signal hidden from the second player until both commit", () => {
    const { context, ctx, press, status } = setup();
    const game = new LocalHandSignalsGame();
    game.init(context);
    expect(status()).toContain("PLAYER 1");
    press(game, "primary");
    press(game, "right");
    expect(status()).toContain("Selected PAPER");
    press(game, "primary");
    expect(status()).toContain("PLAYER 2");
    expect(status()).not.toContain("PAPER");
    press(game, "primary");
    expect(status()).not.toContain("PAPER");
    game.suspend();
    expect(status()).toContain("privacy screen");
    expect(ctx.fillRect).toHaveBeenCalled();
    press(game, "primary");
    press(game, "primary");
    expect(status()).toContain("PLAYER 1 PAPER");
    expect(status()).toContain("PLAYER 2 ROCK");
    expect(status()).toContain("PLAYER 1 WINS ROUND");
    expect(game.recordsAllowed).toBe(false);
  });
});
