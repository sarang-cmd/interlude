// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Input } from "../../src/engine/input";
import { PopGame } from "../../src/games/pop/game";
import {
  createSlide,
  slideDistance,
  slideNeighbor,
  slideSolved,
  slideSwap,
  SLIDE_SOLVED,
} from "../../src/games/slide/logic";
import { SweepBoard, sweepNeighbors, SWEEP_MINES } from "../../src/games/sweep/logic";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

describe("SWEEP", () => {
  it("always opens a safe neighborhood first and places exactly ten mines", () => {
    for (let seed = 1; seed <= 50; seed++)
      for (const first of [0, 40, 80]) {
        const board = new SweepBoard(new RNG(seed));
        expect(board.reveal(first)).toBe(true);
        expect(board.mines.filter(Boolean)).toHaveLength(SWEEP_MINES);
        expect([first, ...sweepNeighbors(first)].every((i) => !board.mines[i])).toBe(true);
        expect(board.adjacent(first)).toBe(0);
        expect(board.open[first]).toBe(true);
        expect(board.outcome).toBe("playing");
      }
  });
  it("protects flags, stops on mines, and wins after opening every safe square", () => {
    const board = new SweepBoard(new RNG(9));
    expect(board.toggleFlag(40)).toBe(true);
    expect(board.reveal(40)).toBe(false);
    expect(board.placed).toBe(false);
    board.toggleFlag(40);
    board.reveal(40);
    const mine = board.mines.indexOf(true);
    board.toggleFlag(mine);
    expect(board.reveal(mine)).toBe(false);
    board.toggleFlag(mine);
    expect(board.reveal(-1)).toBe(false);
    expect(board.reveal(mine)).toBe(true);
    expect(board.outcome).toBe("lost");
    expect(board.reveal(0)).toBe(false);
    const winner = new SweepBoard(new RNG(8));
    winner.reveal(40);
    for (let i = 0; i < 81; i++) if (!winner.mines[i] && !winner.open[i]) winner.reveal(i);
    expect(winner.outcome).toBe("won");
    expect(winner.open.filter(Boolean)).toHaveLength(71);
  });
  it("produces identical seeded boards for the same first move", () => {
    const one = new SweepBoard(new RNG(123)),
      two = new SweepBoard(new RNG(123));
    one.reveal(30);
    two.reveal(30);
    expect(one.mines).toEqual(two.mines);
    expect(one.open).toEqual(two.open);
  });
});

describe("SLIDE", () => {
  it("only allows neighboring swaps, with reversible moves and a known goal", () => {
    const goal = [...SLIDE_SOLVED];
    expect(slideSolved(goal)).toBe(true);
    expect(slideDistance(goal)).toBe(0);
    expect(slideSwap(goal, 0)).toBeNull();
    expect(slideNeighbor(15, "right")).toBeNull();
    const next = slideSwap(goal, 14)!;
    expect(slideDistance(next)).toBe(1);
    expect(slideSwap(next, 15)).toEqual(goal);
  });
  it("makes deterministic, non-solved, parity-solvable boards", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const board = createSlide(new RNG(seed));
      expect(board).toEqual(createSlide(new RNG(seed)));
      expect(slideSolved(board)).toBe(false);
      expect([...board].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
      const values = board.filter(Boolean);
      let inversions = 0;
      for (let i = 0; i < values.length; i++)
        for (let j = i + 1; j < values.length; j++) if (values[i]! > values[j]!) inversions++;
      const blankRowFromBottom = 4 - Math.floor(board.indexOf(0) / 4);
      expect((inversions + blankRowFromBottom) % 2).toBe(1);
    }
  });
});

describe("POP", () => {
  it("scores a target, loses points on a miss, and ends at the game clock", () => {
    const input = new Input();
    input.setEnabled(true);
    const announce = vi.fn();
    const over = vi.fn(async () => {});
    const context = {
      width: 640,
      height: 360,
      input,
      rng: new RNG(5),
      settings: { ...DEFAULT_SETTINGS },
      sound: { play: vi.fn() },
      announce,
      reportGameOver: over,
    } as unknown as GameContext;
    const first = new RNG(5).int(0, 14),
      game = new PopGame();
    game.init(context);
    const press = (action: "left" | "right" | "up" | "down" | "primary") => {
      input.virtualDown(action, "test");
      input.virtualUp(action, "test");
      game.fixedUpdate(0);
    };
    const dr = Math.floor(first / 5) - 1,
      dc = (first % 5) - 2;
    for (let i = 0; i < Math.abs(dr); i++) press(dr < 0 ? "up" : "down");
    for (let i = 0; i < Math.abs(dc); i++) press(dc < 0 ? "left" : "right");
    press("primary");
    expect(game.score).toBe(100);
    expect(announce.mock.lastCall?.[0]).toContain("Pop!");
    press("primary");
    expect(game.score).toBe(90);
    expect(announce.mock.lastCall?.[0]).toContain("Miss.");
    game.fixedUpdate(46);
    expect(over).toHaveBeenCalledOnce();
    expect(game.resultLabel).toBe("1 TARGETS POPPED");
    game.fixedUpdate(2);
    expect(over).toHaveBeenCalledOnce();
  });
});
