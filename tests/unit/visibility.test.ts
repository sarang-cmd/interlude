// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Engine } from "../../src/engine/engine";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";
import type { ArcadeGame } from "../../src/games/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("tab-hidden stops every queued frame and returning resumes only an active cabinet", () => {
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  const ctx = new Proxy(
    { imageSmoothingEnabled: false },
    {
      get(target, prop) {
        if (prop === "createRadialGradient") return () => ({ addColorStop: () => {} });
        if (prop === "createPattern") return () => null;
        if (prop in target) return Reflect.get(target, prop);
        return () => {};
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never);
  const game: ArcadeGame = {
    manifest: {
      id: "fixture",
      name: "FIXTURE",
      description: "",
      controls: "",
      defaultDifficulty: "standard",
      supports: [],
    },
    score: 0,
    readyHint: "",
    init() {},
    fixedUpdate() {},
    render() {},
    destroy() {},
  };
  const engine = new Engine(document.createElement("canvas"), {
    settings: { ...DEFAULT_SETTINGS, skipBoot: true },
    highScore: 0,
  });
  engine.setGame(game);
  engine.start();
  expect(engine.isLoopRunning).toBe(true);
  expect(frames.size).toBe(1);
  engine.setTabHidden(true);
  expect(engine.isLoopRunning).toBe(false);
  expect(frames.size).toBe(0);
  engine.setTabHidden(false);
  expect(engine.isLoopRunning).toBe(true);
  expect(frames.size).toBe(1);
  engine.stop();
  engine.setTabHidden(false);
  expect(frames.size).toBe(0);
  engine.destroy();
});

it("freezes audio and accepts a retry immediately even during hit-stop", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
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
      id: "retry",
      name: "RETRY",
      description: "",
      controls: "",
      defaultDifficulty: "standard",
      supports: [],
    },
    score: 0,
    readyHint: "",
    init() {},
    fixedUpdate() {},
    render() {},
    destroy() {},
  };
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const engine = new Engine(canvas, {
    settings: { ...DEFAULT_SETTINGS, skipBoot: true },
    highScore: 0,
  });
  engine.attachInput(canvas);
  engine.setGame(game);
  engine.start();
  engine.setFocused(true);
  const internal = engine as unknown as { setState(state: "playing"): void };
  internal.setState("playing");
  engine.hitStop(500);
  await engine.reportGameOver();
  canvas.dispatchEvent(
    new KeyboardEvent("keydown", { key: "q", code: "KeyQ", bubbles: true, cancelable: true }),
  );
  expect(engine.getState()).toBe("playing");
  const silence = vi.spyOn(engine.sound, "silence");
  engine.freezeForDone();
  expect(silence).toHaveBeenCalled();
  expect(engine.isLoopRunning).toBe(false);
  engine.destroy();
  canvas.remove();
});
