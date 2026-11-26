import type { RNG } from "../../shared/rng";

export type FlipResult = "invalid" | "first" | "match" | "miss";
export const PAIR_SYMBOLS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export class PairsBoard {
  readonly cards: readonly string[];
  readonly matched = Array<boolean>(16).fill(false);
  faceUp: number[] = [];
  attempts = 0;
  constructor(rng: RNG) {
    this.cards = rng.shuffle([...PAIR_SYMBOLS, ...PAIR_SYMBOLS]);
  }
  get pairs(): number {
    return this.matched.filter(Boolean).length / 2;
  }
  get finished(): boolean {
    return this.pairs === PAIR_SYMBOLS.length;
  }
  flip(index: number): FlipResult {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= 16 ||
      this.faceUp.length === 2 ||
      this.matched[index] ||
      this.faceUp.includes(index)
    )
      return "invalid";
    this.faceUp.push(index);
    if (this.faceUp.length === 1) return "first";
    this.attempts++;
    if (this.cards[this.faceUp[0]!] === this.cards[this.faceUp[1]!]) {
      for (const cell of this.faceUp) this.matched[cell] = true;
      this.faceUp = [];
      return "match";
    }
    return "miss";
  }
  hideMismatch(): void {
    if (this.faceUp.length === 2) this.faceUp = [];
  }
  visible(index: number): boolean {
    return !!this.matched[index] || this.faceUp.includes(index);
  }
}
