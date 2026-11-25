// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Engine } from "../../src/engine/engine";
import { SNAKE_MANIFEST } from "../../src/games/manifest";
import type { ArcadeGame } from "../../src/games/types";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function canvas(): HTMLCanvasElement {
  const context = new Proxy(
    { imageSmoothingEnabled: false },
    {
      get(target, property) {
        if (property === "createPattern") return () => null;
        if (property in target) return Reflect.get(target, property);
        return () => {};
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as never);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  return document.createElement("canvas");
}
function fixture(recordsAllowed = true): ArcadeGame {
  return {
    manifest: SNAKE_MANIFEST,
    readyHint: "",
    score: 900,
    recordsAllowed,
    init: vi.fn(),
    fixedUpdate: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn(),
  };
}

it("substeps fast simulation rather than giving games a collision-skipping delta", () => {
  const game = fixture();
  const engine = new Engine(canvas(), {
    settings: { ...DEFAULT_SETTINGS, skipBoot: true, "game.snake.speed": 400 },
    highScore: 0,
  });
  engine.setGame(game);
  engine.start();
  const internal = engine as unknown as {
    setState(state: "playing"): void;
    fixedUpdate(dt: number): void;
  };
  internal.setState("playing");
  internal.fixedUpdate(1 / 60);
  expect(game.fixedUpdate).toHaveBeenCalledTimes(4);
  for (const [step] of vi.mocked(game.fixedUpdate).mock.calls) expect(step).toBeCloseTo(1 / 60);
  engine.destroy();
});

it("ends a watched run without writing or replacing a player's record", async () => {
  const sendMessage = vi.fn();
  vi.stubGlobal("chrome", { runtime: { id: "test", sendMessage } });
  const game = fixture(false);
  const onHighScore = vi.fn();
  const engine = new Engine(canvas(), {
    settings: { ...DEFAULT_SETTINGS, skipBoot: true },
    highScore: 42,
    onHighScore,
  });
  engine.setGame(game, 42);
  engine.start();
  (engine as unknown as { setState(state: "playing"): void }).setState("playing");
  await engine.reportGameOver();
  expect(engine.getState()).toBe("gameover");
  expect(engine.highScore).toBe(42);
  expect(engine.wasRecord).toBe(false);
  expect(sendMessage).not.toHaveBeenCalled();
  expect(onHighScore).not.toHaveBeenCalled();
  engine.destroy();
});
