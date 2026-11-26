/** Web-only on-screen duel controls; pointer-down is the reaction event. */
import type { EngineState } from "../engine/engine";
import type { QuickDrawDuelGame } from "../games/quickdraw/quickdraw.2p";

interface DuelOptions {
  root: HTMLElement;
  controlRoot: HTMLElement;
  game: QuickDrawDuelGame;
  state(): EngineState;
  focusGame(): void;
}
export function mountQuickDrawDuel({ root, controlRoot, game, state, focusGame }: DuelOptions): {
  refresh(): void;
  destroy(): void;
} {
  root.replaceChildren();
  root.hidden = false;
  const title = document.createElement("h4");
  title.textContent = "QUICK DRAW / LOCAL DUEL";
  const note = document.createElement("p");
  note.className = "settings-note";
  note.textContent =
    "Press START GAME, then both players wait for the same GO cue. Player 1 uses F, player 2 uses J, or use the two buttons below. A false start loses. Results use game time and browser event order.";
  root.append(title, note);
  controlRoot.replaceChildren();
  controlRoot.hidden = false;
  controlRoot.setAttribute("role", "group");
  controlRoot.setAttribute("aria-label", "Quick Draw duel controls");
  const buttons: HTMLButtonElement[] = [];
  for (const player of [1, 2] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "game-control";
    button.textContent = `PLAYER ${player} DRAW`;
    button.setAttribute("aria-label", `Player ${player} draw`);
    button.addEventListener("pointerdown", (event) => {
      if (state() !== "playing") return;
      event.preventDefault();
      focusGame();
      game.draw(player);
    });
    button.addEventListener("click", (event) => {
      if (event.detail !== 0 || state() !== "playing") return;
      focusGame();
      game.draw(player);
    });
    buttons.push(button);
    controlRoot.append(button);
  }
  const refresh = (): void => {
    for (const button of buttons) button.disabled = state() !== "playing";
  };
  refresh();
  return {
    refresh,
    destroy() {
      root.replaceChildren();
      root.hidden = true;
      controlRoot.replaceChildren();
      controlRoot.hidden = true;
    },
  };
}
