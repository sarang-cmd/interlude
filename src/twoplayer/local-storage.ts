/** Safe browser storage for website-only match preferences and records. */
export type LocalStorage = Pick<Storage, "getItem" | "setItem"> | null;

export function readLocalJson(storage: LocalStorage, key: string): unknown {
  try {
    return JSON.parse(storage?.getItem(key) ?? "null") as unknown;
  } catch {
    return null;
  }
}

export function writeLocalJson(storage: LocalStorage, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // A blocked store leaves the current page session playable.
  }
}
