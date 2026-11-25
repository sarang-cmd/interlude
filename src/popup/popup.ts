import { loadPauseUntil, PAUSE_KEY, setPauseUntil, tomorrow } from "../shared/pause";
const hour = document.getElementById("hour") as HTMLButtonElement;
const tomorrowButton = document.getElementById("tomorrow") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLElement;
let until = await loadPauseUntil();
function render(): void {
  const paused = until > Date.now();
  hour.textContent = paused ? "RESUME NOW" : "PAUSE FOR 1 HOUR";
  status.textContent = paused
    ? `PAUSED UNTIL ${new Date(until).toLocaleString()}`
    : "CABINETS READY";
}
hour.addEventListener("click", () => {
  until = until > Date.now() ? 0 : Date.now() + 3600000;
  render();
  void setPauseUntil(until);
});
tomorrowButton.addEventListener("click", () => {
  until = tomorrow(Date.now());
  render();
  void setPauseUntil(until);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[PAUSE_KEY]) {
    until = Number(changes[PAUSE_KEY].newValue ?? 0);
    render();
  }
});
render();
