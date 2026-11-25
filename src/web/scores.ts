/** Website-only best scores. They never touch extension storage. */
export const WEB_SCORES_KEY = "interlude.website.highscores.v1";
export type WebScores = Record<string, number>;
type ScoreStorage = Pick<Storage, "getItem" | "setItem"> | null;

const validId = (id: string): boolean => /^[a-z0-9-]{1,32}$/.test(id);
const validScore = (score: unknown): score is number =>
  typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1_000_000_000;

export function readWebScores(storage: ScoreStorage): WebScores {
  const result: WebScores = Object.create(null) as WebScores;
  if (!storage) return result;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(WEB_SCORES_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result;
    for (const [id, score] of Object.entries(parsed)) {
      if (validId(id) && validScore(score)) result[id] = Math.floor(score);
    }
  } catch {
    // Private browsing, malformed data, or storage denied: play still works.
  }
  return result;
}

export function saveWebScore(
  storage: ScoreStorage,
  scores: WebScores,
  gameId: string,
  score: number,
): void {
  if (!validId(gameId) || !validScore(score)) return;
  // Preserve records written by another tab since this page was opened.
  for (const [id, best] of Object.entries(readWebScores(storage))) {
    scores[id] = Math.max(scores[id] ?? 0, best);
  }
  scores[gameId] = Math.max(scores[gameId] ?? 0, Math.floor(score));
  try {
    storage?.setItem(WEB_SCORES_KEY, JSON.stringify(scores));
  } catch {
    // Retain the best in memory if this browser disallows persistent storage.
  }
}
