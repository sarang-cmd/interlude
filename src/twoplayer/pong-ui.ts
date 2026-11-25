import type { PongLocalGame, PaddleDirection } from "../games/pong/pong.2p";
import {
  appendLocalPongRecord,
  bindingError,
  cleanPlayerName,
  LOCAL_SPEEDS,
  readLocalPongRecords,
  readLocalPongSettings,
  saveLocalPongSettings,
  type LocalAction,
  type LocalPongRecord,
} from "./pong-settings";

interface MountOptions {
  root: HTMLElement;
  controlRoot: HTMLElement;
  game: PongLocalGame;
  storage: Storage | null;
  focusGame(): void;
  acceptsInput(): boolean;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

export function mountLocalPong({
  root,
  controlRoot,
  game,
  storage,
  focusGame,
  acceptsInput,
}: MountOptions): () => void {
  const settings = readLocalPongSettings(storage);
  let records: LocalPongRecord[] = readLocalPongRecords(storage);
  let wins: [number, number] = [0, 0];
  root.replaceChildren();
  root.hidden = false;
  const title = node("h4", "LOCAL PONG / ONE DEVICE");
  const note = node(
    "p",
    "Set four different keys below. Connect two gamepads, or use the touch controls. P pauses. The seed controls serves, and sides alternate.",
  );
  note.className = "settings-note";
  const grid = node("div");
  grid.className = "local-grid";
  const series = node("p");
  series.className = "local-score";
  series.setAttribute("role", "status");
  const status = node("p", "");
  status.className = "settings-note";
  status.setAttribute("role", "status");
  const history = node("ol");
  history.className = "local-history";

  const sync = (): void => {
    game.configureLocal(settings);
    saveLocalPongSettings(storage, settings);
  };
  const updateSeries = (message = ""): void => {
    series.textContent = `${settings.names[0]} ${wins[0]} / ${wins[1]} ${settings.names[1]} · BEST OF ${settings.bestOf}`;
    status.textContent = message;
  };
  const updateHistory = (): void => {
    history.replaceChildren();
    for (const record of [...records].reverse().slice(0, 5)) {
      history.append(
        node(
          "li",
          `${record.names[0]} ${record.scores[0]} / ${record.scores[1]} ${record.names[1]}`,
        ),
      );
    }
    if (!records.length) history.append(node("li", "No local match records yet."));
  };
  const label = (text: string, control: HTMLElement): HTMLLabelElement => {
    const wrapper = node("label");
    wrapper.className = "game-setting";
    wrapper.append(node("span", text), control);
    return wrapper;
  };

  for (const player of [0, 1] as const) {
    const name = node("input");
    name.type = "text";
    name.maxLength = 12;
    name.value = settings.names[player];
    name.setAttribute("aria-label", `Player ${player + 1} name`);
    name.addEventListener("change", () => {
      settings.names[player] = cleanPlayerName(name.value, `PLAYER ${player + 1}`);
      name.value = settings.names[player];
      sync();
      updateSeries();
    });
    grid.append(label(`PLAYER ${player + 1} NAME`, name));

    const speed = node("select");
    speed.setAttribute("aria-label", `Player ${player + 1} paddle speed`);
    for (const item of LOCAL_SPEEDS) {
      const option = node("option", `${item}%`);
      option.value = String(item);
      speed.append(option);
    }
    speed.value = String(settings.speeds[player]);
    speed.addEventListener("change", () => {
      const value = Number(speed.value);
      if (!LOCAL_SPEEDS.some((item) => item === value)) return;
      settings.speeds[player] = value;
      sync();
    });
    grid.append(label(`PLAYER ${player + 1} SPEED`, speed));
  }

  const seed = node("input");
  seed.type = "number";
  seed.min = "0";
  seed.max = String(0xffffffff);
  seed.step = "1";
  seed.value = String(settings.seed);
  seed.setAttribute("aria-label", "Match seed");
  seed.addEventListener("change", () => {
    const value = Number(seed.value);
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      seed.value = String(settings.seed);
      status.textContent = "Enter a whole number from 0 to 4294967295.";
      return;
    }
    settings.seed = value;
    wins = [0, 0];
    game.resetSeries();
    sync();
    updateSeries("Seed applies to the next round.");
  });
  grid.append(label("MATCH SEED", seed));

