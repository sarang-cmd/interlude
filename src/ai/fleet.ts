import type { RNG } from "../shared/rng";
import type { ShotKnowledge } from "../games/fleet/logic";
import { AI_PROFILES, type AIDifficulty } from "./difficulty";

function neighbors(index: number): number[] {
  const row = Math.floor(index / 10),
    col = index % 10,
    result: number[] = [];
  if (row > 0) result.push(index - 10);
  if (row < 9) result.push(index + 10);
  if (col > 0) result.push(index - 1);
  if (col < 9) result.push(index + 1);
  return result;
}

/** A bounded information-only policy. It receives fired outcomes, not ship positions. */
export function fleetTarget(
  knowledge: readonly ShotKnowledge[],
  difficulty: AIDifficulty,
  rng: RNG,
): number | null {
  if (
    knowledge.length !== 100 ||
    !Array.from(knowledge).every((cell) => ["unknown", "miss", "hit", "sunk"].includes(cell))
  )
    return null;
  const unknown = knowledge.flatMap((state, index) => (state === "unknown" ? [index] : []));
  if (!unknown.length) return null;
  if (!rng.chance(AI_PROFILES[difficulty].errorChance)) {
    const candidates = unknown
      .map((index) => ({
        index,
        score: neighbors(index).filter((neighbor) => knowledge[neighbor] === "hit").length,
      }))
      .filter((item) => item.score > 0);
    if (candidates.length) {
      const best = Math.max(...candidates.map((item) => item.score));
      return rng.pick(candidates.filter((item) => item.score === best).map((item) => item.index));
    }
    if (difficulty === "hard" || difficulty === "veteran") {
      const parity = unknown.filter((index) => (Math.floor(index / 10) + (index % 10)) % 2 === 0);
      if (parity.length) return rng.pick(parity);
    }
  }
  return rng.pick(unknown);
}
