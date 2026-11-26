/** Website-only simultaneous duel. Both players share the same random cue. */
import { TOKENS } from "../../../design/tokens";
import { QUICK_DRAW_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";

export class QuickDrawDuelGame implements ArcadeGame {
  readonly manifest = QUICK_DRAW_MANIFEST;
  readonly readyHint = "P1 F · P2 J · WAIT FOR GO";
  readonly score = 0;
  readonly recordsAllowed = false;
  private g!: GameContext;
  private cue = 0;
  private elapsed = 0;
  private phase: "wait" | "go" | "done" = "wait";
  private accepting = false;
  private result = "";
  get resultLabel(): string | undefined {
    return this.phase === "done" ? this.result : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.cue = ctx.rng.range(2, 5);
    this.elapsed = 0;
    this.phase = "wait";
    this.accepting = false;
    this.result = "";
    ctx.canvas.addEventListener("keydown", this.onKeyDown, true);
    ctx.announce?.(
      "QUICK DRAW duel. Player 1 uses F, player 2 uses J. Wait for GO. A false start loses.",
    );
  }
  destroy(): void {
    this.accepting = false;
    this.g?.canvas.removeEventListener("keydown", this.onKeyDown, true);
  }
  suspend(): void {
    this.accepting = false;
  }
  fixedUpdate(dt: number): void {
    if (this.phase === "done") return;
    this.accepting = true;
    const input = this.g.input;
    input.consumePresses("primary");
    input.drainTaps();
    input.drainSwipes();
    this.elapsed += Math.max(0, dt);
    if (this.phase === "wait" && this.elapsed >= this.cue) {
      this.phase = "go";
      this.g.sound.play("coin");
      this.g.announce?.("QUICK DRAW duel. GO! Both players may draw.");
    }
    if (this.phase === "go" && this.elapsed >= this.cue + 4) this.finish("DRAW · NO RESPONSE");
  }
  draw(player: 1 | 2): void {
    if (!this.accepting || !this.g.input.isEnabled || this.phase === "done") return;
    if (this.phase === "wait") {
      this.finish(`PLAYER ${player === 1 ? 2 : 1} WINS · P${player} FALSE START`);
      return;
    }
    const ms = Math.max(0, Math.round((this.elapsed - this.cue) * 1000));
    this.finish(`PLAYER ${player} WINS · ${ms} MS`);
  }
  private finish(result: string): void {
    this.phase = "done";
    this.accepting = false;
    this.result = result;
    this.g.announce?.(`QUICK DRAW. ${result}.`);
    void this.g.reportGameOver();
  }
  private onKeyDown = (event: KeyboardEvent): void => {
    if (
      !this.accepting ||
      !this.g.input.isEnabled ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const player = event.code === "KeyF" ? 1 : event.code === "KeyJ" ? 2 : null;
    if (!player) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.draw(player);
  };
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = this.phase === "go" ? "#274622" : TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    drawText(
      ctx,
      this.phase === "done" ? this.result : this.phase === "go" ? "GO!" : "WAIT...",
      320,
      184,
      {
        font: this.phase === "done" ? "18px Silkscreen, monospace" : "38px Silkscreen, monospace",
        color: this.phase === "go" ? "#9DF4A5" : TOKENS.phosphorHot,
        align: "center",
      },
    );
    drawText(ctx, "PLAYER 1 / F                 J / PLAYER 2", 320, 260, {
      font: '12px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "center",
    });
  }
}
