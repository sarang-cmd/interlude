// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_LEVELS, AI_PROFILES } from "../../src/ai/difficulty";
import {
  isThreeSearchTask,
  noughtsLines,
  solveThree,
  threeRules,
  type ThreeSearchTask,
  type ThreePosition,
} from "../../src/ai/three-in-row";
import type { SearchResult } from "../../src/ai/search";
import { Input } from "../../src/engine/input";
import { TicTacToeGame } from "../../src/games/tictactoe/game";
import { TicTacToeLocalGame } from "../../src/games/tictactoe/tictactoe.2p";
import { tacticalFallback, TicTacToeLogic } from "../../src/games/tictactoe/logic";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function task(position: ThreePosition): ThreeSearchTask {
  return {
    kind: "three-in-row",
    position,
    method: "minimax",
    depth: 9,
    maxNodes: 100_000,
    simulations: 100,
    seed: 1,
  };
}
function setup(search?: ConstructorParameters<typeof TicTacToeGame>[1]) {
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
    settings: { ...DEFAULT_SETTINGS, tictactoeDifficulty: "veteran" },
    sound: { play: vi.fn() },
    announce: vi.fn(),
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  const game = new TicTacToeGame(undefined, search);
  game.init(context);
  return { game, context, input, canvas };
}
function tap(input: Input, action: "up" | "down" | "left" | "right" | "primary"): void {
  input.virtualDown(action, "test");
  input.virtualUp(action, "test");
}
function announcement(context: GameContext): string {
  return vi.mocked(context.announce!).mock.lastCall?.[0] ?? "";
}
afterEach(() => document.body.replaceChildren());

