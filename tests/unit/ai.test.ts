import { describe, expect, it, vi } from "vitest";
import {
  AdaptiveDifficulty,
  AI_LEVELS,
  AI_PROFILES,
  aimError,
  makesMistake,
  ReactionClock,
} from "../../src/ai/difficulty";
import { minimax, monteCarlo } from "../../src/ai/search";
import { solveThree, threeRules, type ThreePosition } from "../../src/ai/three-in-row";
import { AIWorkerTimeout, runWorker } from "../../src/ai/worker-client";
import { RNG } from "../../src/shared/rng";

describe("shared AI tools", () => {
  it("offers five ordered tiers while retaining the three legacy Pong values", () => {
    expect(AI_LEVELS).toEqual(["rookie", "easy", "regular", "hard", "veteran"]);
    for (let index = 1; index < AI_LEVELS.length; index++) {
      const easier = AI_PROFILES[AI_LEVELS[index - 1]!];
      const harder = AI_PROFILES[AI_LEVELS[index]!];
      expect(harder.reactionSeconds).toBeLessThan(easier.reactionSeconds);
      expect(harder.errorChance).toBeLessThan(easier.errorChance);
      expect(harder.searchDepth).toBeGreaterThan(easier.searchDepth);
      expect(harder.simulations).toBeGreaterThan(easier.simulations);
    }
  });

  it("uses seeded reaction and error helpers", () => {
    const clock = new ReactionClock();
    expect(clock.tick(0.1, 0.2)).toBe(false);
    expect(clock.tick(0.11, 0.2)).toBe(true);
    expect(clock.tick(0.1, 0.2)).toBe(false);
    clock.reset();
    expect(clock.tick(0.1, 0.2)).toBe(false);
    const a = new RNG(42),
      b = new RNG(42);
    for (let index = 0; index < 30; index++) {
      expect(aimError(a, 20)).toBe(aimError(b, 20));
      expect(makesMistake(a, "regular")).toBe(makesMistake(b, "regular"));
    }
  });

  it("adapts gradually and stays within the five tiers", () => {
    const ai = new AdaptiveDifficulty("regular");
    ai.record("win");
    ai.record("win");
    expect(ai.level).toBe("regular");
    expect(ai.record("win")).toBe("hard");
    ai.record("loss");
    ai.record("win");
    ai.record("draw");
    expect(ai.level).toBe("hard");
    ai.record("loss");
    ai.record("loss");
    expect(ai.record("loss")).toBe("regular");
    ai.reset("rookie");
    for (let index = 0; index < 12; index++) ai.record("loss");
    expect(ai.level).toBe("rookie");
    ai.reset("veteran");
    for (let index = 0; index < 12; index++) ai.record("win");
    expect(ai.level).toBe("veteran");
  });

  it("minimax wins, blocks a forced loss, and stops at the node budget", () => {
    const win: ThreePosition = { cells: [1, 1, 0, -1, -1, 0, 0, 0, 0], turn: 1 };
    const block: ThreePosition = { cells: [-1, -1, 0, 1, 0, 0, 0, 1, 0], turn: 1 };
    const rules = threeRules(1);
    expect(minimax(win, rules, { depth: 9, maxNodes: 100_000 }).move).toBe(2);
    expect(minimax(block, rules, { depth: 9, maxNodes: 100_000 }).move).toBe(2);
    const bounded = minimax(block, rules, { depth: 9, maxNodes: 1 });
    expect(bounded.nodes).toBeLessThanOrEqual(1);
    expect(bounded.complete).toBe(false);
    expect(rules.moves(block)).toContain(bounded.move);
  });

  it("runs reproducible Monte Carlo playouts and validates worker tasks", () => {
    const position: ThreePosition = { cells: [1, 0, 0, 0, -1, 0, 0, 0, 0], turn: 1 };
    const rules = threeRules(1);
    const a = monteCarlo(position, rules, new RNG(42), { simulations: 100, maxPlayout: 9 });
    const b = monteCarlo(position, rules, new RNG(42), { simulations: 100, maxPlayout: 9 });
    expect(a).toEqual(b);
    expect(rules.moves(position)).toContain(a.move);
    expect(Number.isFinite(a.score)).toBe(true);
    const few = monteCarlo(position, rules, new RNG(2), { simulations: 1, maxPlayout: 9 });
    expect(Number.isFinite(few.score)).toBe(true);
    expect(() =>
      solveThree({ kind: "three-in-row", position: { cells: [], turn: 1 } } as never),
    ).toThrow("Invalid search task");
  });
});

class FakeWorker extends EventTarget {
  terminate = vi.fn();
  postMessage = vi.fn();
}

describe("AI worker deadline", () => {
  it("terminates after success and ignores late messages", async () => {
    const worker = new FakeWorker();
    const promise = runWorker<{ seed: number }, number>(
      () => worker as unknown as Worker,
      { seed: 2 },
      100,
    );
    worker.dispatchEvent(new MessageEvent("message", { data: { ok: true, result: 7 } }));
    await expect(promise).resolves.toBe(7);
    expect(worker.postMessage).toHaveBeenCalledWith({ seed: 2 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    worker.dispatchEvent(new MessageEvent("message", { data: { ok: true, result: 8 } }));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates timed-out and cancelled searches", async () => {
    vi.useFakeTimers();
    try {
      const slow = new FakeWorker();
      const pending = runWorker(() => slow as unknown as Worker, {}, 100);
      const timeout = expect(pending).rejects.toBeInstanceOf(AIWorkerTimeout);
      await vi.advanceTimersByTimeAsync(100);
      await timeout;
      expect(slow.terminate).toHaveBeenCalledTimes(1);
      const aborter = new AbortController();
      const cancelled = new FakeWorker();
      const cancelledPromise = runWorker(
        () => cancelled as unknown as Worker,
        {},
        500,
        aborter.signal,
      );
      aborter.abort();
      await expect(cancelledPromise).rejects.toMatchObject({ name: "AbortError" });
      expect(cancelled.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
