import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";
import type { HandSignal } from "./logic";

const WIDTH = 108,
  TOP = 144,
  HEIGHT = 82;
export function signalAt(x: number, y: number, count: number): number | null {
  const left = (640 - count * WIDTH) / 2;
  if (x < left || x >= left + count * WIDTH || y < TOP || y >= TOP + HEIGHT) return null;
  return Math.floor((x - left) / WIDTH);
}
export function drawSignals(
  ctx: CanvasRenderingContext2D,
  choices: readonly HandSignal[],
  selected: number,
): void {
  const left = (640 - choices.length * WIDTH) / 2;
  choices.forEach((choice, index) => {
    const x = left + index * WIDTH,
      active = index === selected;
    ctx.fillStyle = active ? "#39280D" : "#171209";
    ctx.fillRect(x + 4, TOP, WIDTH - 8, HEIGHT);
    ctx.strokeStyle = active ? TOKENS.phosphorHot : TOKENS.phosphorDim;
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(x + 4.5, TOP + 0.5, WIDTH - 9, HEIGHT - 1);
    drawText(ctx, choice === "spock" ? "V" : choice[0]!.toUpperCase(), x + WIDTH / 2, TOP + 40, {
      font: "26px Silkscreen, monospace",
      color: TOKENS.phosphorHot,
      align: "center",
    });
    drawText(ctx, choice.toUpperCase(), x + WIDTH / 2, TOP + 65, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "center",
    });
  });
}
