import { TOKENS } from "../../../design/tokens";
import { ECHO_MANIFEST } from "../manifest";
import type { ArcadeGame, GameContext } from "../types";
import { drawEcho, ECHO_ACTIONS, ECHO_NAMES, echoPadAt } from "./display";

const SLOT = 0.72,
  FLASH = 0.42;
export class EchoGame implements ArcadeGame {
  readonly manifest = ECHO_MANIFEST;
  readonly readyHint = "WATCH · REPEAT WITH ARROWS OR TAP";
  score = 0;
  private g!: GameContext;
  private sequence: number[] = [];
  private phase: "playback" | "input" = "playback";
  private elapsed = 0;
  private entered = 0;
  private lit: number | null = null;
  private lastFlash = -1;
  private feedback = 0;
  private ended = false;
  get resultLabel(): string | undefined {
    return this.ended ? `ROUNDS ${this.score / 100}` : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.sequence = [ctx.rng.int(0, 3)];
    this.phase = "playback";
    this.elapsed = 0;
    this.entered = 0;
    this.lit = null;
    this.lastFlash = -1;
    this.feedback = 0;
    this.score = 0;
    this.ended = false;
    this.announce("Watch the sequence.");
  }
  destroy(): void {}
  fixedUpdate(dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    const pressed = ECHO_ACTIONS.map((action) => input.wasPressedWithin(action, 180, true));
    const taps = input.drainTaps();
    input.drainSwipes();
    const step = Math.max(0, dt);
    if (this.phase === "playback") {
      this.elapsed += step;
      const index = Math.floor(this.elapsed / SLOT);
      if (index >= this.sequence.length) {
        this.phase = "input";
        this.lit = null;
        this.announce(`Your turn. Repeat ${this.sequence.length} signals.`);
        return;
      }
      this.lit = this.elapsed % SLOT < FLASH ? this.sequence[index]! : null;
      if (this.lit !== null && index !== this.lastFlash) {
        this.lastFlash = index;
        this.g.sound.play("blip");
        this.announce(`Watch ${ECHO_NAMES[this.lit]}.`);
      }
      return;
    }
    if (this.feedback > 0) {
      this.feedback -= step;
      if (this.feedback <= 0) this.lit = null;
    }
    let choice = pressed.findIndex(Boolean);
    for (const tap of taps) {
      const pad = echoPadAt(tap.x, tap.y);
      if (pad !== null) {
        choice = pad;
        break;
      }
    }
    if (choice < 0) return;
    this.lit = choice;
    this.feedback = 0.18;
    this.g.sound.play("blip");
    if (this.sequence[this.entered] !== choice) {
      this.ended = true;
      this.announce(`Incorrect ${ECHO_NAMES[choice]}. Run over.`);
      void this.g.reportGameOver();
      return;
    }
    this.entered++;
    if (this.entered === this.sequence.length) {
      this.score += 100;
      this.sequence.push(this.g.rng.int(0, 3));
      this.phase = "playback";
      this.elapsed = 0;
      this.entered = 0;
      this.lastFlash = -1;
      this.lit = null;
      this.announce("Correct. Watch the next sequence.");
    } else
      this.announce(`Correct ${ECHO_NAMES[choice]}, ${this.entered} of ${this.sequence.length}.`);
  }
  private announce(message: string): void {
    this.g.announce?.(`ECHO. ${message} Completed ${this.score / 100} rounds.`);
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    drawEcho(
      ctx,
      this.lit,
      this.ended
        ? "RUN COMPLETE"
        : this.phase === "playback"
          ? `WATCH · ${this.sequence.length} SIGNALS`
          : `REPEAT · ${this.entered} / ${this.sequence.length}`,
      "ARROWS OR TAP THE FOUR PADS",
    );
  }
}
