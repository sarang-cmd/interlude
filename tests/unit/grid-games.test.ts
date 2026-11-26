// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyGrid,
  flipped,
  gridFallback,
  gridMoves,
  gridOutcome,
  gridRules,
  initialGrid,
  isGridSearchTask,
  solveGrid,
  type GridKind,
  type GridPosition,
  type GridSearchTask,
} from "../../src/ai/grid-games";
import { isSearchTask, solveSearchTask } from "../../src/ai/tasks";
import { Input } from "../../src/engine/input";
import { GridDuelGame } from "../../src/games/grid-duel/game";
import { LocalGridGame } from "../../src/games/grid-duel/grid.2p";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function request(kind: GridKind, position = initialGrid(kind)): GridSearchTask {
  return { kind, position, depth: 4, maxNodes: 40_000 };
}
function setup(kind: GridKind, search?: ConstructorParameters<typeof GridDuelGame>[1]) {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const input = new Input();
  input.setEnabled(true);
  const context = {
    width: 640,
    height: 360,
    canvas,
    input,
    rng: new RNG(3),
    settings: { ...DEFAULT_SETTINGS, boardDifficulty: "veteran" },
    sound: { play: vi.fn() },
    announce: vi.fn(),
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  const game = new GridDuelGame(kind, search);
  game.init(context);
  const tap = (action: "left" | "right" | "up" | "down" | "primary") => {
    input.virtualDown(action, "test");
    input.virtualUp(action, "test");
    game.fixedUpdate(0.02);
  };
  const status = () => vi.mocked(context.announce!).mock.lastCall?.[0] ?? "";
  return { canvas, context, input, game, tap, status };
}
afterEach(() => document.body.replaceChildren());

describe("DROP FOUR rules", () => {
  it("uses a seven by six gravity board, wins with four, and rejects illegal moves", () => {
    let p = initialGrid("drop-four");
    expect(p.cells).toHaveLength(42);
    expect(gridMoves("drop-four", p)).toHaveLength(7);
    for (const move of [3, 2, 3, 2, 3, 2]) {
      const old = p;
      p = applyGrid("drop-four", p, move);
      expect(old.cells).not.toBe(p.cells);
      expect(gridOutcome("drop-four", p)).toBeNull();
    }
    p = applyGrid("drop-four", p, 3);
    expect(gridOutcome("drop-four", p)).toBe(1);
    expect(gridMoves("drop-four", p)).toEqual([]);
    expect(() => applyGrid("drop-four", p, 4)).toThrow("Illegal grid move");
    let full = initialGrid("drop-four");
    for (let i = 0; i < 6; i++) full = applyGrid("drop-four", full, 3);
    expect(gridMoves("drop-four", full)).not.toContain(3);
    expect(() => applyGrid("drop-four", full, 3)).toThrow("Illegal grid move");
  });
  it("detects horizontal and diagonal lines and the CPU blocks an immediate threat", () => {
    let p = initialGrid("drop-four");
    for (const move of [0, 6, 1, 6, 2]) p = applyGrid("drop-four", p, move);
    expect(gridFallback("drop-four", p)).toBe(3);
    const searched = solveGrid({ ...request("drop-four", p), depth: 4 });
    expect(searched.complete).toBe(true);
    expect(searched.move).toBe(3);
    expect(searched.nodes).toBeLessThanOrEqual(40_000);
    const cells = Array<-1 | 0 | 1>(42).fill(0);
    for (const index of [35, 29, 23, 17]) cells[index] = 1;
    expect(gridOutcome("drop-four", { cells, turn: -1 })).toBe(1);
    for (const index of [35, 29, 23, 17]) cells[index] = -1;
    expect(gridRules("drop-four", 1).terminal({ cells, turn: 1 })).toBe(-1);
  });
});

describe("FLIP DISC rules", () => {
  it("starts with four discs, flips a bracketed run, and rejects non-bracketing moves", () => {
    const p = initialGrid("flip-disc");
    expect(p.cells).toHaveLength(64);
    expect(gridMoves("flip-disc", p)).toEqual([19, 26, 37, 44]);
    expect(flipped(p.cells, 19, 1)).toEqual([27]);
    const next = applyGrid("flip-disc", p, 19);
    expect(next.cells.filter((cell) => cell === 1)).toHaveLength(4);
    expect(next.cells.filter((cell) => cell === -1)).toHaveLength(1);
    expect(p.cells[27]).toBe(-1);
    expect(next.turn).toBe(-1);
    expect(() => applyGrid("flip-disc", next, 0)).toThrow("Illegal grid move");
  });
  it("passes automatically when only the other side can move and ends when neither can", () => {
    const cells = Array<-1 | 0 | 1>(64).fill(1);
    cells[0] = 0;
    cells[1] = -1;
    const p: GridPosition = { cells, turn: -1 };
    expect(gridMoves("flip-disc", p)).toEqual([-1]);
    expect(gridOutcome("flip-disc", p)).toBeNull();
    const passed = applyGrid("flip-disc", p, -1);
    expect(gridMoves("flip-disc", passed)).toEqual([0]);
    const end = applyGrid("flip-disc", passed, 0);
    expect(gridOutcome("flip-disc", end)).toBe(1);
    expect(gridMoves("flip-disc", end)).toEqual([]);
  });
  it("finishes seeded matches without illegal or infinite pass sequences", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new RNG(seed);
      let p = initialGrid("flip-disc"),
        turns = 0;
      while (gridOutcome("flip-disc", p) === null && turns++ < 130) {
        const moves = gridMoves("flip-disc", p);
        expect(moves.length).toBeGreaterThan(0);
        p = applyGrid("flip-disc", p, rng.pick(moves));
      }
      expect(turns).toBeLessThan(130);
      expect(gridOutcome("flip-disc", p)).not.toBeNull();
    }
  });
});

