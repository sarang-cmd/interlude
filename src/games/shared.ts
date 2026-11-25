/**
 * Shared canvas helpers for game renderers. Integer-snapped, chunky.
 */
import { TOKENS } from "../../design/tokens";

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    font?: string;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    alpha?: number;
  } = {},
): void {
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.font = options.font ?? "16px VT323, monospace";
  ctx.fillStyle = options.color ?? TOKENS.phosphor;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = options.baseline ?? "alphabetic";
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.restore();
}

export function drawPanelFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string = TOKENS.phosphorDim,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
}

export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  drawText(ctx, text, x, y, {
    font: '11px "IBM Plex Mono", monospace',
    color: TOKENS.phosphorDim,
    align: "center",
    baseline: "middle",
  });
}

/** Empty-cell backdrop grid for playfields. */
export function drawGridDots(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  cols: number,
  rows: number,
  cell: number,
): void {
  ctx.fillStyle = "rgba(255,176,0,0.05)";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillRect(
        Math.round(x0 + c * cell + cell / 2),
        Math.round(y0 + r * cell + cell / 2),
        1,
        1,
      );
    }
  }
}
