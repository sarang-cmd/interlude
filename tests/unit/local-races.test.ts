// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "../../src/engine/input";
import { SNAKE_MANIFEST } from "../../src/games/manifest";
import type { ArcadeGame, GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";
import { SplitRaceGame } from "../../src/twoplayer/split-race";
import {
  appendRaceRecord,
  defaultRaceSettings,
  raceActions,
  raceBindingError,
  RACE_GAMES,
  RACE_RECORDS_KEY,
  raceSettingsKey,
  readRaceRecords,
  readRaceSettings,
  saveRaceSettings,
  type RaceResult,
} from "../../src/twoplayer/race-settings";
import { localModesFor, loadLocalGame } from "../../src/twoplayer/registry";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});

class TestGame implements ArcadeGame {
  readonly manifest = SNAKE_MANIFEST;
  readonly readyHint = "TEST";
  score = 0;
  context!: GameContext;
  init(context: GameContext): void {
    this.context = context;
  }
  fixedUpdate(): void {
    if (this.context.input.wasPressedWithin("up", 1000, true)) this.score += 10;
    if (this.context.input.wasPressedWithin("down", 1000, true)) this.score += 20;
  }
  render(): void {}
  destroy(): void {}
}

function setup() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    imageSmoothingEnabled: false,
  } as unknown as CanvasRenderingContext2D);
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  document.body.append(canvas);
  const input = new Input();
  input.attach(canvas, () => ({ x: 0, y: 0 }));
  input.setEnabled(true);
  const children: TestGame[] = [];
  const game = new SplitRaceGame("snake", () => {
    const child = new TestGame();
    children.push(child);
    return child;
  });
  const ctx = {
    canvas,
    width: 640,
    height: 360,
    input,
    rng: new RNG(42),
    settings: { ...DEFAULT_SETTINGS },
    sound: { play: vi.fn() },
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  const settings = defaultRaceSettings("snake");
  settings.seed = 42;
  settings.seconds = 30;
  game.configureLocal(settings);
  game.init(ctx);
  return { game, ctx, input, canvas, children, settings };
}