describe("shared AI task boundary and cabinets", () => {
  it("accepts only bounded and fully populated grid tasks", () => {
    for (const kind of ["drop-four", "flip-disc"] as const) {
      const valid = request(kind);
      expect(isGridSearchTask(valid)).toBe(true);
      expect(isSearchTask(valid)).toBe(true);
      expect(gridMoves(kind, valid.position)).toContain(solveSearchTask(valid).move);
      for (const patch of [
        { depth: 7 },
        { maxNodes: 40_001 },
        { maxNodes: NaN },
        { kind: "unknown" },
        { position: { cells: [], turn: 1 } },
      ])
        expect(isGridSearchTask({ ...valid, ...patch })).toBe(false);
      const holes = Array(valid.position.cells.length);
      expect(isGridSearchTask({ ...valid, position: { cells: holes, turn: 1 } })).toBe(false);
    }
    expect(() => solveSearchTask({ kind: "anything", source: "bad" })).toThrow(
      "Invalid search task",
    );
  });
  it("uses the selected CPU tier and aborts pending work on pause or settings change", () => {
    const search = vi.fn(
      (
        _task: GridSearchTask,
        _canvas: HTMLCanvasElement,
        _timeout?: number,
        _signal?: AbortSignal,
      ) => new Promise<never>(() => {}),
    );
    const { game, context, tap } = setup("drop-four", search);
    tap("primary");
    game.fixedUpdate(0.02);
    expect(search.mock.calls[0]![0]).toMatchObject({
      kind: "drop-four",
      depth: 6,
      maxNodes: 40_000,
    });
    const signal = search.mock.calls[0]![3]!;
    context.settings.boardDifficulty = "easy";
    game.settingsChanged();
    expect(signal.aborted).toBe(true);
    game.fixedUpdate(0.02);
    expect(search.mock.calls[1]![0].depth).toBe(2);
    const nextSignal = search.mock.calls[1]![3]!;
    game.suspend();
    expect(nextSignal.aborted).toBe(true);
    game.destroy();
  });
  it("plays a website-only shared-control win without changing solo scores", () => {
    const { context, input, status } = setup("drop-four");
    const game = new LocalGridGame("drop-four");
    game.init(context);
    const step = (action: "left" | "right" | "primary") => {
      input.virtualDown(action, "test");
      input.virtualUp(action, "test");
      game.fixedUpdate(0.02);
    };
    for (const action of [
      "primary",
      "left",
      "primary",
      "right",
      "primary",
      "left",
      "primary",
      "right",
      "primary",
      "left",
      "primary",
      "right",
      "primary",
    ] as const)
      step(action);
    expect(game.resultLabel).toBe("PLAYER 1 / X WINS");
    expect(game.recordsAllowed).toBe(false);
    expect(context.reportGameOver).toHaveBeenCalledTimes(1);
    expect(status()).toContain("PLAYER 1 / X WINS");
    game.destroy();
  });
});
