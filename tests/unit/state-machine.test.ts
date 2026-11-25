import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationMachine, type MachineSnapshot } from "../../src/adapters/claude/stateMachine";

afterEach(() => vi.useRealTimers());
describe("generation vote", () => {
  it("requires two of A, B, C and debounces the end", () => {
    vi.useFakeTimers();
    const changes: MachineSnapshot[] = [];
    const machine = new GenerationMachine((state) => changes.push(state), 650, 4000);
    machine.arm();
    expect(machine.snapshot.phase).toBe("starting");
    machine.update({ a: true, b: false, c: false });
    expect(machine.snapshot.generating).toBe(false);
    machine.update({ a: true, b: true, c: false });
    expect(machine.snapshot.phase).toBe("generating");
    machine.update({ a: false, b: true, c: false });
    expect(machine.snapshot.phase).toBe("finishing");
    vi.advanceTimersByTime(500);
    expect(machine.snapshot.generating).toBe(true);
    machine.update({ a: false, b: true, c: true });
    expect(machine.snapshot.phase).toBe("generating");
    vi.advanceTimersByTime(1000);
    expect(machine.snapshot.phase).toBe("generating");
    machine.update({ a: false, b: false, c: true });
    vi.advanceTimersByTime(650);
    expect(machine.snapshot.phase).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
    expect(changes.some((x) => x.phase === "finishing")).toBe(true);
  });
  it("stops speculative observation if a submit produces no generation", () => {
    vi.useFakeTimers();
    const machine = new GenerationMachine(() => {}, 650, 200);
    machine.arm();
    vi.advanceTimersByTime(200);
    expect(machine.snapshot.phase).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("accepts every two-of-three combination", () => {
    for (const votes of [
      { a: true, b: true, c: false },
      { a: true, b: false, c: true },
      { a: false, b: true, c: true },
    ]) {
      const machine = new GenerationMachine(() => {});
      machine.update(votes);
      expect(machine.snapshot.generating).toBe(true);
      machine.reset();
    }
  });
});
