export const CLASSIC_SIGNALS = ["rock", "paper", "scissors"] as const;
export const EXTENDED_SIGNALS = ["rock", "paper", "scissors", "lizard", "spock"] as const;
export type HandSignal = (typeof EXTENDED_SIGNALS)[number];
const BEATS: Readonly<Record<HandSignal, readonly HandSignal[]>> = {
  rock: ["scissors", "lizard"],
  paper: ["rock", "spock"],
  scissors: ["paper", "lizard"],
  lizard: ["spock", "paper"],
  spock: ["scissors", "rock"],
};
export function handSignals(extended: boolean): readonly HandSignal[] {
  return extended ? EXTENDED_SIGNALS : CLASSIC_SIGNALS;
}
/** Outcome from the first player's perspective. */
export function handOutcome(first: HandSignal, second: HandSignal): -1 | 0 | 1 {
  if (first === second) return 0;
  return BEATS[first].includes(second) ? 1 : -1;
}
