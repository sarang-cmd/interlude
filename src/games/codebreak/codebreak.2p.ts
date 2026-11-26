/** Website-only: one person sets the hidden code, then passes the device. */
import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";
import type { GameContext } from "../types";
import { CodebreakGame } from "./game";
import { parseCode } from "./logic";

export class CodebreakLocalGame extends CodebreakGame {
  onNeedsSecret: (() => void) | null = null;
  private handoff = false;
  override get recordsAllowed(): boolean {
    return false;
  }
  get needsSecret(): boolean {
    return !this.secret && !this.ended;
  }
  protected override createSecret(): null {
    return null;
  }
  override init(ctx: GameContext): void {
    this.handoff = false;
    super.init(ctx);
    this.onNeedsSecret?.();
  }
  setSecret(value: string): boolean {
    const code = parseCode(value.trim());
    if (!this.needsSecret || !code) return false;
    this.secret = code;
    this.handoff = true;
    this.announce("");
    this.onNeedsSecret?.();
    return true;
  }
  suspend(): void {
    if (this.g && this.secret && !this.ended) {
      this.handoff = true;
      this.announce("");
      this.render(0);
    }
  }
  override fixedUpdate(dt: number): void {
    if (!this.handoff) {
      super.fixedUpdate(dt);
      return;
    }
    const input = this.g.input;
    for (const action of ["left", "right", "up", "down"] as const)
      input.wasPressedWithin(action, 180, true);
    const reveal = input.wasPressedWithin("primary", 180, true) || input.drainTaps().length > 0;
    input.drainTaps();
    input.drainSwipes();
    if (reveal) {
      this.handoff = false;
      this.announce("Make your first guess.");
    }
  }
  protected override announce(message: string): void {
    if (this.handoff)
      this.g.announce?.(
        "CODEBREAK privacy screen. Pass the device to PLAYER 2. Press Space or tap to begin guessing.",
      );
    else super.announce(message);
  }
  override render(alpha: number): void {
    if (!this.handoff) {
      super.render(alpha);
      return;
    }
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    drawText(ctx, "PRIVACY SCREEN", 320, 122, {
      font: "24px Silkscreen, monospace",
      color: TOKENS.phosphorHot,
      align: "center",
    });
    drawText(ctx, "PASS TO PLAYER 2", 320, 174, {
      font: '16px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "center",
    });
    drawText(ctx, "SPACE / TAP TO GUESS", 320, 210, {
      font: '13px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
      align: "center",
    });
  }
}
