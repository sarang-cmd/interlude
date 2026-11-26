import type { RNG } from "../shared/rng";
import { handOutcome, handSignals, type HandSignal } from "../games/handsignals/logic";
import type { AIDifficulty } from "./difficulty";

/** Chooses before the current human signal exists; only prior rounds are considered. */
export function chooseHand(
  history: readonly HandSignal[],
  extended: boolean,
  level: AIDifficulty,
  rng: RNG,
): HandSignal {
  const choices = handSignals(extended);
  const validHistory = history.slice(-20).filter((choice) => choices.includes(choice));
  const probability: Readonly<Record<AIDifficulty, number>> = {
    rookie: 0,
    easy: 0.15,
    regular: 0.35,
    hard: 0.55,
    veteran: 0.75,
  };
  if (validHistory.length >= 2 && rng.chance(probability[level])) {
    const counts = choices.map((choice) => validHistory.filter((item) => item === choice).length);
    const highest = Math.max(...counts);
    const common = rng.pick(choices.filter((_, index) => counts[index] === highest));
    return rng.pick(choices.filter((choice) => handOutcome(choice, common) === 1));
  }
  return rng.pick(choices);
}