  const keyActions: Array<[LocalAction, string]> = [
    ["p1Up", "PLAYER 1 UP"],
    ["p1Down", "PLAYER 1 DOWN"],
    ["p2Up", "PLAYER 2 UP"],
    ["p2Down", "PLAYER 2 DOWN"],
  ];
  for (const [action, caption] of keyActions) {
    const input = node("input");
    input.type = "text";
    input.readOnly = true;
    input.value = settings.keys[action];
    input.setAttribute("aria-label", `${caption.toLowerCase()} key`);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Tab") return;
      if (event.key === "Escape") {
        input.blur();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const candidate = { ...settings.keys, [action]: event.code };
      const error = bindingError(candidate);
      if (error) {
        status.textContent = error;
        return;
      }
      settings.keys = candidate;
      input.value = event.code;
      sync();
      status.textContent = "Key saved.";
    });
    grid.append(label(`${caption} / PRESS A KEY`, input));
  }

  const rounds = node("select");
  rounds.setAttribute("aria-label", "Series length");
  for (const count of [1, 3, 5] as const) {
    const option = node("option", `BEST OF ${count}`);
    option.value = String(count);
    rounds.append(option);
  }
  rounds.value = String(settings.bestOf);
  rounds.addEventListener("change", () => {
    const count = Number(rounds.value);
    if (count !== 1 && count !== 3 && count !== 5) return;
    settings.bestOf = count;
    wins = [0, 0];
    game.resetSeries();
    sync();
    updateSeries("New series started.");
  });
  grid.append(label("SERIES LENGTH", rounds));

  const buttons = controlRoot;
  buttons.replaceChildren();
  buttons.hidden = false;
  buttons.setAttribute("role", "group");
  buttons.setAttribute("aria-label", "Player 2 touch controls");
  for (const direction of ["up", "down"] as const satisfies readonly PaddleDirection[]) {
    const button = node("button", direction === "up" ? "PLAYER 2 ↑" : "PLAYER 2 ↓");
    button.type = "button";
    button.className = "game-control";
    button.setAttribute("aria-label", `Player 2 move ${direction}`);
    button.addEventListener("pointerdown", (event) => {
      if (!acceptsInput()) return;
      event.preventDefault();
      focusGame();
      game.startGesture(`p2-button:${event.pointerId}`);
      game.setSecond(direction, true, `button:${event.pointerId}`);
      game.tapSecond(direction);
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        /* synthesized event */
      }
    });
    const release = (event: PointerEvent): void =>
      game.setSecond(direction, false, `button:${event.pointerId}`);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("click", (event) => {
      if (event.detail !== 0 || !acceptsInput()) return;
      focusGame();
      game.startGesture("p2-accessible");
      game.tapSecond(direction);
    });
    buttons.append(button);
  }
  const reset = node("button", "RESET SERIES");
  reset.type = "button";
  reset.className = "game-control";
  reset.addEventListener("click", () => {
    wins = [0, 0];
    game.resetSeries();
    updateSeries("New series started.");
  });
  const historyTitle = node("p", "RECENT LOCAL MATCHES");
  historyTitle.className = "micro-label";
  root.append(title, note, grid, series, status, reset, historyTitle, history);
  sync();
  updateSeries();
  updateHistory();

  game.onResult = (result) => {
    const target = (settings.bestOf + 1) / 2;
    if (wins.some((value) => value >= target)) wins = [0, 0];
    wins[result.winner - 1]!++;
    records = appendLocalPongRecord(
      storage,
      {
        playedAt: Date.now(),
        names: [...settings.names],
        scores: result.scores,
        winner: result.winner,
      },
      records,
    );
    const winner = settings.names[result.winner - 1]!;
    updateSeries(
      wins[result.winner - 1]! >= target
        ? `${winner} wins the series. Start again for a new series.`
        : `${winner} wins the round. Start again for the next round.`,
    );
    updateHistory();
  };

  return () => {
    game.onResult = null;
    root.replaceChildren();
    root.hidden = true;
    buttons.replaceChildren();
    buttons.hidden = true;
  };
}
