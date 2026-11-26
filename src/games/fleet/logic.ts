import type { RNG } from "../../shared/rng";

export const FLEET_SIZE = 10;
export const SHIP_LENGTHS = [5, 4, 3, 3, 2] as const;
export type ShotResult = "miss" | "hit" | "sunk";
export type ShotKnowledge = "unknown" | "miss" | "hit" | "sunk";
export interface FleetBoard {
  /** Zero for water; ships have IDs 1–5. Kept private until hit. */
  ships: readonly number[];
  shots: readonly boolean[];
}

/** Seeded placement, always choosing from a finite list of non-overlapping positions. */
export function createFleet(rng: RNG): FleetBoard {
  const ships = Array<number>(100).fill(0);
  for (const [index, length] of SHIP_LENGTHS.entries()) {
    const candidates: number[][] = [];
    for (let row = 0; row < 10; row++)
      for (let col = 0; col < 10; col++)
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ] as const) {
          if (row + dr * (length - 1) >= 10 || col + dc * (length - 1) >= 10) continue;
          const cells = Array.from(
            { length },
            (_, step) => (row + dr * step) * 10 + col + dc * step,
          );
          if (cells.every((cell) => ships[cell] === 0)) candidates.push(cells);
        }
    if (!candidates.length) throw new Error("Cannot place fleet");
    for (const cell of rng.pick(candidates)) ships[cell] = index + 1;
  }
  return { ships, shots: Array<boolean>(100).fill(false) };
}
export function isSunk(board: FleetBoard, ship: number): boolean {
  return (
    ship > 0 &&
    board.ships.some((value) => value === ship) &&
    board.ships.every((value, index) => value !== ship || board.shots[index])
  );
}
export function fleetDefeated(board: FleetBoard): boolean {
  return board.ships.every((ship, index) => !ship || board.shots[index]);
}
export function fireAt(
  board: FleetBoard,
  index: number,
): { board: FleetBoard; result: ShotResult } | null {
  if (!Number.isInteger(index) || index < 0 || index >= 100 || board.shots[index]) return null;
  const shots = [...board.shots];
  shots[index] = true;
  const next = { ships: board.ships, shots },
    ship = board.ships[index]!;
  const result = ship === 0 ? "miss" : isSunk(next, ship) ? "sunk" : "hit";
  return { board: next, result };
}
/** Attackers only receive revealed outcomes, never unshot ship locations. */
export function knownShots(board: FleetBoard): ShotKnowledge[] {
  return board.shots.map((shot, index) => {
    if (!shot) return "unknown";
    const ship = board.ships[index]!;
    return ship === 0 ? "miss" : isSunk(board, ship) ? "sunk" : "hit";
  });
}
export function fleetSquare(index: number): string {
  return `row ${Math.floor(index / 10) + 1}, column ${(index % 10) + 1}`;
}
