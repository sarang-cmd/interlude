/** Accessible controls and local records for shared-board 2048. */
import type { Coop2048Game, CoopProgress } from "../games/2048/coop.2p";
import { cleanPlayerName } from "./pong-settings";
import {
  appendCoopRecord,
  COOP_GOALS,
  COOP_UNDOS,
  readCoopRecords,
  readCoopSettings,
  saveCoopSettings,
  type CoopResult,
} from "./coop-settings";
import { raceActions, raceBindingError, RACE_DURATIONS } from "./race-settings";

interface MountOptions {
  root: HTMLElement;
  controlRoot: HTMLElement;
  game: Coop2048Game;
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

export function mountCoop2048({
  root,
  controlRoot,
  game,
  storage,
  focusGame,
  acceptsInput,
}: MountOptions): () => void {
  const settings = readCoopSettings(storage);
  let records: CoopResult[] = readCoopRecords(storage);
  let wins = 0;
  let losses = 0;
  let locked = false;
  const fields: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement> = [];
  const playerButtons: [HTMLButtonElement[], HTMLButtonElement[]] = [[], []];
  root.replaceChildren();
  root.hidden = false;
  controlRoot.replaceChildren();
  controlRoot.hidden = false;
  controlRoot.setAttribute("role", "group");
  controlRoot.setAttribute("aria-label", "Co-op touch controls");
  const title = node("h4", "2048 / SHARED BOARD CO-OP");
  const note = node(
    "p",
    "Take turns on one board. Reach the target tile before the clock ends. A valid move passes the turn. Undo restores the previous board and returns the turn to the previous player.",
  );
  note.className = "settings-note";
  const details = node(
    "p",
    "Use two key sets, two gamepads or the touch rows. P pauses. Rules lock during a round. The clock uses game speed. Results stay in this browser.",
  );
  details.className = "settings-note";
  const grid = node("div");
  grid.className = "local-grid";
  const series = node("p");
  series.className = "local-score";
  const live = node("p", `${settings.names[0]} moves first.`);
  live.className = "settings-note";
  live.setAttribute("aria-label", "Co-op match status");
  const status = node("p", "");
  status.className = "settings-note";
  status.setAttribute("role", "status");
  const history = node("ol");
  history.className = "local-history";

  const label = (text: string, control: HTMLElement): HTMLLabelElement => {
    const wrapper = node("label");
    wrapper.className = "game-setting";
    wrapper.append(node("span", text), control);
    return wrapper;
  };
  const sync = (): void => {
    game.configureLocal(settings);
    saveCoopSettings(storage, settings);
  };
  const updateSeries = (message = ""): void => {
    series.textContent = `TEAM RECORD · ${wins} WINS / ${losses} LOSSES`;
    status.textContent = message;
  };
  const resetSession = (message: string): void => {
    wins = 0;
    losses = 0;
    game.resetSession();
    updateSeries(message);
  };
  const setLocked = (value: boolean): void => {
    locked = value;
    for (const field of fields) field.disabled = value;
  };
  const setTurn = (turn: 0 | 1): void => {
    for (const player of [0, 1] as const)
      for (const button of playerButtons[player]) button.disabled = player !== turn;
  };
  const updateHistory = (): void => {
    history.replaceChildren();
    for (const record of [...records].reverse().slice(0, 5)) {
      history.append(
        node(
          "li",
          `${record.names.join(" + ")} · ${record.won ? "WIN" : "LOSS"} · TILE ${record.bestTile}/${record.goal} · ${record.score} PTS · SEED ${record.seed}`,
        ),
      );
    }
    if (!records.length) history.append(node("li", "No co-op records yet."));
  };

  for (const player of [0, 1] as const) {
    const name = node("input");
    name.type = "text";
    name.maxLength = 12;
    name.value = settings.names[player];
    name.setAttribute("aria-label", `Co-op player ${player + 1} name`);
    name.addEventListener("change", () => {
      settings.names[player] = cleanPlayerName(name.value, `PLAYER ${player + 1}`);
      name.value = settings.names[player];
      sync();
      resetSession("New team. Session record reset.");
      live.textContent = `${settings.names[0]} moves first.`;
    });
    fields.push(name);
    grid.append(label(`PLAYER ${player + 1} NAME`, name));
  }

  const addSelect = (
    caption: string,
    name: string,
    values: readonly number[],
    selected: number,
    describe: (value: number) => string,
    change: (value: number) => void,
  ): void => {
    const select = node("select");
    select.setAttribute("aria-label", name);
    for (const value of values) {
      const option = node("option", describe(value));
      option.value = String(value);
      select.append(option);
    }
    select.value = String(selected);
    select.addEventListener("change", () => {
      const value = Number(select.value);
      if (!values.includes(value)) return;
      change(value);
      sync();
      resetSession("New rules. Session record reset.");
    });
    fields.push(select);
    grid.append(label(caption, select));
  };
  addSelect("TARGET TILE", "Co-op target tile", COOP_GOALS, settings.goal, String, (value) => {
    settings.goal = value;
  });
  addSelect(
    "ROUND LENGTH",
    "Co-op round length",
    RACE_DURATIONS,
    settings.seconds,
    (value) => `${value} GAME SECONDS`,
    (value) => {
      settings.seconds = value;
    },
  );
  addSelect("SHARED UNDOS", "Co-op shared undos", COOP_UNDOS, settings.undos, String, (value) => {
    settings.undos = value;
  });

  const seed = node("input");
  seed.type = "number";
  seed.min = "0";
  seed.max = String(0xffffffff);
  seed.step = "1";
  seed.value = String(settings.seed);
  seed.setAttribute("aria-label", "Co-op seed");
  seed.addEventListener("change", () => {
    const value = Number(seed.value);
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      seed.value = String(settings.seed);
      status.textContent = "Enter a whole number from 0 to 4294967295.";
      return;
    }
    settings.seed = value;
    sync();
    resetSession("New seed. Session record reset.");
  });
  fields.push(seed);
  grid.append(label("ROUND SEED", seed));

