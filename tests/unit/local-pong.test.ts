// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "../../src/engine/input";
import { PongLocalGame } from "../../src/games/pong/pong.2p";
import type { PongLogic } from "../../src/games/pong/logic";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";
import {
  appendLocalPongRecord,
  bindingError,
  cleanPlayerName,
  defaultLocalPongSettings,
  readLocalPongRecords,
  readLocalPongSettings,
  saveLocalPongSettings,
} from "../../src/twoplayer/pong-settings";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function setup() {
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  document.body.append(canvas);
  const input = new Input();
  input.attach(canvas, () => ({ x: 0, y: 0 }));
  input.setEnabled(true);
  const game = new PongLocalGame();
  const ctx = {
    canvas,
    width: 640,
    height: 360,
    input,
    rng: new RNG(9),
    settings: { ...DEFAULT_SETTINGS, pongFirstTo: 1 },
    sound: { play: vi.fn() },
    shake: vi.fn(),
    scorePop: vi.fn(),
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  game.init(ctx);
  const logic = (game as unknown as { logic: PongLogic }).logic;
  return { canvas, input, game, ctx, logic };
}

describe("local Pong controls and result", () => {
  it("moves both paddles with simultaneous keys and restores the solo keymap", () => {
    const { canvas, input, game, logic } = setup();
    game.fixedUpdate(1);
    const left = logic.playerY;
    const right = logic.aiY;
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true, cancelable: true }),
    );
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    game.fixedUpdate(0.1);
    expect(logic.playerY).toBeLessThan(left);
    expect(logic.aiY).toBeGreaterThan(right);
    canvas.dispatchEvent(new KeyboardEvent("keyup", { key: "w", code: "KeyW", bubbles: true }));
    canvas.dispatchEvent(
      new KeyboardEvent("keyup", { key: "ArrowDown", code: "ArrowDown", bubbles: true }),
    );
    game.destroy();
    expect(input.actionFor("ArrowUp")).toBe("up");
    input.detach();
  });

  it("uses a second focused gamepad and respects per-player speed", () => {
    const { game, logic, input } = setup();
    const settings = defaultLocalPongSettings();
    settings.speeds = [100, 70];
    game.configureLocal(settings);
    vi.stubGlobal("navigator", {
      getGamepads: () => [
        { connected: true, axes: [0, 0], buttons: [] },
        { connected: true, axes: [0, 1], buttons: [] },
      ],
    });
    game.fixedUpdate(1);
    const start = logic.aiY;
    game.fixedUpdate(0.1);
    expect(logic.aiY - start).toBeCloseTo(30.1);
    input.setEnabled(false);
    const end = logic.aiY;
    game.fixedUpdate(0.1);
    expect(logic.aiY).toBe(end);
    game.destroy();
    input.detach();
  });

  it("uses a reproducible seed and alternates the opening serve across rounds", () => {
    const { game, ctx, input } = setup();
    const settings = defaultLocalPongSettings();
    settings.seed = 12345;
    game.configureLocal(settings);
    game.destroy();
    game.init(ctx);
    let logic = (game as unknown as { logic: PongLogic }).logic;
    game.fixedUpdate(1);
    const first = { vx: logic.ball.vx, vy: logic.ball.vy };
    logic.ball = { x: 660, y: 200, vx: 300, vy: 0 };
    game.fixedUpdate(0.01);
    game.destroy();
    game.init(ctx);
    logic = (game as unknown as { logic: PongLogic }).logic;
    game.fixedUpdate(1);
    expect(logic.ball.vx).toBeCloseTo(-first.vx);
    expect(logic.ball.vy).toBeCloseTo(first.vy);
    game.resetSeries();
    game.destroy();
    game.init(ctx);
    logic = (game as unknown as { logic: PongLogic }).logic;
    game.fixedUpdate(1);
    expect(logic.ball.vx).toBeCloseTo(first.vx);
    game.destroy();
    input.detach();
  });

  it("reports a local result once without touching the solo record path", () => {
    const { game, logic, ctx, input } = setup();
    const result = vi.fn();
    game.onResult = result;
    game.fixedUpdate(1);
    logic.ball = { x: 660, y: 200, vx: 300, vy: 0 };
    game.fixedUpdate(0.01);
    game.fixedUpdate(0.01);
    expect(result).toHaveBeenCalledTimes(1);
    expect(result).toHaveBeenCalledWith({ winner: 1, scores: [1, 0] });
    expect(ctx.reportGameOver).toHaveBeenCalledTimes(1);
    expect(game.recordsAllowed).toBe(false);
    expect(game.resultLabel).toContain("PLAYER 1 WINS");
    game.destroy();
    input.detach();
  });
});

describe("local match preferences", () => {
  it("rejects conflicting or reserved bindings and cleans names", () => {
    const settings = defaultLocalPongSettings();
    expect(bindingError(settings.keys)).toBeNull();
    expect(bindingError({ ...settings.keys, p2Up: settings.keys.p1Up })).toMatch(/different key/i);
    expect(bindingError({ ...settings.keys, p2Up: "KeyP" })).toMatch(/reserved/i);
    expect(cleanPlayerName("  Ana\u0000  ", "P1")).toBe("Ana");
    expect(cleanPlayerName("", "P1")).toBe("P1");
  });

  it("persists only local settings and bounded match history", () => {
    const settings = defaultLocalPongSettings();
    settings.names = ["ANA", "BO"];
    settings.keys.p2Up = "KeyI";
    saveLocalPongSettings(localStorage, settings);
    expect(readLocalPongSettings(localStorage)).toEqual(settings);
    const record = {
      playedAt: 123,
      names: ["ANA", "BO"] as [string, string],
      scores: [1, 0] as [number, number],
      winner: 1 as const,
    };
    appendLocalPongRecord(localStorage, record);
    expect(readLocalPongRecords(localStorage)).toEqual([record]);
    const withoutStorage = appendLocalPongRecord(null, record, [record]);
    expect(withoutStorage).toHaveLength(2);
    localStorage.clear();
  });
});
