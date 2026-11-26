/** Website-only memory challenge: each player repeats then extends the sequence. */
import { TOKENS } from "../../../design/tokens";
import { ECHO_MANIFEST } from "../manifest";
import type { ArcadeGame, GameContext } from "../types";
import { drawEcho, ECHO_ACTIONS, ECHO_NAMES, echoPadAt } from "./display";

export class EchoLocalGame implements ArcadeGame {
  readonly manifest = ECHO_MANIFEST;
  readonly readyHint = "REPEAT THE SEQUENCE · ADD ONE SIGNAL";
  readonly score = 0;
  readonly recordsAllowed = false;
  private g!: GameContext;
  private sequence: number[] = [];
  private player: 1 | 2 = 1;
  private phase: "repeat" | "extend" = "extend";
  private entered = 0;
  private lit: number | null = null;
  private feedback = 0;
  private ended = false;
  private winner: 1 | 2 | null = null;
  get resultLabel(): string | undefined {
    return this.ended ? (this.winner ? `PLAYER ${this.winner} WINS` : "DRAW") : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.sequence = [];
    this.player = 1;
    this.phase = "extend";
    this.entered = 0;
    this.lit = null;
    this.feedback = 0;
    this.ended = false;
    this.winner = null;
    this.announce("Player 1 starts by adding a signal.");
  }
  destroy(): void {}
  fixedUpdate(dt: number): void {
    if (this.ended) return;
    if (this.feedback > 0) {
      this.feedback -= Math.max(0, dt);
      if (this.feedback <= 0) this.lit = null;
    }
    const input = this.g.input;
    const pressed = ECHO_ACTIONS.map((action) => input.wasPressedWithin(action, 180, true));
    const taps = input.drainTaps();
    input.drainSwipes();
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
    this.feedback = 0.2;
    this.g.sound.play("blip");
    if (this.phase === "extend") {
      this.sequence.push(choice);
      if (this.sequence.length >= 64) {
        this.ended = true;
        this.winner = null;
        this.announce("64 signals reached. Draw.");
        void this.g.reportGameOver();
        return;
      }
      this.player = this.player === 1 ? 2 : 1;
      this.phase = "repeat";
      this.entered = 0;
      this.announce(`Added ${ECHO_NAMES[choice]}. Pass to player ${this.player}.`);
      return;
    }
    if (choice !== this.sequence[this.entered]) {
      this.ended = true;
      this.winner = this.player === 1 ? 2 : 1;
      this.announce(`Incorrect ${ECHO_NAMES[choice]}. ${this.resultLabel}.`);
      void this.g.reportGameOver();
      return;
    }
    this.entered++;
    if (this.entered === this.sequence.length) {
      this.phase = "extend";
      this.announce(`Correct. Player ${this.player}, add one new signal.`);
    } else
      this.announce(`Correct ${ECHO_NAMES[choice]}, ${this.entered} of ${this.sequence.length}.`);
  }
  private announce(message: string): void {
    this.g.announce?.(
      `ECHO. ${message} ${this.ended ? this.resultLabel : `Player ${this.player}, ${this.phase === "repeat" ? `repeat ${this.entered} of ${this.sequence.length}` : "add a signal"}`}.`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    drawEcho(
      ctx,
      this.lit,
      this.ended
        ? this.resultLabel!
        : `PLAYER ${this.player} · ${this.phase === "repeat" ? `REPEAT ${this.entered} / ${this.sequence.length}` : "ADD A SIGNAL"}`,
      "ARROWS OR TAP THE FOUR PADS",
    );
  }
}
