import { Engine, type EngineState } from "../src/engine/engine";
import type { GameAction } from "../src/engine/input";
import { DEFAULT_GAME_ID, GAME_MANIFESTS, getManifest, loadGame } from "../src/games/manifest";
import type { GameManifest } from "../src/games/types";
import { defaults } from "../src/settings/schema";
import { readWebScores, saveWebScore } from "../src/web/scores";

function element<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing arcade element: ${selector}`);
  return node;
}

const canvas = element<HTMLCanvasElement>("#game-canvas");
const machineElement = element<HTMLElement>(".machine");
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
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const settings = { ...defaults(), muted: true, skipBoot: true, reduceMotion };
let selectedGame = DEFAULT_GAME_ID;
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
  if (reveal) machineElement.scrollIntoView({ block: "nearest", behavior: "auto" });
  canvas.focus({ preventScroll: true });
  engine.setFocused(true);
}
function updateVisibility(): void {
  engine.setTabHidden(document.hidden || !canvasVisible);
}

canvas.addEventListener("focus", () => engine.setFocused(true));
canvas.addEventListener("blur", () => engine.setFocused(false));
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

function makeControls(manifest: GameManifest): void {
  controls.replaceChildren();
  controls.setAttribute("aria-label", `${manifest.name} on-screen controls`);
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
  engine.stop();
  playButton.disabled = true;
  resetButton.disabled = true;
  canvas.dataset.scene = "loading";
  stateLabel.textContent = "LOADING";
  selectButtons(id);
  try {
    const game = await loadGame(id);
    if (sequence !== requestNumber) return;
    selectedGame = id;
    const index = GAME_MANIFESTS.findIndex((entry) => entry.id === id);
    numberLabel.textContent = `GAME ${String(index + 1).padStart(2, "0")} / 08`;
    nameLabel.textContent = manifest.name;
    descriptionLabel.textContent = manifest.description;
    hintLabel.textContent = `${manifest.controls} · P PAUSES`;
    canvas.dataset.game = id;
    canvas.setAttribute("aria-label", `${manifest.name} game screen`);
    updateBest();
    makeControls(manifest);
    engine.setGame(game, scores[id] ?? 0);
    engine.start();
    updateVisibility();
    loaded = true;
    playButton.disabled = false;
    resetButton.disabled = false;
    // On narrow screens the picker sits below the screen. Bring the selected
    // cabinet back into view so touch controls never start an unseen game.
    if (reveal && window.matchMedia("(max-width: 740px)").matches) {
      machineElement.scrollIntoView({ block: "nearest", behavior: "auto" });
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
  settings.muted = !settings.muted;
  engine.setSettings(settings);
  if (!settings.muted) engine.sound.unlock();
  soundButton.textContent = settings.muted ? "SOUND OFF" : "SOUND ON";
  soundButton.setAttribute("aria-pressed", String(!settings.muted));
  soundButton.setAttribute("aria-label", settings.muted ? "Turn sound on" : "Turn sound off");
});

buildGameList();
void chooseGame(DEFAULT_GAME_ID);
