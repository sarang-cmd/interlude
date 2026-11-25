/** Settings and accessible controls for the website's split-screen races. */
import type { SplitRaceGame } from "./split-race";
import {
  appendRaceRecord,
  raceActions,
  raceBindingError,
  RACE_DURATIONS,
  RACE_HANDICAPS,
  readRaceRecords,
  readRaceSettings,
  saveRaceSettings,
  type RaceResult,
} from "./race-settings";
import { cleanPlayerName } from "./pong-settings";

interface MountOptions {
  root: HTMLElement;
  controlRoot: HTMLElement;
  game: SplitRaceGame;
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

export function mountLocalRace({
  root,
  controlRoot,
  game,
  storage,
  focusGame,
  acceptsInput,
}: MountOptions): () => void {
  const settings = readRaceSettings(storage, game.gameId);
  let records: RaceResult[] = readRaceRecords(storage);
  let wins: [number, number] = [0, 0];
  let locked = false;
  const fields: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement> = [];
  root.replaceChildren();
  root.hidden = false;
  controlRoot.replaceChildren();
  controlRoot.hidden = false;
  controlRoot.setAttribute("role", "group");
  controlRoot.setAttribute("aria-label", "Two-player touch controls");

  const title = node("h4", `LOCAL ${game.manifest.name} / SPLIT SCREEN`);
  const note = node(
    "p",
    "Both boards start from the same seed. Different moves lead to different later draws. The higher adjusted score wins. Survival time breaks score ties. Rules lock during a round.",
  );
  note.className = "settings-note";
  const grid = node("div");
  grid.className = "local-grid";
  const series = node("p");
  series.className = "local-score";
  const live = node("p", "Scores appear after the round starts.");
  live.className = "settings-note";
  live.setAttribute("aria-label", "Live match score");
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
    saveRaceSettings(storage, game.gameId, settings);
  };
  const updateSeries = (message = ""): void => {
    series.textContent = `${settings.names[0]} ${wins[0]} / ${wins[1]} ${settings.names[1]} · BEST OF ${settings.bestOf}`;
    status.textContent = message;
  };
  const setLocked = (value: boolean): void => {
    locked = value;
    for (const field of fields) field.disabled = value;
  };
  const updateHistory = (): void => {
    history.replaceChildren();
    const recent = records
      .filter((record) => record.game === game.gameId)
      .slice(-5)
      .reverse();
    for (const record of recent) {
      const result = record.winner ? `${record.names[record.winner - 1]} wins` : "Draw";
      history.append(
        node(
          "li",
          `${record.names[0]} ${record.adjusted[0]} / ${record.adjusted[1]} ${record.names[1]} · ${result} · seed ${record.seed}`,
        ),
      );
    }
    if (!recent.length) history.append(node("li", "No local match records yet."));
  };
  const resetSeries = (message: string): void => {
    wins = [0, 0];
    game.resetSeries();
    updateSeries(message);
  };

  for (const player of [0, 1] as const) {
    const name = node("input");
    name.type = "text";
    name.maxLength = 12;
    name.value = settings.names[player];
    name.setAttribute("aria-label", `Race player ${player + 1} name`);
    name.addEventListener("change", () => {
      settings.names[player] = cleanPlayerName(name.value, `PLAYER ${player + 1}`);
      name.value = settings.names[player];
      sync();
      updateSeries();
    });
    fields.push(name);
    grid.append(label(`PLAYER ${player + 1} NAME`, name));

    const handicap = node("select");
    handicap.setAttribute("aria-label", `Player ${player + 1} score handicap`);
    for (const item of RACE_HANDICAPS) {
      const option = node("option", `${item}%`);
      option.value = String(item);
      handicap.append(option);
    }
    handicap.value = String(settings.handicap[player]);
    handicap.addEventListener("change", () => {
      const value = Number(handicap.value);
      if (!RACE_HANDICAPS.some((item) => item === value)) return;
      settings.handicap[player] = value;
      sync();
      resetSeries("New handicap. Series reset.");
    });
    fields.push(handicap);
    grid.append(label(`PLAYER ${player + 1} SCORE`, handicap));
  }

  const duration = node("select");
  duration.setAttribute("aria-label", "Round length");
  for (const item of RACE_DURATIONS) {
    const option = node("option", `${item} GAME SECONDS`);
    option.value = String(item);
    duration.append(option);
  }
  duration.value = String(settings.seconds);
  duration.addEventListener("change", () => {
    const value = Number(duration.value);
    if (!RACE_DURATIONS.some((item) => item === value)) return;
    settings.seconds = value;
    sync();
    resetSeries("New round length. Series reset.");
  });
  fields.push(duration);
  grid.append(label("ROUND LENGTH", duration));

