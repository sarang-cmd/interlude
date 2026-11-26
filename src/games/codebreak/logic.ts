import type { RNG } from "../../shared/rng";

export const CODE_LENGTH = 4,
  CODE_COLORS = 6,
  CODE_ATTEMPTS = 10;
export interface CodeFeedback {
  exact: number;
  misplaced: number;
}
export function parseCode(value: string): number[] | null {
  return /^[1-6]{4}$/.test(value) ? [...value].map(Number) : null;
}
export function randomCode(rng: RNG): number[] {
  return Array.from({ length: CODE_LENGTH }, () => rng.int(1, CODE_COLORS));
}
/** Exact matches are removed before counting misplaced digits, so duplicates count once. */
export function codeFeedback(secret: readonly number[], guess: readonly number[]): CodeFeedback {
  let exact = 0;
  const left = Array<number>(CODE_COLORS + 1).fill(0),
    right = Array<number>(CODE_COLORS + 1).fill(0);
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (secret[i] === guess[i]) exact++;
    else {
      left[secret[i]!]!++;
      right[guess[i]!]!++;
    }
  }
  let misplaced = 0;
  for (let value = 1; value <= CODE_COLORS; value++)
    misplaced += Math.min(left[value]!, right[value]!);
  return { exact, misplaced };
}
