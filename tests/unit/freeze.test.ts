// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Engine } from "../../src/engine/engine";
import type { ArcadeGame } from "../../src/games/types";
import { SNAKE_MANIFEST } from "../../src/games/manifest";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("completion freezes the current simulation and resumes without reinitializing it", () => {
  let now = 0,
    id = 0,
    position = 0,
    initializations = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => {
    frames.delete(key);
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const ctx = new Proxy(
    { imageSmoothingEnabled: false },
    {
      get(target, prop) {
        if (prop === "createPattern") return () => null;
        if (prop in target) return Reflect.get(target, prop);
        return () => {};
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never);
  const game: ArcadeGame = {
    manifest: {
      ...SNAKE_MANIFEST,
      id: "fixture",
      name: "FIXTURE",
      description: "",
      controls: "",
      defaultDifficulty: "standard",
      supports: [],
    },
    score: 0,
    readyHint: "",
    init() {
      initializations++;
    },
    fixedUpdate() {
      position++;
    },
    render() {},
    destroy() {},
  };
  const engine = new Engine(document.createElement("canvas"), {
    settings: { ...DEFAULT_SETTINGS, skipBoot: true },
    highScore: 0,
  });
  engine.setGame(game);
  engine.start();
  (engine as unknown as { setState(state: "playing"): void }).setState("playing");
  const tick = () => {
    now += 17;
    const [key, callback] = [...frames.entries()][0]!;
    frames.delete(key);
    callback(now);
  };
  tick();
  expect(position).toBe(1);
  engine.freezeForDone();
  expect(engine.getState()).toBe("paused");
  expect(frames.size).toBe(0);
  const saved = position;
  now += 5000;
  engine.resumeFromDone();
  expect(engine.getState()).toBe("playing");
  expect(position).toBe(saved);
  expect(initializations).toBe(1);
  tick();
  expect(position).toBe(saved + 1);
  engine.destroy();
  expect(frames.size).toBe(0);
});
