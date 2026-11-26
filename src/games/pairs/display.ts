import { TOKENS } from "../../../design/tokens";
import { gridCellName } from "../grid-input";
import { drawText } from "../shared";
import type { PairsBoard } from "./logic";

export const PAIRS_CELL = 64,
  PAIRS_LEFT = 192,
  PAIRS_TOP = 49;
export function pairsStatus(board: PairsBoard, cursor: number): string {
  const rows = Array.from(
    { length: 4 },
    (_, row) =>
      `row ${row + 1}: ${Array.from({ length: 4 }, (_, col) => {
        const index = row * 4 + col;
        return board.visible(index)
          ? `${board.cards[index]}${board.matched[index] ? " matched" : ""}`
          : "hidden";
      }).join(", ")}`,
  ).join("; ");
  return `Selected ${gridCellName(cursor, 4)}, ${board.visible(cursor) ? board.cards[cursor] : "hidden"}. Board: ${rows}.`;
}
export function drawPairs(
  ctx: CanvasRenderingContext2D,
  board: PairsBoard,
  cursor: number,
  header: string,
): void {
  drawText(ctx, header, 320, 38, {
    font: '12px "IBM Plex Mono", monospace',
    color: TOKENS.phosphorHot,
    align: "center",
  });
  for (let i = 0; i < 16; i++) {
    const x = PAIRS_LEFT + (i % 4) * PAIRS_CELL,
      y = PAIRS_TOP + Math.floor(i / 4) * PAIRS_CELL;
    ctx.fillStyle = board.matched[i] ? "#45340F" : board.visible(i) ? "#6B4E08" : "#171209";
    ctx.fillRect(x + 4, y + 4, PAIRS_CELL - 8, PAIRS_CELL - 8);
    ctx.strokeStyle = i === cursor ? TOKENS.phosphorHot : TOKENS.phosphorDim;
    ctx.lineWidth = i === cursor ? 2 : 1;
    ctx.strokeRect(x + 4.5, y + 4.5, PAIRS_CELL - 9, PAIRS_CELL - 9);
    drawText(ctx, board.visible(i) ? board.cards[i]! : "?", x + PAIRS_CELL / 2, y + 42, {
      font: "22px Silkscreen, monospace",
      color: board.visible(i) ? TOKENS.phosphorHot : TOKENS.phosphorDim,
      align: "center",
    });
  }
  drawText(ctx, "ARROWS SELECT · SPACE / TAP FLIPS", 320, 330, {
    font: '11px "IBM Plex Mono", monospace',
    color: TOKENS.phosphor,
    align: "center",
  });
}
