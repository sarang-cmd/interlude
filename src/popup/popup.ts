import { loadPauseUntil, PAUSE_KEY, setPauseUntil, tomorrow } from "../shared/pause";

const home = document.getElementById("home") as HTMLElement;
const arcade = document.getElementById("arcade") as HTMLElement;
const open = document.getElementById("open-arcade") as HTMLButtonElement;
const back = document.getElementById("back") as HTMLButtonElement;
const hour = document.getElementById("hour") as HTMLButtonElement;
const tomorrowButton = document.getElementById("tomorrow") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLElement;
const gate = document.getElementById("gate") as HTMLElement;
const gateTitle = document.getElementById("gate-title") as HTMLElement;
const gateDetail = document.getElementById("gate-detail") as HTMLElement;
const gameState = document.getElementById("game-state") as HTMLElement;

let until = 0;
let pauseAvailable = true;
let savingPause = false;
let pauseRevision = 0;
let opening = false;
let openingVersion = 0;
let disposeArcade: (() => void) | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;

function render(): void {
  if (expiry !== undefined) clearTimeout(expiry);
  expiry = undefined;
  const paused = until > Date.now();
  hour.textContent = paused ? "RESUME NOW" : "PAUSE FOR 1 HOUR";
  hour.disabled = savingPause;
  tomorrowButton.disabled = savingPause;
  open.disabled = paused || opening || savingPause || !pauseAvailable;
  status.textContent = !pauseAvailable
    ? "PAUSE STATUS UNAVAILABLE · CHECK EXTENSION STORAGE"
    : paused
      ? `PAUSED UNTIL ${new Date(until).toLocaleString()}`
      : "CABINETS READY";
  if (paused) {
    // Refresh the button even if the stored timestamp expires while the popup is open.
    expiry = setTimeout(render, Math.min(2_147_483_647, until - Date.now() + 50));
  }
}

async function changePause(timestamp: number): Promise<void> {
  if (savingPause) return;
  savingPause = true;
  const revision = pauseRevision;
  render();
  try {
    await setPauseUntil(timestamp);
    // A newer storage event from another window wins over this write's reply.
    if (revision === pauseRevision) until = timestamp;
    pauseAvailable = true;
  } catch {
    // Do not promise that games are paused (or resumed) when storage failed.
    pauseAvailable = false;
  } finally {
    savingPause = false;
    render();
  }
}

hour.addEventListener(
  "click",
  () => void changePause(until > Date.now() ? 0 : Date.now() + 3600000),
);
tomorrowButton.addEventListener("click", () => void changePause(tomorrow(Date.now())));

open.addEventListener("click", () => {
  if (opening || savingPause || until > Date.now() || !pauseAvailable) return;
  opening = true;
  const version = ++openingVersion;
  home.hidden = true;
  arcade.hidden = false;
  back.focus({ preventScroll: true });
  gate.hidden = true;
  gameState.textContent = "LOADING";
  render();
  // Neither the engine nor a game chunk loads until the user opens the cabinet.
  void import("./arcade")
    .then(({ mountPopupArcade }) => {
      if (version !== openingVersion) return;
      disposeArcade = mountPopupArcade(arcade);
      opening = false;
      render();
    })
    .catch(() => {
      if (version !== openingVersion) return;
      opening = false;
      gateTitle.textContent = "CABINET UNAVAILABLE";
      gateDetail.textContent = "Go back and try again.";
      gate.hidden = false;
      gameState.textContent = "LOAD ERROR";
      render();
    });
});
back.addEventListener("click", () => {
  openingVersion++;
  opening = false;
  disposeArcade?.();
  disposeArcade = undefined;
  arcade.hidden = true;
  home.hidden = false;
  render();
  (open.disabled ? hour : open).focus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[PAUSE_KEY]) {
    pauseRevision++;
    const value: unknown = changes[PAUSE_KEY].newValue;
    until = typeof value === "number" && Number.isFinite(value) ? value : 0;
    pauseAvailable = true;
    render();
  }
});
window.addEventListener(
  "pagehide",
  () => {
    openingVersion++;
    if (expiry !== undefined) clearTimeout(expiry);
    disposeArcade?.();
    disposeArcade = undefined;
  },
  { once: true },
);

const initialPauseRevision = pauseRevision;
try {
  const initial = await loadPauseUntil();
  if (initialPauseRevision === pauseRevision) until = initial;
} catch {
  if (initialPauseRevision === pauseRevision) pauseAvailable = false;
}
render();
