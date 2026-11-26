import type { RNG } from "../../shared/rng";

export const ROOM_WIDTH = 13,
  ROOM_HEIGHT = 9;
export interface DarkRoomMap {
  walls: readonly boolean[];
  start: number;
  key: number;
  exit: number;
}
export function roomNeighbors(index: number): number[] {
  const row = Math.floor(index / ROOM_WIDTH),
    col = index % ROOM_WIDTH,
    result: number[] = [];
  if (col > 0) result.push(index - 1);
  if (col < ROOM_WIDTH - 1) result.push(index + 1);
  if (row > 0) result.push(index - ROOM_WIDTH);
  if (row < ROOM_HEIGHT - 1) result.push(index + ROOM_WIDTH);
  return result;
}
/** A connected perfect maze. Both the key and exit are reachable from the start. */
export function createDarkRoom(rng: RNG): DarkRoomMap {
  const walls = Array<boolean>(ROOM_WIDTH * ROOM_HEIGHT).fill(true),
    start = ROOM_WIDTH + 1;
  walls[start] = false;
  const stack = [start];
  while (stack.length) {
    const current = stack[stack.length - 1]!,
      row = Math.floor(current / ROOM_WIDTH),
      col = current % ROOM_WIDTH;
    const candidates: Array<{ next: number; between: number }> = [];
    for (const [dr, dc] of [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ] as const) {
      const r = row + dr,
        c = col + dc;
      if (r <= 0 || r >= ROOM_HEIGHT - 1 || c <= 0 || c >= ROOM_WIDTH - 1) continue;
      const next = r * ROOM_WIDTH + c;
      if (walls[next])
        candidates.push({ next, between: (row + dr / 2) * ROOM_WIDTH + col + dc / 2 });
    }
    if (!candidates.length) {
      stack.pop();
      continue;
    }
    const choice = rng.pick(candidates);
    walls[choice.between] = false;
    walls[choice.next] = false;
    stack.push(choice.next);
  }
  const distances = Array<number>(walls.length).fill(-1),
    queue = [start];
  distances[start] = 0;
  for (let pos = 0; pos < queue.length; pos++)
    for (const neighbor of roomNeighbors(queue[pos]!)) {
      if (!walls[neighbor] && distances[neighbor] === -1) {
        distances[neighbor] = distances[queue[pos]!]! + 1;
        queue.push(neighbor);
      }
    }
  const ordered = queue
    .filter((cell) => cell !== start)
    .sort((a, b) => distances[a]! - distances[b]!);
  return {
    walls,
    start,
    key: ordered[Math.floor(ordered.length * 0.55)]!,
    exit: ordered[ordered.length - 1]!,
  };
}