describe("Tic-Tac-Toe rules", () => {
  it("enforces turns, win lines, draws, snapshots and illegal moves", () => {
    const game = new TicTacToeLogic();
    const snapshot = game.position;
    expect(game.move(-1)).toBe(false);
    expect(game.move(1.5)).toBe(false);
    expect(game.move(9)).toBe(false);
    for (const index of [0, 3, 1, 4, 2]) expect(game.move(index)).toBe(true);
    expect(snapshot.cells).toEqual(Array(9).fill(0));
    expect(game.outcome).toBe("x");
    expect(game.winningLine).toEqual([0, 1, 2]);
    expect(game.legalMoves).toEqual([]);
    expect(game.move(8)).toBe(false);
    const draw = new TicTacToeLogic();
    for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8]) expect(draw.move(index)).toBe(true);
    expect(draw.outcome).toBe("draw");
    expect(draw.winningLine).toBeNull();
    expect(draw.move(8)).toBe(false);
    const illegal = new TicTacToeLogic();
    expect(illegal.move(4)).toBe(true);
    expect(illegal.move(4)).toBe(false);
    expect(illegal.position.turn).toBe(-1);
  });

  it("uses a legal tactical win, block or center if a worker is unavailable", () => {
    expect(tacticalFallback({ cells: [-1, -1, 0, 1, 1, 0, 0, 0, 0], turn: -1 })).toBe(2);
    expect(tacticalFallback({ cells: [1, 1, 0, -1, 0, 0, 0, 0, 0], turn: -1 })).toBe(2);
    expect(tacticalFallback({ cells: [1, 0, 0, 0, 0, 0, 0, 0, 0], turn: -1 })).toBe(4);
    expect(tacticalFallback({ cells: [1, -1, 1, 1, -1, -1, -1, 1, 1], turn: -1 })).toBeNull();
  });

  it("requires four marks on 4×4 and 5×5 and recognizes every straight line", () => {
    for (const [size, moves, expectedLine] of [
      [4, [0, 4, 1, 5, 2, 6, 3], [0, 1, 2, 3]],
      [5, [1, 0, 7, 2, 13, 3, 19], [1, 7, 13, 19]],
    ] as const) {
      const board = new TicTacToeLogic(size);
      for (const index of moves.slice(0, -1)) expect(board.move(index)).toBe(true);
      expect(board.outcome).toBe("playing");
      expect(board.move(moves.at(-1)!)).toBe(true);
      expect(board.outcome).toBe("x");
      expect(board.winningLine).toEqual(expectedLine);
      expect(board.move(size * size)).toBe(false);
      const rules = threeRules(1);
      for (const line of noughtsLines(size)) {
        const cells = Array<-1 | 0 | 1>(size * size).fill(0);
        for (const index of line.slice(0, 3)) cells[index] = 1;
        expect(rules.terminal({ cells, turn: -1 })).toBeNull();
        cells[line[3]!] = 1;
        expect(rules.terminal({ cells, turn: -1 })).toBe(1);
      }
    }
    expect(noughtsLines(4)).toHaveLength(10);
    expect(noughtsLines(5)).toHaveLength(28);
  });

  it("validates and searches larger boards within the budget and blocks immediate wins", () => {
    for (const size of [4, 5] as const) {
      const cells = Array<-1 | 0 | 1>(size * size).fill(0);
      cells[0] = cells[1] = cells[2] = 1;
      cells[size] = cells[size + 2] = -1;
      const request = { ...task({ cells, turn: -1 }), depth: 4 };
      expect(isThreeSearchTask(request)).toBe(true);
      const result = solveThree(request);
      expect(result.complete).toBe(true);
      expect(result.move).toBe(3);
      expect(result.nodes).toBeLessThanOrEqual(100_000);
      expect(tacticalFallback(request.position)).toBe(3);
      expect(() => threeRules(-1).apply(request.position, cells.length)).toThrow("Illegal move");
    }
  });

  it("rejects unbounded or malformed worker tasks", () => {
    const valid = task({ cells: [1, 0, 0, 0, 0, 0, 0, 0, 0], turn: -1 });
    expect(isThreeSearchTask(valid)).toBe(true);
    for (const patch of [
      { maxNodes: 100_001 },
      { depth: 10 },
      { simulations: 641 },
      { seed: -1 },
      { maxNodes: Number.NaN },
      { position: { cells: [0], turn: 1 } },
      { method: "remote" },
    ])
      expect(isThreeSearchTask({ ...valid, ...patch })).toBe(false);
  });

  it("proves the full-depth Veteran search cannot lose to any legal opponent from either side", () => {
    for (const cpu of [1, -1] as const) {
      const rules = threeRules(cpu);
      const visited = new Set<string>();
      const explore = (position: ThreePosition): void => {
        const terminal = rules.terminal(position);
        if (terminal !== null) {
          expect(terminal).toBeGreaterThanOrEqual(0);
          return;
        }
        const key = `${position.turn}:${position.cells.join(",")}`;
        if (visited.has(key)) return;
        visited.add(key);
        if (position.turn === cpu) {
          const result = solveThree(task(position));
          expect(result.complete).toBe(true);
          expect(rules.moves(position)).toContain(result.move);
          explore(rules.apply(position, result.move!));
        } else {
          for (const move of rules.moves(position)) explore(rules.apply(position, move));
        }
      };
      explore({ cells: Array(9).fill(0), turn: 1 });
      expect(visited.size).toBeGreaterThan(10);
    }
  });
});

