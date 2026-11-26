// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fleetTarget } from "../../src/ai/fleet";
import { Input } from "../../src/engine/input";
import {
  createFleet,
  fireAt,
  fleetDefeated,
  knownShots,
  SHIP_LENGTHS,
  type ShotKnowledge,
} from "../../src/games/fleet/logic";
import { fleetStatus } from "../../src/games/fleet/display";
import { FleetGame } from "../../src/games/fleet/game";
import { FleetLocalGame } from "../../src/games/fleet/fleet.2p";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

afterEach(() => document.body.replaceChildren());
describe("FLEET rules and private information", () => {
  it("places five straight, contiguous, non-overlapping ships on each ten by ten board", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const board = createFleet(new RNG(seed));
      expect(board.ships).toHaveLength(100);
      expect(board.shots).toEqual(Array(100).fill(false));
      expect(board.ships.filter(Boolean)).toHaveLength(17);
      for (const [index, length] of SHIP_LENGTHS.entries()) {
        const cells = board.ships.flatMap((ship, i) => (ship === index + 1 ? [i] : []));
        expect(cells).toHaveLength(length);
        const delta = cells[1]! - cells[0]!;
        expect([1, 10]).toContain(delta);
        for (let i = 1; i < cells.length; i++) expect(cells[i]! - cells[i - 1]!).toBe(delta);
        if (delta === 1) expect(new Set(cells.map((i) => Math.floor(i / 10))).size).toBe(1);
      }
    }
  });
  it("marks misses, hits and sunk ships, rejects repeats, and detects the last ship", () => {
    let board = createFleet(new RNG(1));
    const water = board.ships.indexOf(0);
    const miss = fireAt(board, water)!;
    expect(miss.result).toBe("miss");
    expect(board.shots[water]).toBe(false);
    board = miss.board;
    expect(fireAt(board, water)).toBeNull();
    expect(fireAt(board, -1)).toBeNull();
    expect(fireAt(board, 100)).toBeNull();
    const ship = board.ships.flatMap((value, index) => (value === 1 ? [index] : []));
    for (const [index, cell] of ship.entries()) {
      const hit = fireAt(board, cell)!;
      expect(hit.result).toBe(index === ship.length - 1 ? "sunk" : "hit");
      board = hit.board;
    }
    expect(knownShots(board).filter((cell) => cell === "sunk")).toHaveLength(5);
    expect(fleetDefeated(board)).toBe(false);
    for (let index = 0; index < 100; index++)
      if (board.ships[index] && !board.shots[index]) board = fireAt(board, index)!.board;
    expect(fleetDefeated(board)).toBe(true);
  });
  it("exposes no unshot enemy positions to the status or the CPU", () => {
    const own = createFleet(new RNG(7)),
      a = createFleet(new RNG(8)),
      b = createFleet(new RNG(9));
    expect(a.ships).not.toEqual(b.ships);
    expect(knownShots(a)).toEqual(Array(100).fill("unknown"));
    expect(knownShots(b)).toEqual(knownShots(a));
    expect(fleetStatus(own, a, 0)).toEqual(fleetStatus(own, b, 0));
    const knowledge: ShotKnowledge[] = Array(100).fill("unknown");
    knowledge[55] = "hit";
    for (let seed = 1; seed <= 10; seed++)
      expect([45, 54, 56, 65]).toContain(fleetTarget(knowledge, "veteran", new RNG(seed)));
    knowledge[55] = "sunk";
    const shot = fleetTarget(knowledge, "veteran", new RNG(1));
    expect(shot).not.toBe(55);
    expect(fleetTarget(Array(100).fill("miss"), "veteran", new RNG(1))).toBeNull();
    expect(fleetTarget(Array(99).fill("unknown"), "veteran", new RNG(1))).toBeNull();
  });
});

describe("FLEET cabinets", () => {
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
      rng: new RNG(3),
      settings: { ...DEFAULT_SETTINGS, boardDifficulty: "veteran" },
      sound: { play: vi.fn() },
      announce: vi.fn(),
      reportGameOver: vi.fn(async () => {}),
    } as unknown as GameContext;
    const press = (game: FleetGame | FleetLocalGame) => {
      input.virtualDown("primary", "test");
      input.virtualUp("primary", "test");
      game.fixedUpdate(0.02);
    };
    return {
      context,
      ctx,
      press,
      status: () => vi.mocked(context.announce!).mock.lastCall?.[0] ?? "",
    };
  }
  it("plays a CPU turn without exposing any unshot enemy fleet", () => {
    const { context, press, status } = setup();
    const game = new FleetGame();
    game.init(context);
    expect(status()).toContain("Target board: row 1: unknown");
    press(game);
    expect(status()).toContain("YOU fired at row 1, column 1");
    game.fixedUpdate(1);
    expect(status()).toContain("CPU fired at");
    expect(status()).toContain("YOUR TURN");
    game.destroy();
  });
  it("hides all fleet details at hand-off and immediately clears them on suspend", () => {
    const { context, ctx, press, status } = setup();
    const game = new FleetLocalGame();
    game.init(context);
    expect(status()).toContain("privacy screen");
    expect(status()).not.toContain("ship squares");
    press(game);
    expect(status()).toContain("PLAYER 1 turn");
    expect(status()).toContain("Your ship squares");
    game.suspend();
    expect(status()).toContain("privacy screen");
    expect(status()).not.toContain("ship squares");
    expect(ctx.fillRect).toHaveBeenCalled();
    press(game);
    expect(status()).toContain("PLAYER 1 turn");
    press(game);
    expect(status()).toContain("Pass the device to PLAYER 2");
    expect(status()).not.toContain("ship squares");
    expect(status()).not.toContain("Target board");
    expect(game.recordsAllowed).toBe(false);
    press(game);
    expect(status()).toContain("PLAYER 2 turn");
    expect(status()).toContain("Your ship squares");
    game.destroy();
  });
});
