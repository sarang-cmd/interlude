import { TOKENS } from "../../../design/tokens";
import { QUICK_DRAW_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";

/** A short reaction test; game-time milliseconds include frame/input latency. */
export class QuickDrawGame implements ArcadeGame {
  readonly manifest = QUICK_DRAW_MANIFEST;
  readonly readyHint = "WAIT FOR GO · SPACE OR TAP TO DRAW";
  score = 0;
  private g!: GameContext;
  private cue = 0;
  private elapsed = 0;
  private phase: "wait" | "go" | "done" = "wait";
  private armed = false;
  private result = "";
  get resultLabel(): string | undefined {
    return this.phase === "done" ? this.result : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.cue = ctx.rng.range(2, 5);
    this.elapsed = 0;
    this.phase = "wait";
    this.armed = false;
    this.result = "";
    this.score = 0;
    this.g.announce?.(
      "QUICK DRAW. Wait for GO, then press Space or tap. Pressing early is a false start.",
    );
  }
  destroy(): void {}
  fixedUpdate(dt: number): void {
    if (this.phase === "done") return;
    const input = this.g.input,
      fire = input.wasPressedWithin("primary", 180, true),
      taps = input.drainTaps();
    input.drainSwipes();
    if (!this.armed) {
      input.consumePresses("primary");
      this.armed = !input.isDown("primary");
      return;
    }
    if (fire || taps.length) {
      if (this.phase === "wait") this.finish("FALSE START", 0);
      else {
        const ms = Math.max(0, Math.round((this.elapsed - this.cue) * 1000));
        this.finish(`${ms} MS`, Math.max(0, 5000 - ms * 5));
      }
      return;
    }
    this.elapsed += Math.max(0, dt);
    if (this.phase === "wait" && this.elapsed >= this.cue) {
      this.phase = "go";
      this.g.sound.play("coin");
      this.g.announce?.("QUICK DRAW. GO! Draw now.");
    }
    if (this.phase === "go" && this.elapsed >= this.cue + 4) this.finish("TOO SLOW", 0);
  }
  private finish(label: string, score: number): void {
    this.phase = "done";
    this.result = label;
    this.score = score;
    this.g.announce?.(`QUICK DRAW. ${label}.`);
    void this.g.reportGameOver();
  }
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
        font: "38px Silkscreen, monospace",
        color: this.phase === "go" ? "#9DF4A5" : TOKENS.phosphorHot,
        align: "center",
      },
    );
    drawText(ctx, "SPACE / TAP WHEN GO APPEARS", 320, 260, {
      font: '12px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "center",
    });
  }
}
