// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Input, type GameAction } from "../../src/engine/input";
import { DarkRoomGame } from "../../src/games/darkroom/game";
import {
  createDarkRoom,
  roomNeighbors,
  ROOM_WIDTH,
  type DarkRoomMap,
} from "../../src/games/darkroom/logic";
import type { GameContext } from "../../src/games/types";
import { RNG } from "../../src/shared/rng";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

function path(map: DarkRoomMap, start: number, end: number): number[] {
  const queue = [start],
    parent = new Map<number, number>([[start, -1]]);
  for (let i = 0; i < queue.length && !parent.has(end); i++)
    for (const next of roomNeighbors(queue[i]!)) {
      if (!map.walls[next] && !parent.has(next)) {
        parent.set(next, queue[i]!);
        queue.push(next);
      }
    }
  if (!parent.has(end)) return [];
  const result: number[] = [];
  let current = end;
  while (current !== start) {
    result.unshift(current);
    current = parent.get(current)!;
  }
  return result;
}
describe("DARK ROOM", () => {
  it("generates connected mazes with a reachable key and distinct exit", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const room = createDarkRoom(new RNG(seed));
      expect(room).toEqual(createDarkRoom(new RNG(seed)));
      expect(room.key).not.toBe(room.exit);
      expect(room.key).not.toBe(room.start);
      expect(path(room, room.start, room.key).length).toBeGreaterThan(0);
      expect(path(room, room.key, room.exit).length).toBeGreaterThan(0);
      for (let cell = 0; cell < room.walls.length; cell++)
        if (!room.walls[cell] && cell !== room.start)
          expect(path(room, room.start, cell).length).toBeGreaterThan(0);
    }
  });
  it("does not announce the unseen key, and permits a complete escape", () => {
    const seed = 33,
      room = createDarkRoom(new RNG(seed));
    const input = new Input();
    input.setEnabled(true);
    const context = {
      width: 640,
      height: 360,
      input,
      rng: new RNG(seed),
      settings: { ...DEFAULT_SETTINGS },
      sound: { play: vi.fn() },
      announce: vi.fn(),
      reportGameOver: vi.fn(async () => {}),
    } as unknown as GameContext;
    const game = new DarkRoomGame();
    game.init(context);
    expect(vi.mocked(context.announce!).mock.lastCall?.[0]).toContain("Key not found");
    expect(vi.mocked(context.announce!).mock.lastCall?.[0]).not.toContain(
      `row ${Math.floor(room.key / ROOM_WIDTH) + 1}, column ${(room.key % ROOM_WIDTH) + 1}`,
    );
    let current = room.start;
    for (const target of [
      ...path(room, room.start, room.key),
      ...path(room, room.key, room.exit),
    ]) {
      const delta = target - current;
      const action: GameAction =
        delta === 1 ? "right" : delta === -1 ? "left" : delta === ROOM_WIDTH ? "down" : "up";
      input.virtualDown(action, "test");
      input.virtualUp(action, "test");
      game.fixedUpdate(0.02);
      current = target;
    }
    expect(context.reportGameOver).toHaveBeenCalledOnce();
    expect(game.resultLabel).toBe("ESCAPED");
    expect(game.score).toBeGreaterThan(0);
  });
});
