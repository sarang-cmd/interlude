/** Shared, local-only word-list controls for the website and extension cabinets. */
import type { LettersGame, WordSource } from "./game";

export function mountWordLists(root: HTMLElement, game: LettersGame): () => void {
  root.replaceChildren();
  root.hidden = false;
  const label = document.createElement("label");
  label.className = "word-list-label";
  const labelText = document.createElement("span");
  labelText.textContent = "LETTERS / WORD LIST";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "LETTERS word list");
  for (const [value, text] of [
    ["general", "GENERAL"],
    ["study", "STUDY"],
    ["custom", "PASTE YOUR OWN"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = game.wordSource;
  label.append(labelText, select);
  const custom = document.createElement("div");
  custom.className = "word-list-custom";
  custom.hidden = select.value !== "custom";
  const textLabel = document.createElement("label");
  textLabel.className = "word-list-label";
  const textTitle = document.createElement("span");
  textTitle.textContent = "PASTE WORDS / ONE PER LINE OR COMMA";
  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.maxLength = 4000;
  textarea.spellcheck = false;
  textarea.setAttribute("aria-label", "Paste your word list");
  textarea.placeholder = "ORBIT, GALAXY, PLANET";
  textLabel.append(textTitle, textarea);
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "game-control";
  apply.textContent = "APPLY LIST";
  custom.append(textLabel, apply);
  const note = document.createElement("p");
  note.className = "word-list-note";
  note.textContent =
    "2–24 letters A–Z per word; up to 100. Lists stay in cabinet memory; the app does not save or send them. A host page or observer may still see input. Changing a list resets an unfinished word; after a result it applies on retry.";
  const status = document.createElement("p");
  status.className = "word-list-note";
  status.setAttribute("role", "status");
  select.addEventListener("change", () => {
    const source = select.value as WordSource;
    custom.hidden = source !== "custom";
    status.textContent =
      source === "custom"
        ? "Paste words and choose APPLY LIST. The previous list remains active until then."
        : "";
    if (source === "general" || source === "study") {
      textarea.value = "";
      const count = game.setWordSource(source);
      status.textContent = `${source.toUpperCase()} list ready: ${count} words.`;
    }
  });
  apply.addEventListener("click", () => {
    const count = game.setWordSource("custom", textarea.value);
    if (!count) {
      status.textContent =
        "Enter 1–100 words of 2–24 letters A–Z, separated by commas or new lines.";
      return;
    }
    textarea.value = "";
    status.textContent = `CUSTOM list ready: ${count} ${count === 1 ? "word" : "words"}.`;
  });
  root.append(label, custom, note, status);
  return () => {
    textarea.value = "";
    root.replaceChildren();
    root.hidden = true;
  };
}
