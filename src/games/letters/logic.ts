export const LETTER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const LETTER_LIVES = 6;
export const GENERAL_WORDS = [
  "ANCHOR",
  "APPLE",
  "ARCADE",
  "BEACON",
  "BLOSSOM",
  "BREEZE",
  "CANDLE",
  "CANYON",
  "CASTLE",
  "CIRCUIT",
  "COMET",
  "COMPASS",
  "DOLPHIN",
  "DRAGON",
  "FOREST",
  "GALAXY",
  "GARDEN",
  "HARBOR",
  "ISLAND",
  "JOURNEY",
  "LANTERN",
  "MEADOW",
  "METEOR",
  "MOUNTAIN",
  "OCEAN",
  "ORBIT",
  "PENGUIN",
  "PIXEL",
  "PLANET",
  "RIVER",
  "ROCKET",
  "SUNSET",
  "THUNDER",
  "TIGER",
  "WINDOW",
  "WONDER",
] as const;
export const STUDY_WORDS = [
  "ALGEBRA",
  "ANALYSIS",
  "ATOM",
  "BIOLOGY",
  "CATALYST",
  "CELL",
  "CITATION",
  "CLIMATE",
  "COGNITION",
  "CONCEPT",
  "CONTEXT",
  "DATA",
  "ECOLOGY",
  "ELEMENT",
  "ENERGY",
  "EQUATION",
  "EVIDENCE",
  "FRACTION",
  "GENOME",
  "GEOMETRY",
  "GRAVITY",
  "HYPOTHESIS",
  "LANGUAGE",
  "MATRIX",
  "MOLECULE",
  "NEURON",
  "OBSERVATION",
  "PATTERN",
  "PHOTON",
  "PROOF",
  "RATIO",
  "RESEARCH",
  "SAMPLE",
  "THEOREM",
  "THESIS",
  "VARIABLE",
] as const;
export function normalizeWord(value: string): string | null {
  const word = value.trim();
  // Validate before case conversion: Unicode folds such as ß → SS are not A–Z input.
  return /^[A-Za-z]{2,24}$/.test(word) ? word.toUpperCase() : null;
}
/** Accept newline-, comma- or semicolon-separated words; reject bad entries. */
export function parseWordList(raw: string): string[] | null {
  if (raw.length > 4000) return null;
  const entries = raw
    .split(/[\n,;\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!entries.length || entries.length > 100) return null;
  const words = entries.map(normalizeWord);
  return words.some((word) => word === null) ? null : [...new Set(words as string[])];
}
export function maskedWord(word: string, guessed: ReadonlySet<string>): string {
  return [...word].map((letter) => (guessed.has(letter) ? letter : "_")).join(" ");
}
export function isWordSolved(word: string, guessed: ReadonlySet<string>): boolean {
  return word.length > 0 && [...word].every((letter) => guessed.has(letter));
}