  for (const player of [0, 1] as const) {
    const group = node("div");
    group.className = "local-player-controls";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", `Co-op player ${player + 1} controls`);
    const groupTitle = node("span", `PLAYER ${player + 1}`);
    groupTitle.className = "local-player-label";
    group.append(groupTitle);
    for (const [action, actionLabel] of raceActions("twenty48")) {
      if (action === "primary") continue;
      const key = node("input");
      key.type = "text";
      key.readOnly = true;
      key.value = settings.keys[player][action] ?? "";
      key.setAttribute("aria-label", `Co-op player ${player + 1} ${actionLabel} key`);
      key.addEventListener("keydown", (event) => {
        if (event.key === "Tab") return;
        if (event.key === "Escape") {
          key.blur();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const candidate = [
          { ...settings.keys[0] },
          { ...settings.keys[1] },
        ] as typeof settings.keys;
        candidate[player][action] = event.code;
        const error = raceBindingError("twenty48", candidate);
        if (error) {
          status.textContent = error;
          return;
        }
        settings.keys = candidate;
        key.value = event.code;
        sync();
        status.textContent = "Key saved.";
      });
      fields.push(key);
      grid.append(label(`P${player + 1} ${actionLabel.toUpperCase()} / PRESS KEY`, key));

      const buttonText =
        action === "left"
          ? "←"
          : action === "right"
            ? "→"
            : action === "up"
              ? "↑"
              : action === "down"
                ? "↓"
                : "UNDO";
      const button = node("button", buttonText);
      button.type = "button";
      button.className = "game-control";
      button.setAttribute("aria-label", `Co-op player ${player + 1} ${actionLabel}`);
      button.addEventListener("pointerdown", (event) => {
        if (!acceptsInput()) return;
        event.preventDefault();
        focusGame();
        game.pressControl(player, action);
      });
      button.addEventListener("click", (event) => {
        if (event.detail !== 0 || !acceptsInput()) return;
        focusGame();
        game.pressControl(player, action);
      });
      playerButtons[player].push(button);
      group.append(button);
    }
    controlRoot.append(group);
  }

  const reset = node("button", "RESET TEAM RECORD");
  reset.type = "button";
  reset.className = "game-control";
  reset.addEventListener("click", () => resetSession("Team record reset."));
  fields.push(reset);
  const historyTitle = node("p", "RECENT CO-OP MATCHES");
  historyTitle.className = "micro-label";
  root.append(title, note, details, grid, series, live, status, reset, historyTitle, history);
  sync();
  setTurn(0);
  updateSeries();
  updateHistory();

  game.onProgress = (progress: CoopProgress) => {
    if (!locked) setLocked(true);
    setTurn(progress.turn);
    live.textContent = `${progress.names[progress.turn]} MOVES NEXT · TILE ${progress.bestTile}/${progress.goal} · ${progress.score} PTS · ${progress.remaining} GAME SECONDS · ${progress.undos} UNDOS`;
  };
  game.onMessage = (message) => {
    status.textContent = message;
  };
  game.onResult = (result) => {
    setLocked(false);
    if (result.won) wins++;
    else losses++;
    records = appendCoopRecord(storage, result, records);
    updateSeries(
      result.won
        ? "Team reached the target. Start again for another round."
        : "Round ended. Start again for another round.",
    );
    updateHistory();
    setTurn(0);
  };

  return () => {
    game.onProgress = null;
    game.onResult = null;
    game.onMessage = null;
    root.replaceChildren();
    root.hidden = true;
    controlRoot.replaceChildren();
    controlRoot.hidden = true;
  };
}
