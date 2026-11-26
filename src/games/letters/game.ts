import { TOKENS } from "../../../design/tokens";
import { gridCellAt, moveGridCursor } from "../grid-input";
import { LETTERS_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import {
  GENERAL_WORDS,
  isWordSolved,
  LETTER_ALPHABET,
  LETTER_LIVES,
  maskedWord,
  parseWordList,
  STUDY_WORDS,
} from "./logic";

export type WordSource = "general" | "study" | "custom";
const LEFT = 180,
  TOP = 142,
  CELL = 40,
  COLS = 7,
  ROWS = 4;
const GUESS_ACTIONS = ["left", "right", "up", "down", "primary"] as const;
export class LettersGame implements ArcadeGame {
  readonly manifest = LETTERS_MANIFEST;
  readonly readyHint = "ARROWS SELECT LETTER · SPACE OR TAP GUESS";
  score = 0;
  protected g!: GameContext;
  protected word: string | null = null;
  protected guessed = new Set<string>();
  protected cursor = 0;
  protected misses = 0;
  protected ended = false;
  protected solved = false;
  private armed = false;
  private customWords: string[] = [];
  wordSource: WordSource = "general";
  get recordsAllowed(): boolean {
    return true;
  }
  get resultLabel(): string | undefined {
    return this.ended ? `${this.solved ? "WORD FOUND" : "WORD WAS"} / ${this.word}` : undefined;
  }
  /** Lists remain in this game instance only and are not written to storage. */
  setWordSource(source: WordSource, raw = ""): number {
    if (source === "custom") {
      const parsed = parseWordList(raw);
      if (!parsed) return 0;
      this.customWords = parsed;
    } else if (source !== "general" && source !== "study") return 0;
    this.wordSource = source;
    // Preserve the completed result screen. The selected list is used on retry.
    if (this.g && !this.ended) this.init(this.g);
    return source === "custom"
      ? this.customWords.length
      : source === "study"
        ? STUDY_WORDS.length
        : GENERAL_WORDS.length;
  }
  protected createWord(): string | null {
    const list =
      this.wordSource === "study"
        ? STUDY_WORDS
        : this.wordSource === "custom" && this.customWords.length
          ? this.customWords
          : GENERAL_WORDS;
    return this.g.rng.pick(list);
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.word = this.createWord();
    this.guessed = new Set();
    this.cursor = 0;
    this.misses = 0;
    this.ended = false;
    this.solved = false;
    // Discard the gesture that started this run before accepting new guesses.
    // If no guess controls are held (for example, Enter started the game),
    // a separate guess may arrive before the first fixed update and must survive.
    const input = ctx.input;
    for (const action of GUESS_ACTIONS) input.consumePresses(action);
    input.drainTaps();
    input.drainSwipes();
    this.armed =
      GUESS_ACTIONS.every((action) => !input.isDown(action)) && !input.pointerPosition().isDown;
    this.score = 0;
    this.announce(this.word ? "Guess the word." : "Waiting for the word.");
  }
  destroy(): void {
    this.word = null;
    this.guessed.clear();
  }
  fixedUpdate(_dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    if (!this.armed) {
      // The key/button/tap that started a run must not also guess a letter.
      for (const action of GUESS_ACTIONS) input.consumePresses(action);
      input.drainTaps();
      input.drainSwipes();
      this.armed =
        GUESS_ACTIONS.every((action) => !input.isDown(action)) && !input.pointerPosition().isDown;
      return;
    }
    const directions = (["left", "right", "up", "down"] as const).filter((key) =>
      input.wasPressedWithin(key, 180, true),
    );
    const select = input.wasPressedWithin("primary", 180, true),
      taps = input.drainTaps();
    input.drainSwipes();
    if (!this.word) return;
    let changed = false;
    for (const direction of directions) {
      const next = moveGridCursor(this.cursor, direction, COLS, ROWS);
      // The last row has only five letters; never jump sideways into Z.
      if (next < LETTER_ALPHABET.length) this.cursor = next;
      changed = true;
    }
    for (const tap of taps) {
      const cell = gridCellAt(tap.x, tap.y, LEFT, TOP, CELL, COLS, ROWS);
      if (cell !== null && cell < 26) {
        this.cursor = cell;
        this.guess();
        return;
      }
    }
    if (select) this.guess();
    else if (changed) this.announce("Selected a letter.");
  }
  private guess(): void {
    if (!this.word) return;
    const letter = LETTER_ALPHABET[this.cursor]!;
    if (this.guessed.has(letter)) {
      this.announce(`${letter} was already guessed.`);
      return;
    }
    this.guessed.add(letter);
    const correct = this.word.includes(letter);
    if (!correct) this.misses++;
    this.g.sound.play(correct ? "coin" : "blip");
    const message = `${letter}: ${correct ? "correct" : "not in the word"}.`;
    if (isWordSolved(this.word, this.guessed) || this.misses >= LETTER_LIVES) {
      this.ended = true;
      this.solved = isWordSolved(this.word, this.guessed);
      this.score = this.solved ? 1000 + (LETTER_LIVES - this.misses) * 150 : 0;
      this.announce(`${message} ${this.resultLabel}. Word: ${this.word}.`);
      void this.g.reportGameOver();
    } else this.announce(message);
  }
  protected announce(message: string): void {
    const word = this.word ? maskedWord(this.word, this.guessed) : "not set";
    this.g.announce?.(
      `LETTERS. ${message} Word: ${word}. ${LETTER_LIVES - this.misses} guesses left. Selected ${LETTER_ALPHABET[this.cursor]}. Guessed: ${[...this.guessed].join(", ") || "none"}.`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    const shown = this.word
      ? this.ended && !this.solved
        ? [...this.word].join(" ")
        : maskedWord(this.word, this.guessed)
      : "WAITING FOR WORD";
    const size = this.word ? Math.min(22, Math.floor(470 / (this.word.length * 1.7))) : 16;
    drawText(ctx, shown, 320, 79, {
      font: `${size}px Silkscreen, monospace`,
      color: TOKENS.phosphorHot,
      align: "center",
    });
    drawText(ctx, `${LETTER_LIVES - this.misses} GUESSES LEFT`, 320, 113, {
      font: '12px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "center",
    });
    if (this.word)
      for (let index = 0; index < 26; index++) {
        const x = LEFT + (index % COLS) * CELL,
          y = TOP + Math.floor(index / COLS) * CELL,
          letter = LETTER_ALPHABET[index]!,
          used = this.guessed.has(letter);
        ctx.fillStyle = index === this.cursor ? "#57400F" : "#171209";
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        ctx.strokeStyle = index === this.cursor ? TOKENS.phosphorHot : TOKENS.phosphorDim;
        ctx.lineWidth = index === this.cursor ? 2 : 1;
        ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
        drawText(ctx, letter, x + CELL / 2, y + 28, {
          font: "16px Silkscreen, monospace",
          color: used ? TOKENS.phosphorDim : TOKENS.phosphorHot,
          align: "center",
        });
      }
    drawText(
      ctx,
      this.word ? "ARROWS SELECT · SPACE OR TAP GUESSES" : "ENTER THE WORD BELOW",
      320,
      330,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphor, align: "center" },
    );
  }
}
