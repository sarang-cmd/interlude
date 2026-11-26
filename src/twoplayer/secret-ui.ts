/** Web-only ephemeral secret entry. Values are never written to browser storage. */
import type { EngineState } from "../engine/engine";

export interface SecretGame {
  readonly needsSecret: boolean;
  onNeedsSecret: (() => void) | null;
  setSecret(value: string): boolean;
}
interface SecretOptions {
  root: HTMLElement;
  game: SecretGame;
  kind: "code" | "word";
  state(): EngineState;
  focusGame(): void;
}
export function mountSecretInput({ root, game, kind, state, focusGame }: SecretOptions): {
  refresh(): void;
  destroy(): void;
} {
  root.replaceChildren();
  root.hidden = false;
  const title = document.createElement("h4");
  title.textContent = kind === "code" ? "SECRET CODE / LOCAL MATCH" : "SECRET WORD / LOCAL MATCH";
  const note = document.createElement("p");
  note.className = "settings-note";
  const form = document.createElement("form");
  form.autocomplete = "off";
  const label = document.createElement("label");
  label.className = "game-setting";
  const name = document.createElement("span");
  name.textContent = kind === "code" ? "PLAYER 1 / HIDDEN CODE" : "PLAYER 1 / HIDDEN WORD";
  const input = document.createElement("input");
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", kind === "code" ? "Hidden code" : "Hidden word");
  input.maxLength = kind === "code" ? 4 : 24;
  input.inputMode = kind === "code" ? "numeric" : "text";
  label.append(name, input);
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "game-control";
  button.textContent = kind === "code" ? "SET CODE" : "SET WORD";
  const status = document.createElement("p");
  status.className = "settings-note";
  status.setAttribute("role", "status");
  form.append(label, button, status);
  root.append(title, note, form);
  const refresh = (): void => {
    const active = state() === "playing" && game.needsSecret;
    form.hidden = !active;
    if (!active) input.value = "";
    note.textContent = active
      ? kind === "code"
        ? "Player 1: enter four digits from 1 to 6, then pass the device. Repeats are allowed."
        : "Player 1: enter one word of 2–24 letters A to Z in secret, then pass the device."
      : state() === "ready"
        ? "Press START GAME, then enter a secret. It stays in this match only."
        : "The secret stays in this match only and is not saved.";
    if (!active) status.textContent = "";
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state() !== "playing" || !game.needsSecret) return;
    if (!game.setSecret(input.value)) {
      status.textContent =
        kind === "code"
          ? "Use exactly four digits from 1 to 6."
          : "Use one word of 2–24 letters A to Z.";
      return;
    }
    input.value = "";
    refresh();
    focusGame();
  });
  const clearOnHidden = (): void => {
    if (document.hidden) {
      input.value = "";
      status.textContent = "";
    }
  };
  document.addEventListener("visibilitychange", clearOnHidden);
  game.onNeedsSecret = refresh;
  refresh();
  return {
    refresh,
    destroy() {
      document.removeEventListener("visibilitychange", clearOnHidden);
      if (game.onNeedsSecret === refresh) game.onNeedsSecret = null;
      input.value = "";
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
