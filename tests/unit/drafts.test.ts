// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDraftMove,
  decodeDraftMove,
  draftMoves,
  draftsOutcome,
  encodeDraftMove,
  initialDrafts,
  isDraftSearchTask,
  solveDrafts,
  type DraftPiece,
  type DraftPosition,
  type DraftSearchTask,
} from "../../src/ai/drafts";
import { isSearchTask, solveSearchTask } from "../../src/ai/tasks";
import { Input } from "../../src/engine/input";
import { DraftsGame } from "../../src/games/drafts/game";
import { LocalDraftsGame } from "../../src/games/drafts/drafts.2p";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function position(pieces: Array<[number, DraftPiece]>, turn: -1 | 1 = 1, quiet = 0): DraftPosition {
  const cells = Array<DraftPiece>(64).fill(0);
  for (const [index, piece] of pieces) cells[index] = piece;
  return { cells, turn, forced: -1, quiet };
}
function request(position = initialDrafts()): DraftSearchTask {
  return { kind: "drafts", position, depth: 4, maxNodes: 40_000 };
}
afterEach(() => document.body.replaceChildren());

describe("DRAFTS rules", () => {
  it("starts with twelve pieces per side and seven legal forward moves", () => {
    const p = initialDrafts();
    expect(p.cells).toHaveLength(64);
    expect(p.cells.filter((piece) => piece === 1)).toHaveLength(12);
    expect(p.cells.filter((piece) => piece === -1)).toHaveLength(12);
    expect(draftMoves(p)).toHaveLength(7);
    expect(draftMoves(p).map(decodeDraftMove)).toContainEqual([42, 33]);
    expect(() => applyDraftMove(p, encodeDraftMove(42, 43))).toThrow("Illegal draught move");
    const next = applyDraftMove(p, encodeDraftMove(42, 33));
    expect(p.cells[42]).toBe(1);
    expect(next.cells[42]).toBe(0);
    expect(next.cells[33]).toBe(1);
    expect(next.turn).toBe(-1);
  });
  it("requires captures and continues a multiple jump with the same piece", () => {
    const p = position([
      [42, 1],
      [40, 1],
      [35, -1],
      [21, -1],
      [7, -1],
    ]);
    expect(draftMoves(p)).toEqual([encodeDraftMove(42, 28)]);
    const first = applyDraftMove(p, encodeDraftMove(42, 28));
    expect(first.cells[35]).toBe(0);
    expect(first.turn).toBe(1);
    expect(first.forced).toBe(28);
    expect(draftMoves(first)).toEqual([encodeDraftMove(28, 14)]);
    const second = applyDraftMove(first, encodeDraftMove(28, 14));
    expect(second.cells[21]).toBe(0);
    expect(second.turn).toBe(-1);
    expect(second.forced).toBe(-1);
  });
  it("crowns at the far row and ends the move, while kings can capture backwards", () => {
    const p = position([
      [17, 1],
      [10, -1],
      [12, -1],
    ]);
    const crown = applyDraftMove(p, encodeDraftMove(17, 3));
    expect(crown.cells[3]).toBe(2);
    expect(crown.turn).toBe(-1);
    expect(crown.forced).toBe(-1);
    const king = position([
      [26, 2],
      [35, -1],
      [7, -1],
    ]);
    expect(draftMoves(king)).toEqual([encodeDraftMove(26, 44)]);
    expect(applyDraftMove(king, encodeDraftMove(26, 44)).cells[35]).toBe(0);
  });
  it("ends when a side cannot move and draws after 80 non-capturing moves", () => {
    expect(
      draftsOutcome(
        position([
          [8, 1],
          [1, -1],
        ]),
      ),
    ).toBe(-1);
    const near = position(
      [
        [42, 2],
        [21, -2],
      ],
      1,
      79,
    );
    const end = applyDraftMove(near, encodeDraftMove(42, 33));
    expect(end.quiet).toBe(80);
    expect(draftsOutcome(end)).toBe(0);
    expect(draftMoves(end)).toEqual([]);
  });
  it("finishes seeded matches with legal moves and bounded draw rules", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rng = new RNG(seed);
      let p = initialDrafts(),
        moves = 0;
      while (draftsOutcome(p) === null && moves++ < 1200)
        p = applyDraftMove(p, rng.pick(draftMoves(p)));
      expect(moves).toBeLessThan(1200);
      expect(draftsOutcome(p)).not.toBeNull();
    }
  });
  it("validates bounded data-only worker tasks and respects mandatory capture", () => {
    const p = position([
      [42, 1],
      [40, 1],
      [35, -1],
      [21, -1],
      [7, -1],
    ]);
    const task = request(p);
    expect(isDraftSearchTask(task)).toBe(true);
    expect(isSearchTask(task)).toBe(true);
    expect(solveDrafts(task).move).toBe(encodeDraftMove(42, 28));
    expect(solveSearchTask(task).move).toBe(encodeDraftMove(42, 28));
    expect(isDraftSearchTask({ ...task, depth: 7 })).toBe(false);
    expect(isDraftSearchTask({ ...task, maxNodes: 40_001 })).toBe(false);
    expect(isDraftSearchTask({ ...task, position: { ...p, cells: Array(64) } })).toBe(false);
    expect(isDraftSearchTask({ ...task, position: { ...p, forced: 40 } })).toBe(false);
    const malformed = [...p.cells];
    malformed[0] = 1;
    expect(isDraftSearchTask({ ...task, position: { ...p, cells: malformed } })).toBe(false);
  });
});

describe("DRAFTS cabinet", () => {
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
      settings: { ...DEFAULT_SETTINGS, boardDifficulty: "veteran" },
      sound: { play: vi.fn() },
      announce: vi.fn(),
      reportGameOver: vi.fn(async () => {}),
    } as unknown as GameContext;
    const tap = (game: DraftsGame, action: "up" | "left" | "primary") => {
      input.virtualDown(action, "test");
      input.virtualUp(action, "test");
      game.fixedUpdate(0.02);
    };
    return {
      canvas,
      input,
      context,
      tap,
      status: () => vi.mocked(context.announce!).mock.lastCall?.[0] ?? "",
    };
  }
  it("selects a piece and destination on the website without a solo record", () => {
    const { context, tap, status } = setup();
    const game = new LocalDraftsGame();
    game.init(context);
    tap(game, "primary");
    expect(status()).toContain("Selected piece at row 6, column 3");
    tap(game, "up");
    tap(game, "left");
    tap(game, "primary");
    expect(status()).toContain("PLAYER 1 / X moved from row 6, column 3 to row 5, column 2");
    expect(status()).toContain("PLAYER 2 / O turn");
    expect(game.recordsAllowed).toBe(false);
    game.destroy();
  });
  it("uses the shared CPU level and aborts a pending worker on suspension", () => {
    const { context, tap } = setup();
    const search = vi.fn(
      (
        _task: DraftSearchTask,
        _canvas: HTMLCanvasElement,
        _timeout?: number,
        _signal?: AbortSignal,
      ) => new Promise<never>(() => {}),
    );
    const game = new DraftsGame(search);
    game.init(context);
    tap(game, "primary");
    tap(game, "up");
    tap(game, "left");
    tap(game, "primary");
    game.fixedUpdate(0.02);
    expect(search.mock.calls[0]![0]).toMatchObject({ kind: "drafts", depth: 6, maxNodes: 40_000 });
    const signal = search.mock.calls[0]![3]!;
    game.suspend();
    expect(signal.aborted).toBe(true);
    game.destroy();
  });
});
