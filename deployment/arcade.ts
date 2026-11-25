import { Engine, type EngineState } from "../src/engine/engine";
import type { GameAction } from "../src/engine/input";
import {
  availableModes,
  DEFAULT_GAME_ID,
  GAME_MANIFESTS,
  getManifest,
  loadGame,
} from "../src/games/manifest";
import type { GameManifest, GameMode } from "../src/games/types";
import type { PongLocalGame } from "../src/games/pong/pong.2p";
import type { SplitRaceGame } from "../src/twoplayer/split-race";
import { defaults, type InterludeSettings, type SettingValue } from "../src/settings/schema";
import { isAIDifficulty } from "../src/ai/difficulty";
import {
  AI_LEVELS,
  PONG_TARGETS,
  SPEED_CHOICES,
  readWebPreferences,
  saveWebPreferences,
} from "../src/web/preferences";
import { readWebScores, saveWebScore } from "../src/web/scores";

function element<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing arcade element: ${selector}`);
  return node;
}

const canvas = element<HTMLCanvasElement>("#game-canvas");
const stateLabel = element<HTMLElement>("#game-state");
const nameLabel = element<HTMLElement>("#game-name");
const numberLabel = element<HTMLElement>("#game-number");
const descriptionLabel = element<HTMLElement>("#game-description");
const hintLabel = element<HTMLElement>("#control-hint");
const scoreLabel = element<HTMLElement>("#game-high-score");
const gameList = element<HTMLElement>("#game-list");
const controls = element<HTMLElement>("#game-controls");
const playButton = element<HTMLButtonElement>("#play-button");
const resetButton = element<HTMLButtonElement>("#reset-button");
const soundButton = element<HTMLButtonElement>("#sound-button");
const focusIndicator = element<HTMLElement>("#game-focus");
const speedSelect = element<HTMLSelectElement>("#game-speed");
const pongSettings = element<HTMLElement>("#pong-settings");
const pongMode = element<HTMLSelectElement>("#pong-mode");
const pongAI = element<HTMLSelectElement>("#pong-ai");
const pongTarget = element<HTMLSelectElement>("#pong-target");
const pongAdaptive = element<HTMLInputElement>("#pong-adaptive");
const pongAIField = element<HTMLElement>("#pong-ai-field");
const pongAdaptiveField = element<HTMLElement>("#pong-adaptive-field");
const localPong = element<HTMLElement>("#local-pong");
const localControls = element<HTMLElement>("#local-pong-controls");
const raceModeField = element<HTMLElement>("#race-mode-field");
const raceMode = element<HTMLSelectElement>("#race-mode");
const localRace = element<HTMLElement>("#local-race");
const localRaceControls = element<HTMLElement>("#local-race-controls");

const controlSets: Record<string, ReadonlyArray<[string, GameAction, string]>> = {
  snake: [
    ["←", "left", "Steer left"],
    ["↑", "up", "Steer up"],
    ["↓", "down", "Steer down"],
    ["→", "right", "Steer right"],
  ],
  breakout: [
    ["←", "left", "Move left"],
    ["→", "right", "Move right"],
    ["LAUNCH", "primary", "Launch"],
  ],
  flappy: [["FLAP", "primary", "Flap"]],
  twenty48: [
    ["←", "left", "Slide left"],
    ["↑", "up", "Slide up"],
    ["↓", "down", "Slide down"],
    ["→", "right", "Slide right"],
    ["UNDO", "secondary", "Undo"],
  ],
  pong: [
    ["↑", "up", "Move up"],
    ["↓", "down", "Move down"],
  ],
  blockfall: [
    ["←", "left", "Move left"],
    ["→", "right", "Move right"],
    ["↓", "down", "Soft drop"],
    ["ROTATE", "up", "Rotate"],
    ["DROP", "primary", "Hard drop"],
    ["HOLD", "secondary", "Hold"],
  ],
  rockfall: [
    ["←", "left", "Turn left"],
    ["→", "right", "Turn right"],
    ["THRUST", "up", "Thrust"],
    ["FIRE", "primary", "Fire"],
  ],
  dashline: [["JUMP / HOLD", "primary", "Jump or hold to jump higher"]],
};

let storage: Storage | null = null;
try {
  storage = window.localStorage;
} catch {
  // Some browsers block storage entirely; the arcade remains playable.
}
const scores = readWebScores(storage);
const preferences = readWebPreferences(storage);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let settings: InterludeSettings = {
  ...defaults(),
  muted: true,
  skipBoot: true,
  reduceMotion,
  pongDifficulty: preferences.pongDifficulty,
  pongAdaptive: preferences.pongAdaptive,
  pongWatch: preferences.pongWatch,
  pongFirstTo: preferences.pongFirstTo,
};
for (const [game, speed] of Object.entries(preferences.speeds)) {
  settings[`game.${game}.speed`] = speed;
}
let selectedGame = DEFAULT_GAME_ID;
let pongModeId = preferences.pongWatch ? "watch" : "cpu";
let pongModes: readonly GameMode[] = getManifest("pong")!.modes;
const raceModeByGame: Record<string, string> = {};
let raceModes: readonly GameMode[] = [];
let removeLocalUI: (() => void) | null = null;
let requestNumber = 0;
let canvasVisible = true;
let loaded = false;

function setScene(state: EngineState): void {
  canvas.dataset.scene = state;
  stateLabel.textContent = {
    boot: "POWER ON",
    ready: "READY",
    playing: "PLAYING",
    paused: "PAUSED",
    gameover: "GAME OVER",
  }[state];
  playButton.textContent = {
    boot: "START GAME",
    ready: "START GAME",
    playing: "PAUSE",
    paused: "RESUME",
    gameover: "PLAY AGAIN",
  }[state];
}

// Preview mode keeps extension-specific writes out of the website. Its callback
// lets the site maintain separate, local-only browser scores.
const engine = new Engine(canvas, {
  settings,
  highScore: 0,
  preview: true,
  onStateChange: setScene,
  onHighScore(best) {
    saveWebScore(storage, scores, selectedGame, best);
    updateBest();
  },
});

function updateBest(): void {
  scoreLabel.textContent = String(scores[selectedGame] ?? 0).padStart(6, "0");
}
function focusGame(reveal = false): void {
  if (reveal) canvas.scrollIntoView({ block: "nearest", behavior: "auto" });
  canvas.focus({ preventScroll: true });
  engine.setFocused(true);
}
function updateVisibility(): void {
  engine.setTabHidden(document.hidden || !canvasVisible);
}

canvas.addEventListener("focus", () => {
  engine.setFocused(true);
  focusIndicator.hidden = false;
});
canvas.addEventListener("blur", () => {
  engine.setFocused(false);
  focusIndicator.hidden = true;
});
// Registered before Input so the first tap can focus and start the game.
canvas.addEventListener("pointerdown", () => focusGame());
canvas.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    playButton.focus({ preventScroll: true });
  } else if (event.code === "KeyP" && engine.getState() === "paused") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) {
      engine.sound.unlock();
      engine.resumeFromDone();
    }
  }
});
engine.attachInput(canvas);
document.addEventListener("visibilitychange", updateVisibility);
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries.find((item) => item.target === canvas);
      if (entry) {
        canvasVisible = entry.isIntersecting;
        updateVisibility();
      }
    },
    { threshold: 0.05 },
  );
  observer.observe(canvas);
}

function makeControls(manifest: GameManifest, splitRace = false): void {
  controls.replaceChildren();
  controls.setAttribute("aria-label", `${manifest.name} on-screen controls`);
  controls.hidden = splitRace;
  if (splitRace || (manifest.id === "pong" && settings.pongWatch)) return;
  for (const [label, action, description] of controlSets[manifest.id] ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "game-control";
    button.textContent = label;
    button.dataset.action = action;
    button.setAttribute("aria-label", description);
    button.addEventListener("pointerdown", (event) => {
      if (!loaded || engine.getState() === "paused") return;
      event.preventDefault();
      focusGame(true);
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // A detached button or synthesized event need not capture a pointer.
      }
      engine.input.virtualDown(action, `button:${event.pointerId}`);
    });
    const release = (event: PointerEvent): void =>
      engine.input.virtualUp(action, `button:${event.pointerId}`);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("click", (event) => {
      // Keyboard/screen-reader activation has no pointerdown.
      if (event.detail !== 0 || !loaded || engine.getState() === "paused") return;
      focusGame(true);
      engine.input.virtualDown(action, "accessible");
      engine.input.virtualUp(action, "accessible");
    });
    controls.append(button);
  }
}

function selectButtons(id: string): void {
  for (const button of gameList.querySelectorAll<HTMLButtonElement>("button[data-game]")) {
    button.setAttribute("aria-pressed", String(button.dataset.game === id));
  }
}

async function chooseGame(id: string, reveal = false): Promise<void> {
  const manifest = getManifest(id);
  if (!manifest) return;
  const sequence = ++requestNumber;
  loaded = false;
  removeLocalUI?.();
  removeLocalUI = null;
  engine.stop();
  playButton.disabled = true;
  resetButton.disabled = true;
  raceMode.disabled = true;
  pongMode.disabled = true;
  canvas.dataset.scene = "loading";
  stateLabel.textContent = "LOADING";
  selectButtons(id);
  try {
    const mode = id === "pong" ? pongModeId : (raceModeByGame[id] ?? "solo");
    const local = id === "pong" && mode === "local";
    const splitRace = id !== "pong" && mode === "local";
    const localUI =
      __PLATFORM__ === "web" && local ? import("../src/twoplayer/pong-ui") : Promise.resolve(null);
    const raceUI =
      __PLATFORM__ === "web" && splitRace
        ? import("../src/twoplayer/race-ui")
        : Promise.resolve(null);
    const [game, modes, localModule, raceModule] = await Promise.all([
      loadGame(id, mode),
      availableModes(id),
      localUI,
      raceUI,
    ]);
    if (sequence !== requestNumber) return;
    if (!modes.length || (mode && !modes.some((item) => item.id === mode)))
      throw new Error("No mode available");
    selectedGame = id;
    const index = GAME_MANIFESTS.findIndex((entry) => entry.id === id);
    numberLabel.textContent = `GAME ${String(index + 1).padStart(2, "0")} / ${String(GAME_MANIFESTS.length).padStart(2, "0")}`;
    nameLabel.textContent = manifest.name;
    descriptionLabel.textContent = manifest.description;
    hintLabel.textContent = local
      ? "LOCAL MATCH · SET KEYS BELOW · P PAUSES"
      : splitRace
        ? "SPLIT SCREEN · TWO SETS OF CONTROLS · P PAUSES"
        : id === "pong" && settings.pongWatch
          ? "WATCH CPU · P PAUSES · ESC RELEASES FOCUS"
          : `${manifest.controls} · P PAUSES`;
    pongSettings.hidden = id !== "pong";
    raceModeField.hidden = id === "pong" || !modes.some((choice) => choice.players === 2);
    if (id !== "pong") {
      raceModes = modes;
      raceMode.replaceChildren();
      for (const choice of modes) addOption(raceMode, choice.id, choice.label);
      raceMode.value = mode;
    }
    pongAIField.hidden = local;
    pongAdaptiveField.hidden = local;
    if (id === "pong") {
      pongModes = modes;
      pongMode.replaceChildren();
      for (const choice of modes) addOption(pongMode, choice.id, choice.label);
      pongMode.value = pongModeId;
    }
    speedSelect.value = String(preferences.speeds[id] ?? 100);
    canvas.dataset.game = id;
    canvas.setAttribute(
      "aria-label",
      `${manifest.name}${splitRace ? " two-player split screen" : " game screen"}`,
    );
    updateBest();
    makeControls(manifest, splitRace);
    engine.setGame(game, scores[id] ?? 0);
    engine.start();
    if (local && localModule) {
      removeLocalUI = localModule.mountLocalPong({
        root: localPong,
        controlRoot: localControls,
        game: game as PongLocalGame,
        storage,
        focusGame: () => focusGame(true),
        acceptsInput: () => loaded && engine.getState() !== "paused",
      });
    } else if (splitRace && raceModule) {
      removeLocalUI = raceModule.mountLocalRace({
        root: localRace,
        controlRoot: localRaceControls,
        game: game as SplitRaceGame,
        storage,
        focusGame: () => focusGame(false),
        acceptsInput: () => loaded && engine.getState() !== "paused",
      });
    }
    updateVisibility();
    loaded = true;
    playButton.disabled = false;
    resetButton.disabled = false;
    raceMode.disabled = false;
    pongMode.disabled = false;
    // On narrow screens the picker sits below the screen. Bring the selected
    // cabinet back into view so touch controls never start an unseen game.
    if (reveal && window.matchMedia("(max-width: 740px)").matches) {
      canvas.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  } catch {
    if (sequence !== requestNumber) return;
    canvas.dataset.scene = "error";
    stateLabel.textContent = "LOAD ERROR";
    descriptionLabel.textContent = "Could not load this game. Check your connection and reload.";
  }
}

function buildGameList(): void {
  gameList.replaceChildren();
  for (const [index, manifest] of GAME_MANIFESTS.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "game-option";
    button.dataset.game = manifest.id;
    button.setAttribute("aria-label", `Select ${manifest.name}`);
    button.setAttribute("aria-pressed", "false");
    const number = document.createElement("span");
    number.className = "game-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.className = "game-label";
    name.textContent = manifest.name;
    button.append(number, name);
    button.addEventListener("click", () => void chooseGame(manifest.id, true));
    gameList.append(button);
  }
}

function addOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}
function changeSettings(patch: Record<string, SettingValue>): void {
  settings = { ...settings, ...patch };
  engine.setSettings(settings);
}
for (const speed of SPEED_CHOICES) addOption(speedSelect, String(speed), `${speed}%`);
for (const mode of getManifest("pong")!.modes) addOption(pongMode, mode.id, mode.label);
for (const level of AI_LEVELS) addOption(pongAI, level, level.toUpperCase());
for (const target of PONG_TARGETS) addOption(pongTarget, String(target), String(target));
pongMode.value = preferences.pongWatch ? "watch" : "cpu";
pongAI.value = preferences.pongDifficulty;
pongTarget.value = String(preferences.pongFirstTo);
pongAdaptive.checked = preferences.pongAdaptive;

speedSelect.addEventListener("change", () => {
  const speed = Number(speedSelect.value);
  if (!SPEED_CHOICES.some((item) => item === speed)) return;
  preferences.speeds[selectedGame] = speed;
  changeSettings({ [`game.${selectedGame}.speed`]: speed });
  saveWebPreferences(storage, preferences);
});
raceMode.addEventListener("change", () => {
  if (!raceModes.some((mode) => mode.id === raceMode.value)) return;
  raceModeByGame[selectedGame] = raceMode.value;
  void chooseGame(selectedGame);
});
pongMode.addEventListener("change", () => {
  if (!pongModes.some((mode) => mode.id === pongMode.value)) return;
  pongModeId = pongMode.value;
  preferences.pongWatch = pongModeId === "watch";
  changeSettings({ pongWatch: preferences.pongWatch });
  saveWebPreferences(storage, preferences);
  void chooseGame("pong");
});
pongAI.addEventListener("change", () => {
  if (!isAIDifficulty(pongAI.value)) return;
  preferences.pongDifficulty = pongAI.value;
  changeSettings({ pongDifficulty: preferences.pongDifficulty });
  saveWebPreferences(storage, preferences);
});
pongAdaptive.addEventListener("change", () => {
  preferences.pongAdaptive = pongAdaptive.checked;
  changeSettings({ pongAdaptive: preferences.pongAdaptive });
  saveWebPreferences(storage, preferences);
});
pongTarget.addEventListener("change", () => {
  const target = Number(pongTarget.value);
  if (!PONG_TARGETS.some((item) => item === target)) return;
  preferences.pongFirstTo = target;
  changeSettings({ pongFirstTo: target });
  saveWebPreferences(storage, preferences);
  void chooseGame("pong");
});

playButton.addEventListener("click", () => {
  if (!loaded) return;
  const state = engine.getState();
  if (state === "playing") {
    engine.pauseByUser();
  } else if (state === "paused") {
    focusGame(true);
    engine.sound.unlock();
    engine.resumeFromDone();
  } else {
    focusGame(true);
    engine.input.virtualDown("confirm", "start");
    engine.input.virtualUp("confirm", "start");
  }
});
resetButton.addEventListener("click", () => void chooseGame(selectedGame));
soundButton.addEventListener("click", () => {
  changeSettings({ muted: !settings.muted });
  if (!settings.muted) engine.sound.unlock();
  soundButton.textContent = settings.muted ? "SOUND OFF" : "SOUND ON";
  soundButton.setAttribute("aria-pressed", String(!settings.muted));
  soundButton.setAttribute("aria-label", settings.muted ? "Turn sound on" : "Turn sound off");
});

buildGameList();
void chooseGame(DEFAULT_GAME_ID);
