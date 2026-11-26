import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";
import { fleetSquare, knownShots, type FleetBoard } from "./logic";

export const OWN_X = 46,
  TARGET_X = 354,
  BOARD_Y = 56,
  CELL = 24;
export function drawFleetBoard(
  ctx: CanvasRenderingContext2D,
  board: FleetBoard,
  x: number,
  revealShips: boolean,
  cursor: number | null,
): void {
  for (let index = 0; index < 100; index++) {
    const row = Math.floor(index / 10),
      col = index % 10;
    const px = x + col * CELL,
      py = BOARD_Y + row * CELL;
    const selected = cursor === index;
    ctx.fillStyle = selected ? "#3A290B" : "#171209";
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = selected ? TOKENS.phosphorHot : "#5A481F";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
    if (board.shots[index]) {
      if (board.ships[index]) {
        drawText(ctx, "X", px + CELL / 2, py + 18, {
          font: "18px monospace",
          color: TOKENS.signalRed,
          align: "center",
        });
      } else {
        ctx.fillStyle = TOKENS.phosphorDim;
        ctx.fillRect(px + 10, py + 10, 4, 4);
      }
    } else if (revealShips && board.ships[index]) {
      ctx.fillStyle = TOKENS.phosphor;
      ctx.fillRect(px + 6, py + 6, 12, 12);
    }
  }
}
/** Safe to expose: own fleet plus only the shots already taken at the target. */
export function fleetStatus(own: FleetBoard, target: FleetBoard, cursor: number): string {
  const ownShips = own.ships
    .flatMap((ship, index) =>
      ship ? [`${fleetSquare(index)}${own.shots[index] ? " hit" : " intact"}`] : [],
    )
    .join("; ");
  const known = knownShots(target);
  const rows = Array.from(
    { length: 10 },
    (_, row) => `row ${row + 1}: ${known.slice(row * 10, row * 10 + 10).join(", ")}`,
  ).join("; ");
  return `Selected target ${fleetSquare(cursor)}, ${known[cursor]}. Your ship squares: ${ownShips}. Target board: ${rows}.`;
}
export function fleetTitles(
  ctx: CanvasRenderingContext2D,
  ownLabel: string,
  targetLabel: string,
): void {
  drawText(ctx, ownLabel, OWN_X + 120, 44, {
    font: '11px "IBM Plex Mono", monospace',
    color: TOKENS.phosphorDim,
    align: "center",
  });
  drawText(ctx, targetLabel, TARGET_X + 120, 44, {
    font: '11px "IBM Plex Mono", monospace',
    color: TOKENS.phosphorDim,
    align: "center",
  });
}