describe("website-only split races", () => {
  it("loads every original race from a separate web-only module", async () => {
    for (const id of RACE_GAMES) {
      expect(localModesFor(id).map((mode) => mode.id)).toEqual(["local"]);
      const game = await loadLocalGame(id, "local");
      expect(game.manifest.id).toBe(id);
      expect(game.recordsAllowed).toBe(false);
    }
    await expect(loadLocalGame("missing", "local")).rejects.toThrow("Mode unavailable");
    await expect(loadLocalGame("snake", "network")).rejects.toThrow("Mode unavailable");
  });

  it("gives both original games the same seed, a shared clock, and no solo record", () => {
    const { game, ctx, children } = setup();
    const result = vi.fn();
    game.onResult = result;
    const first = children.slice(-2);
    expect(first[0]!.context.rng.getState()).toBe(first[1]!.context.rng.getState());
    expect(first[0]!.context.rng.getState()).toBe(42);
    expect(first[0]!.context.preview).toBe(true);
    expect(first[0]!.context.settings.twenty48Seconds).toBe(0);
    game.fixedUpdate(40);
    expect(result).toHaveBeenCalledTimes(1);
    expect(result.mock.calls[0]![0]).toMatchObject({
      scores: [0, 0],
      adjusted: [0, 0],
      survival: [30, 30],
      winner: null,
      seed: 42,
    });
    expect(ctx.reportGameOver).toHaveBeenCalledTimes(1);
    expect(game.recordsAllowed).toBe(false);
    game.fixedUpdate(1);
    expect(result).toHaveBeenCalledTimes(1);
    game.destroy();
    game.init(ctx);
    expect(children.slice(-2)[0]!.context.rng.getState()).toBe(43);
    game.resetSeries();
    game.destroy();
    game.init(ctx);
    expect(children.slice(-2)[1]!.context.rng.getState()).toBe(42);
    game.destroy();
  });

  it("routes simultaneous keys independently, releases on blur and keeps start taps", () => {
    const { game, canvas, ctx, children, input } = setup();
    const down = (code: string) =>
      canvas.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
    const up = (code: string) =>
      canvas.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }));
    down("KeyW");
    down("ArrowDown");
    expect(children.at(-2)!.context.input.isDown("up")).toBe(true);
    expect(children.at(-1)!.context.input.isDown("down")).toBe(true);
    game.fixedUpdate(0.1);
    expect(children.at(-2)!.score).toBe(10);
    expect(children.at(-1)!.score).toBe(20);
    up("KeyW");
    canvas.dispatchEvent(new FocusEvent("blur"));
    expect(children.at(-1)!.context.input.isDown("down")).toBe(false);
    game.destroy();
    game.init(ctx);
    game.setControl(0, "up", true, "tap");
    game.setControl(0, "up", false, "tap");
    // The engine rebuilds game instances once a start gesture is detected.
    game.destroy();
    game.init(ctx);
    game.fixedUpdate(0.1);
    expect(children.at(-2)!.score).toBe(10);
    game.destroy();
    input.detach();
  });

  it("keeps each gamepad assigned when the other controller disconnects", () => {
    const { game, children, input } = setup();
    const pads: Array<{ connected: boolean; axes: number[]; buttons: never[] } | null> = [
      { connected: true, axes: [0, -1], buttons: [] },
      { connected: true, axes: [0, 1], buttons: [] },
    ];
    vi.stubGlobal("navigator", { getGamepads: () => pads });
    game.fixedUpdate(0.1);
    expect(children.at(-2)!.score).toBe(10);
    expect(children.at(-1)!.score).toBe(20);
    pads[0] = null;
    pads[1]!.axes[1] = -1;
    game.fixedUpdate(0.1);
    expect(children.at(-2)!.score).toBe(10);
    expect(children.at(-1)!.score).toBe(30);
    game.destroy();
    input.detach();
  });

  it("polls two gamepads, uses score handicaps, and breaks ties with survival", async () => {
    const { game, settings, ctx, children, input } = setup();
    settings.handicap = [200, 100];
    game.configureLocal(settings);
    game.destroy();
    game.init(ctx);
    vi.stubGlobal("navigator", {
      getGamepads: () => [
        { connected: true, axes: [0, -1], buttons: [] },
        { connected: true, axes: [0, 1], buttons: [] },
      ],
    });
    const result = vi.fn();
    game.onResult = result;
    game.fixedUpdate(1);
    expect(children.at(-2)!.score).toBe(10);
    expect(children.at(-1)!.score).toBe(20);
    await children.at(-2)!.context.reportGameOver();
    game.fixedUpdate(1);
    await children.at(-1)!.context.reportGameOver();
    game.fixedUpdate(0.01);
    expect(result).toHaveBeenCalledTimes(1);
    expect(result.mock.calls[0]![0]).toMatchObject({
      scores: [10, 20],
      adjusted: [20, 20],
      survival: [1, 2],
      winner: 2,
    });
    game.destroy();
    input.detach();
  });
});

describe("race settings and local history", () => {
  it("offers non-conflicting keys for every game and rejects invalid choices", () => {
    for (const game of RACE_GAMES) {
      const settings = defaultRaceSettings(game);
      expect(raceBindingError(game, settings.keys)).toBeNull();
      const action = raceActions(game)[0]![0];
      settings.keys[1][action] = settings.keys[0][action];
      expect(raceBindingError(game, settings.keys)).toMatch(/different key/);
      settings.keys[1][action] = "KeyP";
      expect(raceBindingError(game, settings.keys)).toMatch(/reserved/);
    }
  });

  it("validates stored preferences and keeps 100 local results", () => {
    const settings = defaultRaceSettings("snake");
    settings.names = ["ANA", "BO"];
    settings.seconds = 60;
    saveRaceSettings(localStorage, "snake", settings);
    expect(readRaceSettings(localStorage, "snake")).toEqual(settings);
    localStorage.setItem(raceSettingsKey("snake"), '{"seconds":-5,"keys":[{},{}],"seed":-1}');
    expect(readRaceSettings(localStorage, "snake")).toEqual(defaultRaceSettings("snake"));
    const record: RaceResult = {
      game: "snake",
      playedAt: 123,
      names: ["ANA", "BO"],
      scores: [10, 20],
      adjusted: [20, 20],
      handicap: [200, 100],
      survival: [1, 2],
      winner: 2,
      seed: 42,
    };
    let records: RaceResult[] = [];
    for (let i = 0; i < 105; i++)
      records = appendRaceRecord(localStorage, { ...record, playedAt: i }, records);
    expect(records).toHaveLength(100);
    expect(readRaceRecords(localStorage)[0]!.playedAt).toBe(5);
    localStorage.setItem(RACE_RECORDS_KEY, "not json");
    expect(readRaceRecords(localStorage)).toEqual([]);
    expect(appendRaceRecord(null, record, [record])).toHaveLength(2);
  });
});