  const seed = node("input");
  seed.type = "number";
  seed.min = "0";
  seed.max = String(0xffffffff);
  seed.step = "1";
  seed.value = String(settings.seed);
  seed.setAttribute("aria-label", "Race seed");
  seed.addEventListener("change", () => {
    const value = Number(seed.value);
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      seed.value = String(settings.seed);
      status.textContent = "Enter a whole number from 0 to 4294967295.";
      return;
    }
    settings.seed = value;
    sync();
    resetSeries("New seed. Series reset.");
  });
  fields.push(seed);
  grid.append(label("ROUND SEED", seed));

  for (const player of [0, 1] as const) {
    const group = node("div");
    group.className = "local-player-controls";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", `Player ${player + 1} controls`);
    const groupTitle = node("span", `PLAYER ${player + 1}`);
    groupTitle.className = "local-player-label";
    group.append(groupTitle);
    for (const [action, actionLabel] of raceActions(game.gameId)) {
      const key = node("input");
      key.type = "text";
      key.readOnly = true;
      key.value = settings.keys[player][action] ?? "";
      key.setAttribute("aria-label", `Player ${player + 1} ${actionLabel} key`);
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
        const error = raceBindingError(game.gameId, candidate);
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
            : action === "up" && actionLabel.endsWith("up")
              ? "↑"
              : action === "down" && actionLabel.endsWith("down")
                ? "↓"
                : actionLabel.toUpperCase();
      const button = node("button", buttonText);
      button.type = "button";
      button.className = "game-control";
      button.setAttribute("aria-label", `Player ${player + 1} ${actionLabel}`);
      button.addEventListener("pointerdown", (event) => {
        if (!acceptsInput()) return;
        event.preventDefault();
        focusGame();
        game.setControl(player, action, true, `button:${event.pointerId}`);
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          // Synthesized pointer events need no capture.
        }
      });
      const release = (event: PointerEvent): void =>
        game.setControl(player, action, false, `button:${event.pointerId}`);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      button.addEventListener("click", (event) => {
        if (event.detail !== 0 || !acceptsInput()) return;
        focusGame();
        game.setControl(player, action, true, "accessible");
        game.setControl(player, action, false, "accessible");
      });
      group.append(button);
    }
    controlRoot.append(group);
  }

  const rounds = node("select");
  rounds.setAttribute("aria-label", "Race series length");
  for (const item of [1, 3, 5] as const) {
    const option = node("option", `BEST OF ${item}`);
    option.value = String(item);
    rounds.append(option);
  }
  rounds.value = String(settings.bestOf);
  rounds.addEventListener("change", () => {
    const count = Number(rounds.value);
    if (count !== 1 && count !== 3 && count !== 5) return;
    settings.bestOf = count;
    sync();
    resetSeries("New series started.");
  });
  fields.push(rounds);
  grid.append(label("SERIES LENGTH", rounds));

  const reset = node("button", "RESET SERIES");
  reset.type = "button";
  reset.className = "game-control";
  reset.addEventListener("click", () => resetSeries("New series started."));
  fields.push(reset);
  const historyTitle = node("p", "RECENT LOCAL MATCHES");
  historyTitle.className = "micro-label";
  const details = node(
    "p",
    "Use the two touch-control rows, two gamepads, or the keys below. P pauses. The score handicap changes points only. Time uses game speed. Match records stay in this browser.",
  );
  details.className = "settings-note";
  root.append(title, note, details, grid, series, live, status, reset, historyTitle, history);
  sync();
  updateSeries();
  updateHistory();

  game.onProgress = (progress) => {
    if (!locked) setLocked(true);
    const side = (player: 0 | 1): string =>
      `${settings.names[player]} ${progress.scores[player]} (${progress.adjusted[player]} adjusted)${progress.ended[player] ? " OUT" : ""}`;
    live.textContent = `${side(0)} / ${side(1)} · ${progress.remaining} GAME SECONDS`;
  };
  game.onResult = (result) => {
    setLocked(false);
    const target = (settings.bestOf + 1) / 2;
    if (wins.some((value) => value >= target)) wins = [0, 0];
    if (result.winner) wins[result.winner - 1]!++;
    records = appendRaceRecord(storage, result, records);
    const winner = result.winner ? result.names[result.winner - 1]! : null;
    if (result.winner && wins[result.winner - 1]! >= target) {
      updateSeries(`${winner} wins the series. Start again for a new series.`);
      game.resetSeries();
    } else
      updateSeries(
        winner
          ? `${winner} wins the round. Start again for the next round.`
          : "Draw. Play another round.",
      );
    updateHistory();
  };

  return () => {
    game.onProgress = null;
    game.onResult = null;
    root.replaceChildren();
    root.hidden = true;
    controlRoot.replaceChildren();
    controlRoot.hidden = true;
  };
}
