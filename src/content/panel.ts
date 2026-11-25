import { Engine, type EngineState } from "../engine/engine";
import type { GameAction } from "../engine/input";
import type { ArcadeGame } from "../games/types";
import { GAME_MANIFESTS } from "../games/manifest";
import type { MountPointResult, Placement } from "../adapters/types";
import type { InterludeSettings } from "../shared/storage";

const fontUrl = (name: string): string => chrome.runtime.getURL(`fonts/${name}.woff2`);
const CSS = `
@font-face{font-family:Silkscreen;src:url('${fontUrl("silkscreen-400")}') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:Silkscreen;src:url('${fontUrl("silkscreen-700")}') format('woff2');font-weight:700;font-display:swap}
@font-face{font-family:VT323;src:url('${fontUrl("vt323")}') format('woff2');font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('${fontUrl("ibm-plex-mono-400")}') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('${fontUrl("ibm-plex-mono-600")}') format('woff2');font-weight:600;font-display:swap}
:host{all:initial;box-sizing:border-box;color:#DDC796;font-family:'IBM Plex Mono',monospace;contain:style}
*,*::before,*::after{box-sizing:border-box} button,select{font:inherit;border-radius:0}
.machine{font-family:'IBM Plex Mono',monospace;background:#0E0B07;color:#DDC796;border:2px solid #7A5600;box-shadow:4px 4px 0 #000;overflow:hidden;width:100%}
.top{display:flex;align-items:center;gap:10px;min-height:42px;padding:7px 10px;border-bottom:1px solid #7A5600;background:#171209}
.brand{display:flex;align-items:center;gap:8px;flex:1;min-width:0;color:#FFB000;font:700 12px Silkscreen,monospace;letter-spacing:.04em}
.mark{display:inline-block;flex:none;width:4px;height:14px;margin-right:10px;background:#FFB000;box-shadow:5px 0 0 #FFB000,10px 0 0 #FFB000;image-rendering:pixelated}
.tag{font:400 9px 'IBM Plex Mono',monospace;color:#A88A4D;white-space:nowrap;letter-spacing:.06em}
select{appearance:none;color:#FFD36B;background:#0E0B07;border:1px solid #7A5600;padding:6px 24px 6px 8px;max-width:175px;min-width:112px;font-size:10px;font-weight:600;letter-spacing:.03em;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23FFB000' d='M0 0h10L5 6z'/%3E%3C/svg%3E");background-position:right 8px center;background-size:10px 6px;background-repeat:no-repeat}
select:focus-visible,button:focus-visible,canvas:focus-visible{outline:2px solid #FFD36B;outline-offset:-2px}
button{border:1px solid #7A5600;background:#171209;color:#FFD36B;cursor:pointer;font-size:10px;letter-spacing:.04em}
button:hover{background:#2A2114;border-color:#FFB000}button:active{transform:translate(1px,1px)}
.close{width:27px;height:27px;font-size:16px;line-height:1;color:#DDC796;flex:none}
.meta{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 10px;color:#C2A86B;font-size:9px;line-height:1.3;letter-spacing:.07em;text-transform:uppercase}
.state{color:#5FBF6A}.state::before{content:'■';margin-right:6px;font-size:8px}
.screen{position:relative;background:#0E0B07;text-align:center;line-height:0;border-top:1px solid #382C15;border-bottom:1px solid #382C15}
canvas{display:block;width:100%;max-width:640px;height:auto;margin:0 auto;image-rendering:pixelated;touch-action:none;cursor:crosshair;outline:none}
.done{position:absolute;left:0;right:0;bottom:14%;display:flex;align-items:center;justify-content:center;gap:8px;line-height:normal}
.done[hidden]{display:none}.done button{padding:9px 17px;font-weight:600;min-width:82px}.done .resume{background:#FFB000;color:#0E0B07;border-color:#FFB000}
.controls{display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:7px 10px 8px;min-height:38px}
.controls .caption{color:#A88A4D;font-size:9px;letter-spacing:.06em;margin-right:auto;white-space:nowrap}
.controls button{padding:7px 9px;min-width:33px;min-height:30px;touch-action:none;user-select:none;font-weight:600}
.foot{display:flex;justify-content:space-between;gap:6px;border-top:1px solid #382C15;padding:6px 10px;color:#A88A4D;font-size:9px;line-height:1.4;letter-spacing:.03em}
.foot span{min-width:0}.foot .keys{text-align:right}
@media(max-width:450px){.tag{display:none}.top{gap:6px}.brand{font-size:10px}select{min-width:92px;max-width:135px}.controls .caption{width:100%}.foot{font-size:8px}}
`;

