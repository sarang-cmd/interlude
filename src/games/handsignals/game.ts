import { TOKENS } from "../../../design/tokens";
import { isAIDifficulty, type AIDifficulty } from "../../ai/difficulty";
import { chooseHand } from "../../ai/hand-signals";
import { HAND_SIGNALS_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import { drawSignals, signalAt } from "./display";
import { handOutcome, handSignals, type HandSignal } from "./logic";

/** The CPU commits before each choice; it only sees previous rounds. */
export class HandSignalsGame implements ArcadeGame {
  readonly manifest = HAND_SIGNALS_MANIFEST;
  readonly readyHint = "LEFT / RIGHT CHOOSE · SPACE PLAY";
  score = 0;
  private g!: GameContext;
  private extended = false;
  private level: AIDifficulty = "regular";
  private cursor = 0;
  private ownWins = 0;
  private cpuWins = 0;
  private nextCpu: HandSignal = "rock";
  private history: HandSignal[] = [];
  private ended = false;
  private lastRound = "First to five points wins.";
  get recordsAllowed(): boolean {
    return true;
  }
  get resultLabel(): string | undefined {
    return this.ended ? (this.ownWins === 5 ? "YOU WIN" : "CPU WINS") : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.extended = ctx.settings.handLizardSpock === true;
    this.level = this.difficulty();
    this.cursor = 0;
    this.ownWins = 0;
    this.cpuWins = 0;
    this.history = [];
    this.ended = false;
    this.score = 0;
    this.lastRound = "First to five points wins.";
    this.nextCpu = chooseHand(this.history, this.extended, this.level, this.g.rng);
    this.announce();
  }
  destroy(): void {}
  settingsChanged(): void {
    if (!this.g) return;
    if (this.extended !== (this.g.settings.handLizardSpock === true)) {
      this.init(this.g);
      this.lastRound = "Rules changed. A new match started.";
      this.announce();
      return;
    }
    const nextLevel = this.difficulty();
    if (nextLevel !== this.level) {
      this.level = nextLevel;
      this.nextCpu = chooseHand(this.history, this.extended, this.level, this.g.rng);
    }
  }
  private difficulty(): AIDifficulty {
    return isAIDifficulty(this.g.settings.boardDifficulty)
      ? this.g.settings.boardDifficulty
      : "regular";
  }
  fixedUpdate(_dt: number): void {
    if (this.ended) return;
    const input = this.g.input,
      choices = handSignals(this.extended);
    const left = input.wasPressedWithin("left", 180, true),
      right = input.wasPressedWithin("right", 180, true);
    const select = input.wasPressedWithin("primary", 180, true),
      taps = input.drainTaps();
    input.drainSwipes();
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
      this.play(choices[index]!);
      return;
    }
    if (select) {
      this.play(choices[this.cursor]!);
      return;
    }
    if (changed) this.announce();
  }
  private play(human: HandSignal): void {
    const cpu = this.nextCpu,
      outcome = handOutcome(human, cpu);
    if (outcome === 1) this.ownWins++;
    else if (outcome === -1) this.cpuWins++;
    this.history.push(human);
    if (this.history.length > 20) this.history.shift();
    this.lastRound = `YOU chose ${human.toUpperCase()}. CPU chose ${cpu.toUpperCase()}. ${outcome === 0 ? "ROUND DRAW" : outcome === 1 ? "YOU WIN ROUND" : "CPU WINS ROUND"}.`;
    this.g.sound.play("blip");
    if (this.ownWins === 5 || this.cpuWins === 5) {
      this.ended = true;
      this.score = this.ownWins === 5 ? 1000 + 200 * (5 - this.cpuWins) : 0;
      this.announce();
      void this.g.reportGameOver();
    } else {
      this.nextCpu = chooseHand(this.history, this.extended, this.level, this.g.rng);
      this.announce();
    }
  }
  private announce(): void {
    if (!this.g) return;
    const choices = handSignals(this.extended);
    this.g.announce?.(
      `HAND SIGNALS. ${this.lastRound} Score YOU ${this.ownWins}, CPU ${this.cpuWins}. ${this.ended ? this.resultLabel : `Selected ${choices[this.cursor]!.toUpperCase()}. ${this.extended ? "Lizard Spock is on." : "Classic three signals."}`}`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    drawText(ctx, `YOU ${this.ownWins}  /  CPU ${this.cpuWins}`, 320, 76, {
      font: "22px Silkscreen, monospace",
      color: TOKENS.phosphorHot,
      align: "center",
    });
    drawText(
      ctx,
      this.extended ? "LIZARD SPOCK / FIRST TO FIVE" : "CLASSIC / FIRST TO FIVE",
      320,
      109,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphorDim, align: "center" },
    );
    drawSignals(ctx, handSignals(this.extended), this.cursor);
    drawText(ctx, this.lastRound, 320, 275, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "center",
    });
    drawText(ctx, this.ended ? "MATCH COMPLETE" : "CHOOSE YOUR SIGNAL", 320, 328, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorHot,
      align: "center",
    });
  }
}
