// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyBoxEdge,
  boxEdges,
  boxMoves,
  boxesOutcome,
  initialBoxes,
  isBoxesSearchTask,
  solveBoxes,
  type BoxesSearchTask,
} from "../../src/ai/dots-and-boxes";
import { isSearchTask, solveSearchTask } from "../../src/ai/tasks";
import { minimax, type SearchRules } from "../../src/ai/search";
import { Input } from "../../src/engine/input";
import { DotsBoxesGame } from "../../src/games/dotsboxes/game";
import { DotsBoxesLocalGame } from "../../src/games/dotsboxes/dotsboxes.2p";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function request(): BoxesSearchTask {
  return { kind: "dots-and-boxes", position: initialBoxes(), depth: 4, maxNodes: 40_000 };
}
afterEach(() => document.body.replaceChildren());

describe("DOTS AND BOXES rules", () => {
  it("builds four by four boxes with 40 distinct edges", () => {
    const p = initialBoxes();
    expect(p.edges).toHaveLength(40);
    expect(p.boxes).toHaveLength(16);
    expect(boxEdges(0)).toEqual([0, 4, 20, 21]);
    expect(boxEdges(15)).toEqual([15, 19, 38, 39]);
    expect(boxMoves(p)).toHaveLength(40);
    expect(() => applyBoxEdge(p, -1)).toThrow("Illegal edge");
    expect(() => applyBoxEdge(p, 40)).toThrow("Illegal edge");
  });
  it("awards two boxes on a shared edge and grants another turn", () => {
    let p = initialBoxes();
    for (const edge of [0, 1, 4, 5, 20, 22]) p = applyBoxEdge(p, edge);
    expect(p.turn).toBe(1);
    expect(p.boxes.slice(0, 2)).toEqual([0, 0]);
    const previous = p;
    p = applyBoxEdge(p, 21);
    expect(previous.edges[21]).toBe(0);
    expect(p.boxes.slice(0, 2)).toEqual([1, 1]);
    expect(p.turn).toBe(1);
    expect(() => applyBoxEdge(p, 21)).toThrow("Illegal edge");
    p = applyBoxEdge(p, 2);
    expect(p.turn).toBe(-1);
  });
  it("finishes random legal games, awarding every completed box exactly once", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new RNG(seed);
      let p = initialBoxes();
      while (boxesOutcome(p) === null) p = applyBoxEdge(p, rng.pick(boxMoves(p)));
      expect(p.edges.filter(Boolean)).toHaveLength(40);
      expect(p.boxes.filter(Boolean)).toHaveLength(16);
      expect(boxMoves(p)).toEqual([]);
    }
  });
  it("uses a same-player continuation in minimax rather than alternating blindly", () => {
    type State = { id: string; turn: 1 | -1 };
    const rules: SearchRules<State, string> = {
      moves: (state) =>
        state.id === "root" ? ["extra", "ordinary"] : state.id === "extra" ? ["win", "lose"] : [],
      apply: (_state, move) => ({ id: move, turn: move === "extra" ? 1 : -1 }),
      terminal: (state) =>
        state.id === "win" ? 1 : state.id === "lose" ? -1 : state.id === "ordinary" ? 0 : null,
      evaluate: () => 0,
      maximizing: (state) => state.turn === 1,
    };
    expect(minimax({ id: "root", turn: 1 }, rules, { depth: 2, maxNodes: 50 }).move).toBe("extra");
  });
  it("rejects malformed worker positions and picks an available double capture", () => {
    let p = initialBoxes();
    for (const edge of [0, 1, 4, 5, 20, 22]) p = applyBoxEdge(p, edge);
    const task = { ...request(), position: p, depth: 2 };
    expect(isBoxesSearchTask(task)).toBe(true);
    expect(isSearchTask(task)).toBe(true);
    expect(solveBoxes(task).move).toBe(21);
    expect(solveSearchTask(task).move).toBe(21);
    expect(isBoxesSearchTask({ ...task, depth: 5 })).toBe(false);
    expect(isBoxesSearchTask({ ...task, maxNodes: 40_001 })).toBe(false);
    expect(isBoxesSearchTask({ ...task, position: { ...p, boxes: Array(16) } })).toBe(false);
    expect(isBoxesSearchTask({ ...task, position: { ...p, boxes: Array(16).fill(1) } })).toBe(
      false,
    );
  });
});

describe("DOTS AND BOXES cabinet", () => {
  function setup() {
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
      settings: { ...DEFAULT_SETTINGS },
      sound: { play: vi.fn() },
      announce: vi.fn(),
      reportGameOver: vi.fn(async () => {}),
    } as unknown as GameContext;
    return {
      canvas,
      input,
      context,
      status: () => vi.mocked(context.announce!).mock.lastCall?.[0] ?? "",
    };
  }
  it("allows shared-control play without making a CPU search or solo record", () => {
    const { context, input, status } = setup();
    const game = new DotsBoxesLocalGame();
    game.init(context);
    input.virtualDown("primary", "test");
    input.virtualUp("primary", "test");
    game.fixedUpdate(0.02);
    expect(status()).toContain("PLAYER 1 / X drew horizontal edge, row 1, column 1");
    expect(status()).toContain("PLAYER 2 / O turn");
    expect(game.recordsAllowed).toBe(false);
    game.destroy();
  });
  it("cancels an in-flight AI search when suspended", () => {
    const { context, input } = setup();
    const search = vi.fn(
      (
        _task: BoxesSearchTask,
        _canvas: HTMLCanvasElement,
        _timeout?: number,
        _signal?: AbortSignal,
      ) => new Promise<never>(() => {}),
    );
    const game = new DotsBoxesGame(search);
    game.init(context);
    input.virtualDown("primary", "test");
    input.virtualUp("primary", "test");
    game.fixedUpdate(0.02);
    game.fixedUpdate(0.02);
    expect(search).toHaveBeenCalledOnce();
    const signal = search.mock.calls[0]![3]!;
    game.suspend();
    expect(signal.aborted).toBe(true);
    game.destroy();
  });
});
