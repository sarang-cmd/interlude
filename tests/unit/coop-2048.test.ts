// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "../../src/engine/input";
import type { GameContext } from "../../src/games/types";
import { Coop2048Game } from "../../src/games/2048/coop.2p";
import type { Game2048 } from "../../src/games/2048/logic";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";
import {
  appendCoopRecord,
  COOP_RECORDS_KEY,
  COOP_SETTINGS_KEY,
  defaultCoopSettings,
  readCoopRecords,
  readCoopSettings,
  saveCoopSettings,
  type CoopResult,
} from "../../src/twoplayer/coop-settings";
import { loadLocalGame } from "../../src/twoplayer/registry";

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function setup() {
  const canvas = document.createElement("canvas");
  const input = new Input();
  input.attach(canvas, () => ({ x: 0, y: 0 }));
  input.setEnabled(true);
  const game = new Coop2048Game();
  const settings = defaultCoopSettings();
  settings.goal = 128;
  settings.seconds = 30;
  game.configureLocal(settings);
  const ctx = {
    canvas,
    width: 640,
    height: 360,
    input,
    rng: new RNG(1),
    settings: { ...DEFAULT_SETTINGS },
    sound: { play: vi.fn() },
    reportGameOver: vi.fn(async () => {}),
  } as unknown as GameContext;
  game.init(ctx);
  const logic = (game as unknown as { logic: Game2048 }).logic;
  return { game, logic, settings, ctx, input, canvas };
}

describe("shared 2048 co-op", () => {
  it("is web-only and reuses the shared 2048 logic", async () => {
    const game = await loadLocalGame("twenty48", "coop");
    expect(game).toBeInstanceOf(Coop2048Game);
    expect(game.manifest.id).toBe("twenty48");
    expect(game.recordsAllowed).toBe(false);
    await expect(loadLocalGame("snake", "coop")).rejects.toThrow("Mode unavailable");
  });

  it("accepts valid moves in turn, rejects invalid moves, and restores the previous turn on undo", () => {
    const { game, logic, input } = setup();
    const progress = vi.fn();
    const message = vi.fn();
    game.onProgress = progress;
    game.onMessage = message;
    logic.grid = [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    game.pressControl(1, "right");
    game.pressControl(0, "left");
    game.fixedUpdate(0.01);
    expect(progress.mock.lastCall![0]).toMatchObject({ turn: 0, moves: 0 });
    expect(message).toHaveBeenCalledWith("PLAYER 1 moves next.");
    game.pressControl(0, "right");
    game.fixedUpdate(0.01);
    expect(progress.mock.lastCall![0]).toMatchObject({ turn: 1, moves: 1 });
    const movedBoard = JSON.stringify(logic.grid);
    game.pressControl(0, "down");
    game.fixedUpdate(0.01);
    expect(JSON.stringify(logic.grid)).toBe(movedBoard);
    expect(message).toHaveBeenLastCalledWith("PLAYER 2 moves next.");
    game.pressControl(1, "secondary");
    game.fixedUpdate(0.01);
    expect(progress.mock.lastCall![0]).toMatchObject({ turn: 0, moves: 0, undos: 2 });
    expect(logic.grid[0]).toEqual([2, 0, 0, 0]);
    game.destroy();
    input.detach();
  });

  it("reports a team win once without changing solo records", () => {
    const { game, logic, ctx, input } = setup();
    logic.grid = [
      [64, 64, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    logic.bestTile = 64;
    const progress = vi.fn();
    const result = vi.fn();
    game.onProgress = progress;
    game.onResult = result;
    game.pressControl(0, "left");
    game.fixedUpdate(0.01);
    expect(progress).toHaveBeenCalledBefore(result);
    expect(result).toHaveBeenCalledTimes(1);
    expect(result.mock.calls[0]![0]).toMatchObject({
      won: true,
      bestTile: 128,
      goal: 128,
      moves: 1,
    });
    expect(ctx.reportGameOver).toHaveBeenCalledTimes(1);
    expect(game.resultLabel).toMatch(/TEAM WINS/);
    expect(game.recordsAllowed).toBe(false);
    game.fixedUpdate(1);
    expect(result).toHaveBeenCalledTimes(1);
    game.destroy();
    input.detach();
  });

  it("keeps the first start action across initialization and ignores unfocused input", () => {
    const { game, ctx, input } = setup();
    game.pressControl(0, "left");
    game.destroy();
    game.init(ctx);
    const logic = (game as unknown as { logic: Game2048 }).logic;
    logic.grid = [
      [0, 0, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const progress = vi.fn();
    game.onProgress = progress;
    game.fixedUpdate(0.01);
    expect(progress.mock.lastCall![0]).toMatchObject({ turn: 1, moves: 1 });
    input.setEnabled(false);
    game.pressControl(1, "right");
    game.fixedUpdate(0.01);
    expect(progress.mock.lastCall![0]).toMatchObject({ turn: 1, moves: 1 });
    game.destroy();
    input.detach();
  });

  it("routes two gamepads to their own turns", () => {
    const { game, logic, input } = setup();
    logic.grid = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 2],
    ];
    vi.stubGlobal("navigator", {
      getGamepads: () => [
        { connected: true, axes: [0, -1], buttons: [] },
        { connected: true, axes: [-1, 0], buttons: [] },
      ],
    });
    const progress = vi.fn();
    game.onProgress = progress;
    game.fixedUpdate(0.01);
    expect(progress.mock.lastCall![0]).toMatchObject({ turn: 0, moves: 2 });
    game.destroy();
    input.detach();
  });
});

describe("co-op local data", () => {
  it("validates preferences and bounds session records", () => {
    const settings = defaultCoopSettings();
    settings.names = ["ANA", "BO"];
    settings.goal = 128;
    saveCoopSettings(localStorage, settings);
    expect(readCoopSettings(localStorage)).toEqual(settings);
    localStorage.setItem(COOP_SETTINGS_KEY, '{"goal":3,"keys":[{},{}],"undos":-1}');
    expect(readCoopSettings(localStorage)).toEqual(defaultCoopSettings());
    const record: CoopResult = {
      playedAt: 0,
      names: ["ANA", "BO"],
      won: true,
      score: 512,
      bestTile: 128,
      goal: 128,
      moves: 10,
      seconds: 20,
      seed: 2026,
    };
    let records: CoopResult[] = [];
    for (let index = 0; index < 102; index++)
      records = appendCoopRecord(localStorage, { ...record, playedAt: index }, records);
    expect(readCoopRecords(localStorage)).toHaveLength(100);
    expect(readCoopRecords(localStorage)[0]!.playedAt).toBe(2);
    localStorage.setItem(COOP_RECORDS_KEY, "broken");
    expect(readCoopRecords(localStorage)).toEqual([]);
    expect(appendCoopRecord(null, record, [record])).toHaveLength(2);
  });
});
