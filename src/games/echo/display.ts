import { TOKENS } from "../../../design/tokens";
import type { GameAction } from "../../engine/input";
import { drawText } from "../shared";

export const ECHO_ACTIONS = [
  "up",
  "right",
  "down",
  "left",
] as const satisfies readonly GameAction[];
export const ECHO_NAMES = ["UP", "RIGHT", "DOWN", "LEFT"] as const;
const LEFT = 104,
  TOP = 130,
  WIDTH = 108,
  HEIGHT = 96;
export function echoPadAt(x: number, y: number): number | null {
  if (x < LEFT || x >= LEFT + 4 * WIDTH || y < TOP || y >= TOP + HEIGHT) return null;
  return Math.floor((x - LEFT) / WIDTH);
}
export function drawEcho(
  ctx: CanvasRenderingContext2D,
  lit: number | null,
  headline: string,
  footer: string,
): void {
  drawText(ctx, headline, 320, 82, {
    font: '15px "IBM Plex Mono", monospace',
    color: TOKENS.phosphorHot,
    align: "center",
  });
  for (let i = 0; i < 4; i++) {
    const x = LEFT + i * WIDTH;
    ctx.fillStyle = i === lit ? TOKENS.phosphorHot : "#251B0D";
    ctx.fillRect(x + 4, TOP, WIDTH - 8, HEIGHT);
    ctx.strokeStyle = i === lit ? TOKENS.phosphorHot : TOKENS.phosphorDim;
    ctx.lineWidth = i === lit ? 3 : 1;
    ctx.strokeRect(x + 4.5, TOP + 0.5, WIDTH - 9, HEIGHT - 1);
    drawText(ctx, ["↑", "→", "↓", "←"][i]!, x + WIDTH / 2, TOP + 42, {
      font: "28px monospace",
      color: i === lit ? TOKENS.ink : TOKENS.phosphorHot,
      align: "center",
    });
    drawText(ctx, ECHO_NAMES[i]!, x + WIDTH / 2, TOP + 74, {
      font: '11px "IBM Plex Mono", monospace',
      color: i === lit ? TOKENS.ink : TOKENS.phosphor,
      align: "center",
    });
  }
  drawText(ctx, footer, 320, 296, {
    font: '11px "IBM Plex Mono", monospace',
    color: TOKENS.phosphor,
    align: "center",
  });
}