const CONTROL_SETS: Record<string, Array<[string, GameAction]>> = {
  snake: [["←", "left"], ["↑", "up"], ["↓", "down"], ["→", "right"]],
  breakout: [["←", "left"], ["→", "right"], ["LAUNCH", "primary"]],
  flappy: [["FLAP", "primary"]],
  twenty48: [["←", "left"], ["↑", "up"], ["↓", "down"], ["→", "right"], ["UNDO", "secondary"]],
  pong: [["↑", "up"], ["↓", "down"]],
  blockfall: [["←", "left"], ["→", "right"], ["↓", "down"], ["ROTATE", "up"], ["DROP", "primary"], ["HOLD", "secondary"]],
  rockfall: [["←", "left"], ["→", "right"], ["THRUST", "up"], ["FIRE", "primary"]],
  dashline: [["JUMP / HOLD", "primary"]],
};

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", label?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (label !== undefined) element.textContent = label;
  return element;
}

export interface PanelEvents {
  onChoose(choice: string): void;
  onClose(): void;
  onResume(): void;
  onEscape(): void;
  onFirstFrame(): void;
  onMove(x: number, y: number): void;
}

/** Closed shadow root: the host never exposes or styles the page's contents. */
export class Panel {
  readonly host = document.createElement("div");
  readonly engine: Engine;
  private readonly shadow: ShadowRoot;
  private readonly machine = node("section", "machine");
  private readonly top = node("header", "top");
  private readonly stateLabel = node("span", "state", "READY");
  private readonly cabinet = node("span", "", "CABINET 01");
  private readonly picker = node("select");
  private readonly canvas = node("canvas");
  private readonly done = node("div", "done");
  private readonly controls = node("div", "controls");
  private readonly hint = node("span", "", "ALT+G FOCUS · ESC RELEASE");
  private readonly screen = node("div", "screen");
  private visible = false;
  private placement: Placement = "inline";
  private position: { x: number; y: number } | null = null;
  private collapseHandler: ((event: TransitionEvent) => void) | null = null;
  private onScene: ((state: EngineState) => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastScreenWidth = 0;

  constructor(settings: InterludeSettings, private readonly siteName: string, private readonly events: PanelEvents) {
    this.host.dataset.interlude = "panel";
    this.host.dataset.interludeVisible = "false";
    this.host.setAttribute("aria-label", "Interlude arcade");
    this.shadow = this.host.attachShadow({ mode: "closed" });
    const style = node("style"); style.textContent = CSS; this.shadow.append(style);
    this.machine.setAttribute("aria-label", "Interlude arcade panel");
    const brand = node("div", "brand");
    brand.append(node("span", "mark"), node("span", "", "INTERLUDE"), node("span", "tag", "— ARCADE / 01"));
    this.picker.setAttribute("aria-label", "Choose game");
    for (const [value, name] of [["last", "LAST PLAYED"], ["random", "RANDOM"], ...GAME_MANIFESTS.map((game) => [game.id, game.name])]) {
      const option = node("option", "", name); option.value = value as string; this.picker.append(option);
    }
    this.picker.value = settings.game;
    this.picker.addEventListener("change", () => this.events.onChoose(this.picker.value));
    const close = node("button", "close", "×"); close.type = "button"; close.setAttribute("aria-label", "Close Interlude"); close.addEventListener("click", () => this.events.onClose());
    this.top.append(brand, this.picker, close);
    const meta = node("div", "meta"); meta.append(this.cabinet, this.stateLabel);
    this.canvas.tabIndex = 0; this.canvas.setAttribute("aria-label", "Game screen. Click to focus. Escape returns to the composer."); this.canvas.setAttribute("role", "application");
    this.screen.append(this.canvas, this.done);
    this.done.hidden = true;
    const resume = node("button", "resume", "RESUME"); resume.type = "button"; resume.addEventListener("click", () => this.events.onResume());
    const doneClose = node("button", "", "CLOSE"); doneClose.type = "button"; doneClose.addEventListener("click", () => this.events.onClose());
    this.done.append(resume, doneClose);
    const foot = node("footer", "foot"); foot.append(this.hint, node("span", "keys", "NO CHAT CONTENT READ"));
    this.machine.append(this.top, meta, this.screen, this.controls, foot);
    this.shadow.append(this.machine);
    this.engine = new Engine(this.canvas, {
      settings, highScore: 0, doneLabel: `${siteName.toUpperCase()} IS DONE`, onFirstFrame: () => this.events.onFirstFrame(),
      onStateChange: (state) => this.sceneChanged(state),
    });
    // Register before Input: pointerdown puts focus on the canvas in the same event.
    this.canvas.addEventListener("pointerdown", () => this.focus());
    this.canvas.addEventListener("focus", () => this.engine.setFocused(true));
    this.canvas.addEventListener("blur", () => this.engine.setFocused(false));
    this.canvas.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.events.onEscape(); }
      else if (event.code === "KeyP" && this.engine.getState() === "paused") {
        event.preventDefault();
        // Input also listens on the canvas. Do not enqueue the same P as a new
        // pause after resuming, and do not resume on keyboard auto-repeat.
        event.stopImmediatePropagation();
        if (!event.repeat) this.events.onResume();
      }
    });
    this.engine.attachInput(this.canvas);
    this.top.addEventListener("pointerdown", this.startDrag);
    this.host.addEventListener("transitionend", (event) => {
      if (event.target === this.host && event.propertyName === "height" && this.visible) {
        this.prop("transition", "none"); this.prop("height", "auto");
      }
    });
    this.hideImmediately();
    document.body.append(this.host);
  }

  setSceneListener(fn: (state: EngineState) => void): void { this.onScene = fn; }
  private sceneChanged(state: EngineState): void {
    this.host.dataset.interludeScene = state;
    this.stateLabel.textContent = ({ boot: "POWER ON", ready: "READY", playing: "PLAYER 1", paused: "PAUSED", gameover: "GAME OVER" })[state];
    this.onScene?.(state);
  }
  setGame(game: ArcadeGame, best: number, bindings: Record<string, string>): void {
    const index = GAME_MANIFESTS.findIndex((entry) => entry.id === game.manifest.id);
    this.cabinet.textContent = `${String(index + 1).padStart(2, "0")} / ${game.manifest.name}`;
    this.controls.replaceChildren();
    this.controls.append(node("span", "caption", "PLAYER CONTROLS"));
    for (const [label, action] of CONTROL_SETS[game.manifest.id] ?? []) {
      const button = node("button", "", label); button.type = "button";
      button.setAttribute("aria-label", `${game.manifest.name}: ${label}`);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault(); this.focus();
        try { button.setPointerCapture(event.pointerId); } catch { /* detached */ }
        this.engine.input.virtualDown(action, `button:${event.pointerId}`);
      });
      const release = (event: PointerEvent): void => this.engine.input.virtualUp(action, `button:${event.pointerId}`);
      button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release);
      button.addEventListener("click", (event) => {
        if (event.detail !== 0) return;
        this.focus(); this.engine.input.virtualDown(action, "accessible"); this.engine.input.virtualUp(action, "accessible");
      });
      this.controls.append(button);
    }
    this.engine.input.setKeymapOverrides(bindings);
    this.engine.setGame(game, best);
    this.host.dataset.interludeGame = game.manifest.id;
  }
  updateSettings(settings: InterludeSettings): void {
    this.picker.value = settings.game;
    this.hint.textContent = `${settings.focusHotkey.toUpperCase()} FOCUS · ESC RELEASE`;
    this.engine.setSettings(settings);
  }
  get isVisible(): boolean { return this.visible; }
  setPosition(position: { x: number; y: number } | null): void { this.position = position; }
  setDone(done: boolean, completed = true): void { this.done.hidden = !done; if (done) this.stateLabel.textContent = completed ? `${this.siteName.toUpperCase()} IS DONE` : "PAUSED"; }
  focus(): void { if (!this.visible) return; this.canvas.focus({ preventScroll: true }); this.engine.setFocused(true); }
  blur(): void { this.canvas.blur(); this.engine.setFocused(false); }

  private prop(name: string, value: string): void { this.host.style.setProperty(name, value, "important"); }
  private hideImmediately(): void {
    this.prop("all", "initial"); this.prop("display", "none"); this.prop("position", "fixed"); this.prop("left", "-10000px"); this.prop("top", "-10000px");
    this.host.dataset.interludeVisible = "false"; this.visible = false;
  }
  private setHostPosition(point: MountPointResult, placement: Placement): void {
    this.placement = placement;
    this.prop("all", "initial"); this.prop("box-sizing", "border-box"); this.prop("display", "block");
    this.prop("visibility", "visible"); this.prop("margin", "0"); this.prop("padding", "0");
    this.prop("overflow", "hidden"); this.prop("max-width", "none"); this.prop("z-index", placement === "overlay" || placement === "side-panel" ? "2147483000" : "auto");
    if (placement === "overlay") {
      this.prop("position", "fixed"); this.prop("width", "min(440px, calc(100vw - 24px))");
      const x = Math.max(0, Math.min(window.innerWidth - 100, this.position?.x ?? window.innerWidth - 452));
      const y = Math.max(0, Math.min(window.innerHeight - 50, this.position?.y ?? window.innerHeight - 390));
      this.prop("left", `${x}px`); this.prop("top", `${y}px`); this.prop("right", "auto"); this.prop("bottom", "auto");
    } else if (placement === "side-panel") {
      this.prop("position", "fixed"); this.prop("width", "min(440px, calc(100vw - 24px))"); this.prop("right", "0"); this.prop("top", "12px"); this.prop("left", "auto");
    } else {
      this.prop("position", "relative"); this.prop("width", "100%"); this.prop("left", "auto"); this.prop("top", "auto"); this.prop("right", "auto");
    }
    if (point.position === "after") point.anchor.insertAdjacentElement("afterend", this.host);
    else if (point.position === "before") point.anchor.insertAdjacentElement("beforebegin", this.host);
    else point.anchor.append(this.host);
  }
  correctlyMounted(point: MountPointResult): boolean {
    if (!this.host.isConnected) return false;
    if (point.position === "after") return point.anchor.nextElementSibling === this.host;
    if (point.position === "before") return point.anchor.previousElementSibling === this.host;
    return this.host.parentElement === point.anchor;
  }
  /** Runs inside the reveal rAF; the canvas paints synchronously. */
  show(point: MountPointResult, placement: Placement, skipMotion: boolean): void {
    if (this.collapseHandler) this.host.removeEventListener("transitionend", this.collapseHandler);
    this.collapseHandler = null;
    this.setHostPosition(point, placement);
    this.visible = true; this.host.dataset.interludeVisible = "true";
    this.startCanvasScaling();
    this.setDone(false);
    this.prop("height", "auto"); this.prop("transition", "none");
    const height = this.machine.getBoundingClientRect().height;
    if (placement === "inline" && !skipMotion && height > 80) {
      this.prop("height", "80px");
      void this.host.offsetHeight;
      this.prop("transition", "height 160ms steps(6,end)");
      this.prop("height", `${Math.ceil(height)}px`);
    }
    this.engine.setTabHidden(document.hidden);
    this.engine.start();
    this.engine.watchVisibility(this.host);
  }
  remount(point: MountPointResult, placement: Placement): void {
    if (!this.visible) return;
    this.setHostPosition(point, placement);
    this.lastScreenWidth = 0;
    this.scaleCanvas();
    this.prop("height", "auto"); this.prop("transition", "none");
    this.engine.watchVisibility(this.host);
  }
  close(smooth: boolean): void {
    if (!this.visible) return;
    this.visible = false; this.host.dataset.interludeVisible = "false";
    this.engine.stop(); this.engine.unwatchVisibility(); this.resizeObserver?.disconnect(); this.resizeObserver = null; this.lastScreenWidth = 0; this.blur(); this.setDone(false);
    // Collapse only the reserved flow space. The cabinet itself disappears immediately.
    if (smooth && this.placement === "inline" && this.host.isConnected && !document.hidden) {
      const height = this.host.getBoundingClientRect().height;
      this.prop("height", `${Math.ceil(height)}px`); this.prop("transition", "none");
      void this.host.offsetHeight;
      this.prop("visibility", "hidden"); this.prop("transition", "height 160ms steps(6,end)"); this.prop("height", "0px");
      this.collapseHandler = (event) => {
        if (event.target !== this.host || event.propertyName !== "height") return;
        if (this.collapseHandler) this.host.removeEventListener("transitionend", this.collapseHandler);
        this.collapseHandler = null; this.hideImmediately(); document.body.append(this.host);
      };
      this.host.addEventListener("transitionend", this.collapseHandler);
    } else { this.hideImmediately(); document.body.append(this.host); }
  }
  destroy(): void {
    if (this.collapseHandler) this.host.removeEventListener("transitionend", this.collapseHandler);
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    this.engine.destroy(); this.host.remove();
  }
  /** Use whole source-pixel groups when reducing the 640px logical buffer. */
  private scaleCanvas(): void {
    const available = Math.floor(this.screen.clientWidth);
    if (available <= 0 || available === this.lastScreenWidth) return;
    this.lastScreenWidth = available;
    const divisor = Math.max(1, Math.ceil(640 / available));
    this.canvas.style.width = `${640 / divisor}px`;
  }
  private startCanvasScaling(): void {
    this.lastScreenWidth = 0;
    this.scaleCanvas();
    this.resizeObserver?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.scaleCanvas());
      this.resizeObserver.observe(this.screen);
    }
  }
  private startDrag = (event: PointerEvent): void => {
    if (this.placement !== "overlay" || (event.target instanceof Element && event.target.closest("button, select"))) return;
    event.preventDefault();
    const rect = this.host.getBoundingClientRect(), dx = event.clientX - rect.left, dy = event.clientY - rect.top;
    this.top.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== event.pointerId) return;
      const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dx));
      const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dy));
      this.position = { x, y }; this.prop("left", `${x}px`); this.prop("top", `${y}px`);
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== event.pointerId) return;
      this.top.removeEventListener("pointermove", move); this.top.removeEventListener("pointerup", end); this.top.removeEventListener("pointercancel", end);
      if (this.position) this.events.onMove(this.position.x, this.position.y);
    };
    this.top.addEventListener("pointermove", move); this.top.addEventListener("pointerup", end); this.top.addEventListener("pointercancel", end);
  };
}
