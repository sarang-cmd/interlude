import { afterEach, describe, expect, it, vi } from "vitest";
import { GameLoop } from "../../src/engine/loop";
import { SceneStack } from "../../src/engine/sceneStack";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("engine clock", () => {
  it("updates at 60 Hz, interpolates, throttles rendering, and cancels all idle frames", () => {
    let id = 0,
      now = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.set(++id, fn);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (n: number) => {
      frames.delete(n);
    });
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const loop = new GameLoop();
    const updates: number[] = [],
      renders: number[] = [];
    loop.onFixedUpdate = (dt) => updates.push(dt);
    loop.onRender = (alpha) => renders.push(alpha);
    const tick = (dt: number) => {
      now += dt;
      const [key, cb] = [...frames.entries()][0]!;
      frames.delete(key);
      cb(now);
    };
    loop.start();
    expect(frames.size).toBe(1);
    tick(17);
    tick(17);
    expect(updates.length).toBe(2);
    expect(updates[0]).toBeCloseTo(1 / 60);
    expect(renders.every((alpha) => alpha >= 0 && alpha <= 1)).toBe(true);
    loop.setLowRate(true);
    const before = renders.length;
    const beforeUpdates = updates.length;
    tick(17);
    tick(17);
    tick(17);
    tick(17);
    expect(renders.length - before).toBe(2);
    expect(updates.length - beforeUpdates).toBe(2);
    loop.hitStop(100);
    const count = updates.length;
    tick(17);
    tick(17);
    expect(updates.length).toBe(count);
    loop.stop();
    expect(frames.size).toBe(0);
    expect(loop.isRunning).toBe(false);
  });
  it("restores the underlying scene after a modal pause", () => {
    const scenes = new SceneStack("ready");
    scenes.replace("playing");
    scenes.push("paused");
    expect(scenes.current).toBe("paused");
    expect(scenes.pop()).toBe("playing");
  });
});

it("does not perform catch-up steps or render after a callback stops the loop", () => {
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockReturnValue(0);
  const loop = new GameLoop();
  const update = vi.fn(() => loop.stop());
  const render = vi.fn();
  loop.onFixedUpdate = update;
  loop.onRender = render;
  loop.start();
  frame(100);
  expect(update).toHaveBeenCalledTimes(1);
  expect(render).not.toHaveBeenCalled();
  expect(loop.isRunning).toBe(false);
});
