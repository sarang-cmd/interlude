import { GAME_MANIFESTS } from "../games/manifest";
import { loadSettings, saveSettings, type InterludeSettings } from "../shared/storage";

const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
const select = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;
const output = document.getElementById("delayReadout") as HTMLOutputElement;
const state = document.getElementById("saveState") as HTMLElement;
const chooser = select("game");
for (const [value, label] of [["last", "Last played"], ["random", "Random"], ...GAME_MANIFESTS.map((game) => [game.id, game.name])]) {
  const option = document.createElement("option"); option.value = value!; option.textContent = label!; chooser.append(option);
}
const booleans = ["enabled", "skipBoot", "muted", "autoClose", "snakeWrap", "blockfallGhost", "blockfallHold", "streamHookEnabled"] as const;
const selectFields = ["placement", "game", "pongDifficulty"] as const;
let settings = await loadSettings();
function render(): void {
  for (const key of booleans) input(key).checked = settings[key];
  for (const key of selectFields) select(key).value = settings[key];
  input("delayMs").value = String(settings.delayMs); output.value = `${settings.delayMs} MS`;
  input("focusHotkey").value = settings.focusHotkey;
  input("graceSeconds").value = String(settings.autoCloseGraceMs / 1000);
  input("undo2048").value = String(settings.undo2048);
  input("pongFirstTo").value = String(settings.pongFirstTo);
  input("graceSeconds").disabled = !settings.autoClose;
}
async function update(patch: Partial<InterludeSettings>): Promise<void> {
  settings = { ...settings, ...patch }; render();
  try { await saveSettings(patch); state.textContent = "SAVED / LOCAL"; }
  catch { state.textContent = "SAVE FAILED"; }
}
for (const key of booleans) input(key).addEventListener("change", () => { void update({ [key]: input(key).checked }); });
for (const key of selectFields) select(key).addEventListener("change", () => { void update({ [key]: select(key).value } as Partial<InterludeSettings>); });
input("delayMs").addEventListener("input", () => { output.value = `${input("delayMs").value} MS`; });
input("delayMs").addEventListener("change", () => { void update({ delayMs: Math.max(0, Math.min(5000, Number(input("delayMs").value))) }); });
for (const [id, min, max, key, multiplier] of [["graceSeconds", 0, 120, "autoCloseGraceMs", 1000], ["undo2048", 0, 20, "undo2048", 1], ["pongFirstTo", 1, 11, "pongFirstTo", 1]] as const) {
  input(id).addEventListener("change", () => {
    const value = Number(input(id).value);
    if (!Number.isFinite(value)) { render(); return; }
    void update({ [key]: Math.max(min, Math.min(max, Math.round(value))) * multiplier });
  });
}
input("focusHotkey").addEventListener("keydown", (event) => {
  event.preventDefault();
  const key = event.key.toUpperCase();
  if (!/^[A-Z0-9]$/.test(key) || !(event.altKey || event.ctrlKey || event.metaKey)) { state.textContent = "USE ALT, CTRL OR META + A KEY"; return; }
  const parts = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta", key].filter(Boolean);
  void update({ focusHotkey: parts.join("+") });
});
document.getElementById("settings")?.addEventListener("submit", (event) => event.preventDefault());
render();
