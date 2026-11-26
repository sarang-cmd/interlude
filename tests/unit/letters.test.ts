// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Input, type GameAction } from "../../src/engine/input";
import { LettersGame } from "../../src/games/letters/game";
import { LettersLocalGame } from "../../src/games/letters/letters.2p";
import { mountWordLists } from "../../src/games/letters/list-ui";
import {
  GENERAL_WORDS,
  STUDY_WORDS,
  isWordSolved,
  maskedWord,
  normalizeWord,
  parseWordList,
} from "../../src/games/letters/logic";
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
    rng: new RNG(12),
    settings: { ...DEFAULT_SETTINGS },
    sound: { play: vi.fn() },
    announce: vi.fn(),
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  const press = (game: LettersGame, action: GameAction): void => {
    input.virtualDown(action, "test");
    input.virtualUp(action, "test");
    game.fixedUpdate(0.02);
  };
  return {
    context,
    ctx,
    input,
    press,
    status: () => vi.mocked(context.announce!).mock.lastCall?.[0] ?? "",
  };
}

describe("LETTERS word lists and rules", () => {
  it("validates and normalizes ASCII words, bounds pasted lists, and deduplicates", () => {
    expect(normalizeWord("  oRbIt  ")).toBe("ORBIT");
    expect(normalizeWord("A".repeat(24))).toBe("A".repeat(24));
    for (const bad of [
      "",
      "a",
      "A".repeat(25),
      "two words",
      "O-NE",
      "A1",
      "café",
      "maß",
      "ßß",
      "ıi",
    ]) {
      expect(normalizeWord(bad)).toBeNull();
    }
    expect(parseWordList(" orbit, STAR\nplanet;orbit\r\nstar ")).toEqual([
      "ORBIT",
      "STAR",
      "PLANET",
    ]);
    expect(parseWordList("word, bad word")).toBeNull();
    expect(parseWordList(" , \n ")).toBeNull();
    expect(parseWordList(Array(100).fill("word").join(","))).toEqual(["WORD"]);
    expect(parseWordList(Array(101).fill("word").join(","))).toBeNull();
    expect(parseWordList(" ".repeat(4001))).toBeNull();
    for (const list of [GENERAL_WORDS, STUDY_WORDS]) {
      expect(list.length).toBeGreaterThan(20);
      expect(new Set(list).size).toBe(list.length);
      for (const word of list) expect(normalizeWord(word)).toBe(word);
    }
  });
  it("reveals every occurrence and solves only when all distinct letters are guessed", () => {
    expect(maskedWord("BANANA", new Set(["A", "N"]))).toBe("_ A N A N A");
    expect(isWordSolved("BANANA", new Set(["A", "N"]))).toBe(false);
    expect(isWordSolved("BANANA", new Set(["A", "N", "B"]))).toBe(true);
    expect(isWordSolved("", new Set())).toBe(false);
  });
  it("does not interpret the starting key as the first guess", () => {
    const { context, input, press, status } = setup();
    const game = new LettersGame();
    game.init(context);
    game.setWordSource("custom", "BEE");
    input.virtualDown("primary", "start");
    game.init(context); // Engine restart occurs while the starting key is held.
    game.fixedUpdate(0.02);
    input.virtualUp("primary", "start");
    game.fixedUpdate(0.02);
    expect(status()).toContain("6 guesses left");
    expect(status()).toContain("Guessed: none");
    press(game, "primary");
    expect(status()).toContain("A: not in the word");
    expect(status()).toContain("5 guesses left");
  });
  it("discards a starting press even if it was released before the run begins", () => {
    const { context, input, press, status } = setup();
    const game = new LettersGame();
    game.init(context);
    game.setWordSource("custom", "BEE");
    input.virtualDown("primary", "start");
    input.virtualUp("primary", "start");
    game.init(context); // The engine can process a quick start after keyup.
    game.fixedUpdate(0.02);
    expect(status()).toContain("Guessed: none");
    press(game, "primary");
    expect(status()).toContain("A: not in the word");
  });
  it("accepts a distinct guess immediately after a non-guess start", () => {
    const { context, input, press, status } = setup();
    const game = new LettersGame();
    game.init(context);
    game.setWordSource("custom", "BEE");
    input.virtualDown("confirm", "start");
    game.init(context); // Engine restart happens while the start gesture is active.
    input.virtualUp("confirm", "start");
    press(game, "primary"); // A separate guess arrives before the first game update.
    expect(status()).toContain("A: not in the word");
    expect(status()).toContain("5 guesses left");
  });
  it("guesses, ignores repeated letters, wins once and keeps a custom list for retries", () => {
    const { context, press, status } = setup();
    const game = new LettersGame();
    game.init(context);
    expect(game.setWordSource("custom", "ABBA")).toBe(1);
    expect(status()).toContain("Word: _ _ _ _");
    expect(status()).not.toContain("ABBA");
    expect(game.setWordSource("custom", "bad word")).toBe(0);
    game.fixedUpdate(0); // The start gesture is released.
    press(game, "primary");
    expect(status()).toContain("A: correct");
    expect(status()).toContain("Word: A _ _ A");
    expect(status()).toContain("6 guesses left");
    press(game, "primary");
    expect(status()).toContain("already guessed");
    expect(status()).toContain("6 guesses left");
    press(game, "right");
    press(game, "primary");
    expect(status()).toContain("WORD FOUND / ABBA");
    expect(game.resultLabel).toBe("WORD FOUND / ABBA");
    expect(game.score).toBe(1900);
    expect(context.reportGameOver).toHaveBeenCalledOnce();
    press(game, "primary");
    expect(context.reportGameOver).toHaveBeenCalledOnce();
    // A list change after completion takes effect on retry, without replacing the result.
    expect(game.setWordSource("study")).toBe(STUDY_WORDS.length);
    expect(game.resultLabel).toBe("WORD FOUND / ABBA");
    game.destroy();
    game.init(context);
    expect(game.resultLabel).toBeUndefined();
    expect(game.wordSource).toBe("study");
    expect(status()).not.toContain("ABBA");
    game.setWordSource("custom", "ABBA");
    game.destroy();
    game.init(context);
    expect(game.wordSource).toBe("custom");
    expect(status()).toContain("Word: _ _ _ _");
  });
  it("uses six misses, reveals the answer on loss and does not move into an absent grid cell", () => {
    const { context, press, status } = setup();
    const game = new LettersGame();
    game.init(context);
    game.setWordSource("custom", "AB");
    game.fixedUpdate(0);
    press(game, "right");
    press(game, "right");
    for (let i = 0; i < 6; i++) {
      press(game, "primary");
      if (i < 4) press(game, "right");
      else if (i === 4) press(game, "down");
    }
    expect(status()).toContain("0 guesses left");
    expect(game.resultLabel).toBe("WORD WAS / AB");
    expect(game.score).toBe(0);
    expect(context.reportGameOver).toHaveBeenCalledOnce();

    game.destroy();
    game.init(context);
    game.fixedUpdate(0);
    for (let i = 0; i < 6; i++) press(game, "right");
    press(game, "down");
    press(game, "down");
    expect(status()).toContain("Selected U");
    press(game, "down");
    expect(status()).toContain("Selected U");
  });
  it("accepts a hidden word, covers the hand-off and pause, and never records local results", () => {
    const { context, ctx, press, status } = setup();
    const game = new LettersLocalGame();
    const refresh = vi.fn();
    game.onNeedsSecret = refresh;
    game.init(context);
    game.fixedUpdate(0);
    expect(game.needsSecret).toBe(true);
    expect(game.setSecret("a word")).toBe(false);
    expect(game.setSecret(" bEE ")).toBe(true);
    expect(game.needsSecret).toBe(false);
    expect(game.setSecret("OTHER")).toBe(false);
    expect(status()).toContain("privacy screen");
    expect(status()).not.toContain("BEE");
    game.render(0);
    expect(vi.mocked(ctx.fillText).mock.calls.map((call) => call[0])).not.toContain("BEE");
    press(game, "primary");
    expect(status()).toContain("Word: _ _ _");
    expect(status()).not.toContain("BEE");
    press(game, "right");
    press(game, "primary");
    expect(status()).toContain("Word: B _ _");
    game.suspend();
    expect(status()).toContain("privacy screen");
    expect(status()).not.toContain("BEE");
    press(game, "primary");
    for (let i = 0; i < 3; i++) press(game, "right");
    press(game, "primary");
    expect(status()).toContain("WORD FOUND / BEE");
    expect(game.recordsAllowed).toBe(false);
    expect(context.reportGameOver).toHaveBeenCalledOnce();
    game.destroy();
    game.init(context);
    expect(game.needsSecret).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });
  it("mounts session-only controls, validates pasted lists and clears fields on teardown", () => {
    const { context } = setup();
    const game = new LettersGame();
    game.init(context);
    const root = document.createElement("div");
    document.body.append(root);
    const destroy = mountWordLists(root, game);
    const select = root.querySelector("select")!;
    const textarea = root.querySelector("textarea")!;
    const apply = root.querySelector("button")!;
    const note = root.querySelector('[role="status"]')!;
    expect(select.value).toBe("general");
    select.value = "study";
    select.dispatchEvent(new Event("change"));
    expect(game.wordSource).toBe("study");
    select.value = "custom";
    select.dispatchEvent(new Event("change"));
    textarea.value = "word with spaces";
    apply.click();
    expect(note.textContent).toContain("2–24 letters");
    expect(game.wordSource).toBe("study");
    textarea.value = "orbit, planet, ORBIT";
    apply.click();
    expect(game.wordSource).toBe("custom");
    expect(note.textContent).toContain("2 words");
    expect(textarea.value).toBe("");
    textarea.value = "unfinished";
    destroy();
    expect(textarea.value).toBe("");
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
    root.remove();
  });
});
