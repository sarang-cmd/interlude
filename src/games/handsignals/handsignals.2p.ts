/** Website-only secret-choice hand-off match. */
import { TOKENS } from "../../../design/tokens";
import { HAND_SIGNALS_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import { drawSignals, signalAt } from "./display";
import { handOutcome, handSignals, type HandSignal } from "./logic";

export class LocalHandSignalsGame implements ArcadeGame {
  readonly manifest = HAND_SIGNALS_MANIFEST;
  readonly readyHint = "PASS DEVICE · CHOOSE IN SECRET · REVEAL";
  readonly score = 0;
  readonly recordsAllowed = false;
  private g!: GameContext;
  private extended = false;
  private player: 1 | 2 = 1;
  private phase: "handoff" | "choose" | "result" = "handoff";
  private cursor = 0;
  private first: HandSignal | null = null;
  private wins: [number, number] = [0, 0];
  private lastRound = "";
  private ended = false;
  get resultLabel(): string | undefined {
    return this.ended ? `PLAYER ${this.wins[0] === 5 ? 1 : 2} WINS` : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.extended = ctx.settings.handLizardSpock === true;
    this.player = 1;
    this.phase = "handoff";
    this.cursor = 0;
    this.first = null;
    this.wins = [0, 0];
    this.lastRound = "";
    this.ended = false;
    this.announce();
  }
  destroy(): void {
    this.suspend();
  }
  suspend(): void {
    if (this.g && !this.ended && this.phase === "choose") {
      this.phase = "handoff";
      this.announce();
      this.render(0);
    }
  }
  settingsChanged(): void {
    if (this.g && this.extended !== (this.g.settings.handLizardSpock === true)) this.init(this.g);
  }
  fixedUpdate(_dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    const left = input.wasPressedWithin("left", 180, true),
      right = input.wasPressedWithin("right", 180, true);
    const select = input.wasPressedWithin("primary", 180, true),
      taps = input.drainTaps();
    input.drainSwipes();
    if (this.phase !== "choose") {
      if (select || taps.length) {
        if (this.phase === "result") {
          this.phase = "handoff";
          this.player = 1;
        } else this.phase = "choose";
        this.announce();
      }
      return;
    }
    const choices = handSignals(this.extended);
    let changed = false;
    if (left) {
      this.cursor = Math.max(0, this.cursor - 1);
      changed = true;
    }
    if (right) {
      this.cursor = Math.min(choices.length - 1, this.cursor + 1);
      changed = true;
    }
    for (const tap of taps) {
      const index = signalAt(tap.x, tap.y, choices.length);
      if (index === null) continue;
      this.cursor = index;
      this.choose(choices[index]!);
      return;
    }
    if (select) {
      this.choose(choices[this.cursor]!);
      return;
    }
    if (changed) this.announce();
  }
  private choose(choice: HandSignal): void {
    this.g.sound.play("blip");
    if (this.player === 1) {
      this.first = choice;
      this.player = 2;
      this.cursor = 0;
      this.phase = "handoff";
      this.announce();
      return;
    }
    if (!this.first) return;
    const first = this.first,
      outcome = handOutcome(first, choice);
    if (outcome === 1) this.wins[0]++;
    else if (outcome === -1) this.wins[1]++;
    this.lastRound = `PLAYER 1 ${first.toUpperCase()} · PLAYER 2 ${choice.toUpperCase()} · ${outcome === 0 ? "DRAW" : `PLAYER ${outcome === 1 ? 1 : 2} WINS ROUND`}`;
    this.first = null;
    this.phase = "result";
    this.cursor = 0;
    if (this.wins[0] === 5 || this.wins[1] === 5) {
      this.ended = true;
      this.announce();
      void this.g.reportGameOver();
    } else this.announce();
  }
  private announce(): void {
    if (!this.g) return;
    if (this.phase === "handoff") {
      this.g.announce?.(
        `HAND SIGNALS privacy screen. Pass the device to PLAYER ${this.player}. Press Space or tap to reveal.`,
      );
      return;
    }
    if (this.phase === "result") {
      this.g.announce?.(
        `HAND SIGNALS. ${this.lastRound}. Score PLAYER 1 ${this.wins[0]}, PLAYER 2 ${this.wins[1]}. ${this.ended ? this.resultLabel : "Press Space or tap for the next round."}`,
      );
      return;
    }
    this.g.announce?.(
      `HAND SIGNALS. PLAYER ${this.player} choose in secret. Selected ${handSignals(this.extended)[this.cursor]!.toUpperCase()}. ${this.extended ? "Lizard Spock is on." : "Classic three signals."}`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    if (this.phase === "handoff") {
      drawText(ctx, "PRIVACY SCREEN", 320, 122, {
        font: "24px Silkscreen, monospace",
        color: TOKENS.phosphorHot,
        align: "center",
      });
      drawText(ctx, `PASS TO PLAYER ${this.player}`, 320, 174, {
        font: '16px "IBM Plex Mono", monospace',
        color: TOKENS.phosphor,
        align: "center",
      });
      drawText(ctx, "SPACE / TAP TO REVEAL", 320, 210, {
        font: '13px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
      return;
    }
    drawText(ctx, `P1 ${this.wins[0]}  /  P2 ${this.wins[1]}`, 320, 76, {
      font: "22px Silkscreen, monospace",
      color: TOKENS.phosphorHot,
      align: "center",
    });
    if (this.phase === "result") {
      drawText(ctx, this.lastRound, 320, 176, {
        font: '13px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorHot,
        align: "center",
      });
      drawText(ctx, "SPACE / TAP FOR NEXT ROUND", 320, 222, {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
      return;
    }
    drawText(ctx, `PLAYER ${this.player} / CHOOSE IN SECRET`, 320, 109, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
      align: "center",
    });
    drawSignals(ctx, handSignals(this.extended), this.cursor);
    drawText(ctx, "SPACE SELECTS", 320, 328, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorHot,
      align: "center",
    });
  }
}
