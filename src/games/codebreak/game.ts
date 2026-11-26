import { TOKENS } from "../../../design/tokens";
import { CODEBREAK_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import {
  codeFeedback,
  CODE_ATTEMPTS,
  CODE_COLORS,
  CODE_LENGTH,
  randomCode,
  type CodeFeedback,
} from "./logic";

interface GuessRecord {
  guess: number[];
  feedback: CodeFeedback;
}
const LEFT = 192,
  TOP = 262,
  WIDTH = 64;
export class CodebreakGame implements ArcadeGame {
  readonly manifest = CODEBREAK_MANIFEST;
  readonly readyHint = "LEFT/RIGHT SELECT · UP/DOWN CHANGE · SPACE SUBMIT";
  score = 0;
  protected g!: GameContext;
  protected secret: number[] | null = null;
  protected cursor = 0;
  protected guess = [1, 1, 1, 1];
  protected history: GuessRecord[] = [];
  protected ended = false;
  protected solved = false;
  get recordsAllowed(): boolean {
    return true;
  }
  get resultLabel(): string | undefined {
    return this.ended ? (this.solved ? "CODE CRACKED" : "CODE UNBROKEN") : undefined;
  }
  protected createSecret(): number[] | null {
    return randomCode(this.g.rng);
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.secret = this.createSecret();
    this.cursor = 0;
    this.guess = [1, 1, 1, 1];
    this.history = [];
    this.ended = false;
    this.solved = false;
    this.score = 0;
    this.announce(this.secret ? "Crack the four-digit code." : "Waiting for the code.");
  }
  destroy(): void {
    this.secret = null;
  }
  fixedUpdate(_dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    const directions = (["left", "right", "up", "down"] as const).filter((key) =>
      input.wasPressedWithin(key, 180, true),
    );
    const submit = input.wasPressedWithin("primary", 180, true),
      taps = input.drainTaps();
    input.drainSwipes();
    if (!this.secret) return;
    let changed = false;
    for (const direction of directions) {
      if (direction === "left") this.cursor = Math.max(0, this.cursor - 1);
      else if (direction === "right") this.cursor = Math.min(CODE_LENGTH - 1, this.cursor + 1);
      else
        this.guess[this.cursor] =
          ((this.guess[this.cursor]! - 1 + (direction === "up" ? 1 : CODE_COLORS - 1)) %
            CODE_COLORS) +
          1;
      changed = true;
    }
    for (const tap of taps)
      if (tap.x >= LEFT && tap.x < LEFT + CODE_LENGTH * WIDTH && tap.y >= TOP && tap.y < TOP + 54) {
        this.cursor = Math.floor((tap.x - LEFT) / WIDTH);
        this.guess[this.cursor] = (this.guess[this.cursor]! % CODE_COLORS) + 1;
        changed = true;
      }
    if (submit) this.submit();
    else if (changed) this.announce("Guess changed.");
  }
  private submit(): void {
    if (!this.secret) return;
    const feedback = codeFeedback(this.secret, this.guess);
    this.history.push({ guess: [...this.guess], feedback });
    this.g.sound.play("blip");
    const message = `Guess ${this.guess.join("")}: ${feedback.exact} exact, ${feedback.misplaced} misplaced.`;
    if (feedback.exact === CODE_LENGTH || this.history.length >= CODE_ATTEMPTS) {
      this.ended = true;
      this.solved = feedback.exact === CODE_LENGTH;
      this.score = this.solved ? 1000 + (CODE_ATTEMPTS - this.history.length) * 100 : 0;
      this.announce(`${message} ${this.resultLabel}.`);
      void this.g.reportGameOver();
    } else this.announce(message);
  }
  protected announce(message: string): void {
    const attempts = this.history
      .map(
        (row) =>
          `${row.guess.join("")}: ${row.feedback.exact} exact, ${row.feedback.misplaced} misplaced`,
      )
      .join("; ");
    this.g.announce?.(
      `CODEBREAK. ${message} ${this.secret ? `Current guess ${this.guess.join("")}, selected position ${this.cursor + 1}. ${this.history.length} of ${CODE_ATTEMPTS} attempts. ${attempts}` : "Waiting for the secret."}`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    drawText(ctx, this.secret ? "GUESS / EXACT / MISPLACED" : "WAITING FOR SECRET", 320, 44, {
      font: '12px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorHot,
      align: "center",
    });
    this.history.forEach((row, index) =>
      drawText(
        ctx,
        `${String(index + 1).padStart(2, "0")}   ${row.guess.join(" ")}     ${row.feedback.exact} / ${row.feedback.misplaced}`,
        320,
        65 + index * 18,
        { font: '13px "IBM Plex Mono", monospace', color: TOKENS.phosphor, align: "center" },
      ),
    );
    if (this.secret)
      this.guess.forEach((digit, index) => {
        const x = LEFT + index * WIDTH;
        ctx.fillStyle = index === this.cursor ? "#57400F" : "#21190D";
        ctx.fillRect(x + 3, TOP, WIDTH - 6, 50);
        ctx.strokeStyle = index === this.cursor ? TOKENS.phosphorHot : TOKENS.phosphorDim;
        ctx.strokeRect(x + 3.5, TOP + 0.5, WIDTH - 7, 49);
        drawText(ctx, String(digit), x + WIDTH / 2, TOP + 34, {
          font: "23px Silkscreen, monospace",
          color: TOKENS.phosphorHot,
          align: "center",
        });
      });
    drawText(
      ctx,
      this.secret ? "1–6 · REPEATS ALLOWED · SPACE SUBMITS" : "ENTER THE SECRET BELOW",
      320,
      334,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphorDim, align: "center" },
    );
  }
}