describe("Tic-Tac-Toe cabinet", () => {
  it("uses the chosen difficulty, drains early input and applies a validated worker move", async () => {
    const search = vi.fn(async (_task: ThreeSearchTask, _canvas: HTMLCanvasElement) => ({
      move: 0,
      score: 0,
      nodes: 5,
      complete: true,
    }));
    const { game, context, input, canvas } = setup(search);
    tap(input, "primary");
    game.fixedUpdate(0.02);
    expect(announcement(context)).toContain("row 2: empty, X, empty");
    // Presses during the CPU turn cannot leak into the next human turn.
    tap(input, "primary");
    game.fixedUpdate(0.02);
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]![0]).toMatchObject({
      depth: AI_PROFILES.veteran.searchDepth,
      maxNodes: 100_000,
    });
    expect(search.mock.calls[0]![1]).toBe(canvas);
    await Promise.resolve();
    game.fixedUpdate(1);
    expect(announcement(context)).toContain("CPU / O played row 1, column 1 using search");
    game.fixedUpdate(0.1);
    expect(announcement(context)).toContain("row 2: empty, X, empty");
    expect(context.reportGameOver).not.toHaveBeenCalled();
    game.destroy();
  });

  it("cancels pending work on suspend or settings change and ignores late replies", async () => {
    let reply!: (value: SearchResult<number>) => void;
    const search = vi.fn(
      (
        _task: ThreeSearchTask,
        _canvas: HTMLCanvasElement,
        _timeout?: number,
        _signal?: AbortSignal,
      ) =>
        new Promise<SearchResult<number>>((resolve) => {
          reply = resolve;
        }),
    );
    const { game, input, context } = setup(search);
    tap(input, "primary");
    game.fixedUpdate(0.1);
    game.fixedUpdate(0.1);
    const signal = search.mock.calls[0]![3]!;
    game.suspend();
    expect(signal.aborted).toBe(true);
    reply({ move: 0, score: 0, nodes: 5, complete: true });
    await Promise.resolve();
    expect(announcement(context)).not.toContain("using search");
    game.fixedUpdate(0.1);
    expect(search).toHaveBeenCalledTimes(2);
    const nextSignal = search.mock.calls[1]![3]!;
    context.settings.tictactoeDifficulty = "easy";
    game.settingsChanged();
    expect(nextSignal.aborted).toBe(true);
    game.destroy();
  });

  it("falls back safely on an invalid worker result without losing a turn", async () => {
    const search = vi.fn(async () => ({ move: 4, score: 0, nodes: 5, complete: true }));
    const { game, input, context } = setup(search);
    tap(input, "primary");
    game.fixedUpdate(0.02);
    game.fixedUpdate(0.02);
    await Promise.resolve();
    game.fixedUpdate(1);
    expect(announcement(context)).toContain("using fallback");
    expect(announcement(context)).toContain("row 1: O, empty, empty");
    game.destroy();
  });

  it("supports five levels and never records a watched or partly watched run", () => {
    const { game, context } = setup();
    for (const level of AI_LEVELS) {
      context.settings.tictactoeDifficulty = level;
      game.settingsChanged();
    }
    expect(game.recordsAllowed).toBe(true);
    context.settings.tictactoeWatch = true;
    game.settingsChanged();
    expect(game.recordsAllowed).toBe(false);
    context.settings.tictactoeWatch = false;
    game.settingsChanged();
    expect(game.recordsAllowed).toBe(false);
    game.init(context);
    expect(game.recordsAllowed).toBe(true);
    game.destroy();
  });

  it("resets and aborts a search when the board size changes", async () => {
    const search = vi.fn(
      (
        _task: ThreeSearchTask,
        _canvas: HTMLCanvasElement,
        _timeout?: number,
        _signal?: AbortSignal,
      ) => new Promise<SearchResult<number>>(() => {}),
    );
    const { game, input, context } = setup(search);
    tap(input, "primary");
    game.fixedUpdate(0.02);
    game.fixedUpdate(0.02);
    const pending = search.mock.calls[0]![3]!;
    context.settings.tictactoeSize = "5";
    game.settingsChanged();
    expect(pending.aborted).toBe(true);
    expect(announcement(context)).toContain("Board size changed");
    expect(announcement(context)).toContain("row 5: empty, empty, empty, empty, empty");
    expect(announcement(context)).toContain("Selected row 3, column 3");
    tap(input, "primary");
    game.fixedUpdate(0.02);
    game.fixedUpdate(0.02);
    expect(search.mock.calls[1]![0].position.cells).toHaveLength(25);
    expect(search.mock.calls[1]![0].depth).toBe(4);
    game.destroy();
  });

  it("allows a website hot-seat win using shared controls without a solo record", () => {
    const { input, context } = setup();
    const game = new TicTacToeLocalGame();
    game.init(context);
    const step = (action: "up" | "down" | "left" | "right" | "primary") => {
      tap(input, action);
      game.fixedUpdate(0.02);
    };
    step("primary");
    step("primary");
    expect(announcement(context)).toContain("That square is occupied");
    expect(announcement(context)).toContain("PLAYER 2 / O turn");
    for (const action of [
      "up",
      "left",
      "primary",
      "down",
      "primary",
      "up",
      "right",
      "primary",
      "down",
      "right",
      "primary",
    ] as const)
      step(action);
    expect(game.resultLabel).toBe("PLAYER 1 / X WINS");
    expect(game.recordsAllowed).toBe(false);
    expect(context.reportGameOver).toHaveBeenCalledTimes(1);
    expect(announcement(context)).toContain("PLAYER 1 / X WINS");
    game.destroy();
  });
});
