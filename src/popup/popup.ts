import { loadSettings, saveSettings } from "../shared/storage";
const toggle = document.getElementById("enabled") as HTMLInputElement;
const label = document.getElementById("powerLabel") as HTMLElement;
const placement = document.getElementById("placement") as HTMLElement;
const delay = document.getElementById("delay") as HTMLElement;
const site = document.getElementById("site") as HTMLElement;
const settings = await loadSettings();
toggle.checked = settings.enabled;
label.textContent = settings.enabled ? "Ready for Claude" : "Page integration off";
placement.textContent = ({ inline: "INLINE", overlay: "OVERLAY", "docked-composer": "COMPOSER", "side-panel": "SIDE" })[settings.placement];
delay.textContent = `${settings.delayMs} MS`;
const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
try { site.textContent = new URL(tabs[0]?.url ?? "").hostname === "claude.ai" ? "CLAUDE" : "OTHER"; } catch { site.textContent = "OTHER"; }
toggle.addEventListener("change", () => { label.textContent = toggle.checked ? "Ready for Claude" : "Page integration off"; void saveSettings({ enabled: toggle.checked }); });
