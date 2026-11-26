/** The toolbar cabinet is an extension-local player, not a website iframe. */
import { AI_LEVELS, isAIDifficulty } from "../ai/difficulty";
import { Engine, type EngineState } from "../engine/engine";
import type { GameAction } from "../engine/input";
import { FocusGuard, cleanStats, type PlayStats } from "../focus/guard";
import { loadStats, saveDeltas, STATS_KEY } from "../focus/stats";
import { GAME_ACTIONS, type GameId, type InterludeSettings } from "../settings/schema";
import { loadSettings, saveSettings, SETTINGS_KEY } from "../settings/store";
import { GAME_MANIFESTS, getManifest, loadGame, resolveGameId } from "../games/manifest";
import type { GameManifest } from "../games/types";
import { loadPauseUntil, PAUSE_KEY } from "../shared/pause";
import { loadHighScores, loadKeybindings, loadLastPlayed, saveLastPlayed } from "../shared/storage";

type Control = readonly [label: string, action: GameAction, description: string];
const CONTROLS: Record<string, readonly Control[]> = {
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
  dropfour: [
    ["←", "left", "Select left"],
    ["→", "right", "Select right"],
    ["DROP", "primary", "Drop disc"],
  ],
  flipdisc: [
    ["←", "left", "Select left"],
    ["↑", "up", "Select up"],
    ["↓", "down", "Select down"],
    ["→", "right", "Select right"],
    ["PLACE", "primary", "Place disc"],
  ],
  dotsboxes: [
    ["←", "left", "Select left"],
    ["↑", "up", "Select up"],
    ["↓", "down", "Select down"],
    ["→", "right", "Select right"],
    ["DRAW", "primary", "Draw edge"],
  ],
  drafts: [
    ["←", "left", "Select left"],
    ["↑", "up", "Select up"],
    ["↓", "down", "Select down"],
    ["→", "right", "Select right"],
    ["SELECT", "primary", "Select piece or destination"],
  ],
  fleet: [
    ["←", "left", "Select left"],
    ["↑", "up", "Select up"],
    ["↓", "down", "Select down"],
    ["→", "right", "Select right"],
    ["FIRE", "primary", "Fire at target"],
  ],
  handsignals: [
    ["←", "left", "Select left"],
    ["→", "right", "Select right"],
    ["CHOOSE", "primary", "Choose signal"],
  ],
  sweep: [
    ["←", "left", "Select left"],
    ["↑", "up", "Select up"],
    ["↓", "down", "Select down"],
    ["→", "right", "Select right"],
    ["OPEN", "primary", "Open square"],
    ["FLAG", "secondary", "Flag square"],
  ],
  slide: [
    ["←", "left", "Move gap left"],
    ["↑", "up", "Move gap up"],
    ["↓", "down", "Move gap down"],
    ["→", "right", "Move gap right"],
  ],
  pop: [
    ["←", "left", "Aim left"],
    ["↑", "up", "Aim up"],
    ["↓", "down", "Aim down"],
    ["→", "right", "Aim right"],
    ["POP", "primary", "Pop target"],
  ],
  pairs: [
    ["←", "left", "Select left"],
    ["↑", "up", "Select up"],
    ["↓", "down", "Select down"],
    ["→", "right", "Select right"],
    ["FLIP", "primary", "Flip card"],
  ],
  echo: [
    ["↑", "up", "Echo up"],
    ["→", "right", "Echo right"],
    ["↓", "down", "Echo down"],
    ["←", "left", "Echo left"],
  ],
  darkroom: [
    ["←", "left", "Move left"],
    ["↑", "up", "Move up"],
    ["↓", "down", "Move down"],
    ["→", "right", "Move right"],
  ],
  codebreak: [
    ["←", "left", "Select digit left"],
    ["↑", "up", "Increase digit"],
    ["↓", "down", "Decrease digit"],
    ["→", "right", "Select digit right"],
    ["SUBMIT", "primary", "Submit code guess"],
  ],
  tictactoe: [
    ["←", "left", "Select left"],
    ["↑", "up", "Select up"],
    ["↓", "down", "Select down"],
    ["→", "right", "Select right"],
    ["MARK", "primary", "Place mark"],
  ],
};

const SCENE_LABELS: Record<EngineState, string> = {
  boot: "POWER ON",
  ready: "READY",
  playing: "PLAYING",
  paused: "PAUSED",
  gameover: "GAME OVER",
};
const PLAY_LABELS: Record<EngineState, string> = {
  boot: "START GAME",
  ready: "START GAME",
  playing: "PAUSE",
  paused: "RESUME",
  gameover: "PLAY AGAIN",
};

type Restriction = { title: string; detail: string };
function element<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing popup element ${selector}`);
  return node;
}

class PopupArcade {
  private readonly canvas: HTMLCanvasElement;
  private readonly picker: HTMLSelectElement;
  private readonly name: HTMLElement;
  private readonly state: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly focus: HTMLElement;
  private readonly announcement: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly play: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;
  private readonly gate: HTMLElement;
  private readonly gateTitle: HTMLElement;
  private readonly gateDetail: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly aiOptions: HTMLElement;
  private readonly cpuLevel: HTMLSelectElement;
  private readonly cpuMode: HTMLSelectElement;
  private readonly cpuModeField: HTMLElement;
  private readonly boardOptions: HTMLElement;
  private readonly boardSize: HTMLSelectElement;
  private readonly handOptions: HTMLElement;
  private readonly handMode: HTMLSelectElement;
  private readonly back: HTMLButtonElement;
  private readonly events = new AbortController();
  private engine: Engine | null = null;
  private guard: FocusGuard | null = null;
  private settings: InterludeSettings | null = null;
  private currentGame = "";
  private legacyBindings: Record<string, string> = {};
  private pauseUntil = 0;
  private loaded = false;
  private destroyed = false;
  private tracking = false;
  private hidden: boolean | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private selection = 0;
  private storageRevision = 0;
  private settingsRequest = 0;
  private statsRevision = 0;
  private flushing = false;
  private inFlightCount = 0;
  private statsDirty = false;
  private settingsUnavailable = false;
  private statsUnavailable = false;
  private loadError = "";

  constructor(root: HTMLElement) {
    this.canvas = element(root, "#game-canvas");
    this.picker = element(root, "#game-picker");
    this.name = element(root, "#game-name");
    this.state = element(root, "#game-state");
    this.hint = element(root, "#game-hint");
    this.focus = element(root, "#game-focus");
    this.announcement = element(root, "#game-announcement");
    this.controls = element(root, "#game-controls");
    this.play = element(root, "#play");
    this.reset = element(root, "#reset");
    this.gate = element(root, "#gate");
    this.gateTitle = element(root, "#gate-title");
    this.gateDetail = element(root, "#gate-detail");
    this.summary = element(root, "#guard-summary");
    this.notice = element(root, "#notice");
    this.aiOptions = element(root, "#ai-options");
    this.cpuLevel = element(root, "#cpu-level");
    this.cpuMode = element(root, "#cpu-mode");
    this.cpuModeField = element(root, "#cpu-mode-field");
    this.boardOptions = element(root, "#board-options");
    this.boardSize = element(root, "#board-size");
    this.handOptions = element(root, "#hand-options");
    this.handMode = element(root, "#hand-mode");
    this.back = element(root, "#back");

    this.canvas.dataset.scene = "loading";
    this.canvas.removeAttribute("data-game");
    this.name.textContent = "LOADING CABINET";
    this.state.textContent = "WAIT";
    this.picker.replaceChildren();
    this.picker.disabled = true;
    this.play.disabled = true;
    this.reset.disabled = true;
    this.controls.replaceChildren();
    this.aiOptions.hidden = true;
    this.notice.textContent = "";
    this.summary.textContent = "";
    this.announcement.textContent = "";
    this.showGate({ title: "LOADING", detail: "Preparing the local cabinet." });

    this.cpuLevel.replaceChildren();
    for (const level of AI_LEVELS) this.addOption(this.cpuLevel, level, level.toUpperCase());
    this.cpuMode.replaceChildren();
    this.addOption(this.cpuMode, "play", "PLAY VS CPU");
    this.addOption(this.cpuMode, "watch", "WATCH CPU");

    const signal = this.events.signal;
    this.picker.addEventListener("change", () => void this.chooseGame(this.picker.value), {
      signal,
    });
    this.cpuLevel.addEventListener("change", () => this.changeCpuLevel(), { signal });
    this.cpuMode.addEventListener("change", () => this.changeCpuMode(), { signal });
    this.boardSize.addEventListener(
      "change",
      () => {
        if (["3", "4", "5"].includes(this.boardSize.value)) {
          this.changeSetting({ tictactoeSize: this.boardSize.value });
          void this.chooseGame("tictactoe");
        }
      },
      { signal },
    );
    this.handMode.addEventListener(
      "change",
      () => {
        if (["classic", "extended"].includes(this.handMode.value)) {
          this.changeSetting({ handLizardSpock: this.handMode.value === "extended" });
          void this.chooseGame("handsignals");
        }
      },
      { signal },
    );
    this.play.addEventListener("click", () => this.playPressed(), { signal });
    this.reset.addEventListener("click", () => void this.chooseGame(this.currentGame), { signal });
    // Focus before the input listener sees the first canvas pointer event.
    this.canvas.addEventListener("pointerdown", () => this.focusGame(), { signal });
    this.canvas.addEventListener(
      "focus",
      () => {
        const enabled = this.canInput() && this.engine?.getState() !== "paused";
        this.engine?.setFocused(!!enabled);
        this.focus.hidden = !enabled;
      },
      { signal },
    );
    this.canvas.addEventListener(
      "blur",
      () => {
        this.engine?.setFocused(false);
        this.focus.hidden = true;
      },
      { signal },
    );
    this.canvas.addEventListener("keydown", (event) => this.onCanvasKey(event), { signal });
    document.addEventListener("visibilitychange", () => this.reconcile(), { signal });
    chrome.storage.onChanged.addListener(this.onStorage);
    void this.initialize();
  }

  private addOption(select: HTMLSelectElement, value: string, label: string): void {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  /** Do not start against a stale snapshot if another window changes the guard during startup. */
  private async initialSnapshot(): Promise<{
    settings: InterludeSettings;
    stats: PlayStats;
    pause: number;
    last: string | undefined;
  }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const revision = this.storageRevision;
      const [settings, stats, pause, last] = await Promise.all([
        loadSettings(),
        loadStats(),
        loadPauseUntil(),
        loadLastPlayed(),
      ]);
      if (revision === this.storageRevision) return { settings, stats, pause, last };
    }
    throw new Error("Storage changed repeatedly while opening");
  }

  private async initialize(): Promise<void> {
    try {
      const snapshot = await this.initialSnapshot();
      if (this.destroyed) return;
      this.settings = snapshot.settings;
      this.pauseUntil = snapshot.pause;
      this.guard = new FocusGuard(snapshot.settings, snapshot.stats);
      this.engine = new Engine(this.canvas, {
        settings: snapshot.settings,
        highScore: 0,
        onStateChange: (state) => this.sceneChanged(state),
        onAnnouncement: (text) => {
          this.announcement.textContent = text;
        },
      });
      this.engine.attachInput(this.canvas);
      this.engine.watchVisibility(this.canvas);
      this.renderPicker();
      const allowed = this.enabledGames();
      this.timer = setInterval(() => this.reconcile(), 1000);
      this.reconcile();
      if (allowed.length) {
        const chosen = resolveGameId(snapshot.settings.game, snapshot.last, Math.random, allowed);
        void this.chooseGame(chosen);
      } else this.clearGame();
    } catch {
      if (this.destroyed) return;
      this.state.textContent = "UNAVAILABLE";
      this.showGate({
        title: "STORAGE UNAVAILABLE",
        detail: "Go back and check extension storage before playing.",
      });
    }
  }

  private enabledGames(): string[] {
    if (!this.settings) return [];
    return GAME_MANIFESTS.filter(
      (entry) => this.settings?.[`game.${entry.id}.enabled`] !== false,
    ).map((entry) => entry.id);
  }

  private renderPicker(): void {
    const enabled = this.enabledGames();
    const existing = Array.from(this.picker.options, (option) => option.value).filter(Boolean);
    if (
      existing.join("|") !== enabled.join("|") ||
      (!enabled.length && !this.picker.options.length)
    ) {
      this.picker.replaceChildren();
      for (const manifest of GAME_MANIFESTS) {
        if (enabled.includes(manifest.id)) this.addOption(this.picker, manifest.id, manifest.name);
      }
      if (!enabled.length) this.addOption(this.picker, "", "NO GAMES ENABLED");
    }
    this.picker.disabled = !enabled.length;
    if (enabled.includes(this.currentGame)) this.picker.value = this.currentGame;
  }

  private async chooseGame(id: string): Promise<void> {
    const engine = this.engine;
    const manifest = getManifest(id);
    if (!engine || !manifest || !this.enabledGames().includes(id)) return;
    const sequence = ++this.selection;
    this.stopTracking(true);
    engine.stop();
    this.loaded = false;
    this.currentGame = id;
    this.loadError = "";
    this.canvas.dataset.scene = "loading";
    this.canvas.removeAttribute("data-game");
    this.name.textContent = manifest.name;
    this.state.textContent = "LOADING";
    this.picker.value = id;
    this.controls.replaceChildren();
    this.aiOptions.hidden = true;
    this.reconcile();
    try {
      const [game, scores, bindings] = await Promise.all([
        loadGame(id),
        loadHighScores(),
        loadKeybindings(),
      ]);
      if (this.destroyed || sequence !== this.selection || !this.enabledGames().includes(id))
        return;
      this.legacyBindings = bindings[id] ?? {};
      engine.setSettings(this.settings!);
      engine.setGame(game, scores[id] ?? 0);
      this.applyBindings();
      this.canvas.dataset.game = id;
      this.canvas.setAttribute(
        "aria-label",
        `${manifest.name} game screen. Focus to use the keyboard.`,
      );
      this.makeControls(manifest);
      this.loaded = true;
      this.syncGameSettings();
      engine.start();
      this.reconcile();
      void saveLastPlayed(id).catch(() => {});
    } catch {
      if (this.destroyed || sequence !== this.selection) return;
      this.loadError = "This cabinet could not be loaded. Choose another, or try again.";
      this.state.textContent = "LOAD ERROR";
      this.reconcile();
    }
  }

  private clearGame(): void {
    this.selection++;
    this.stopTracking(true);
    this.engine?.stop();
    this.currentGame = "";
    this.loaded = false;
    this.canvas.removeAttribute("data-game");
    this.canvas.dataset.scene = "unavailable";
    this.name.textContent = "NO CABINET";
    this.controls.replaceChildren();
    this.aiOptions.hidden = true;
    this.boardOptions.hidden = true;
    this.handOptions.hidden = true;
    this.renderPicker();
    this.reconcile();
  }

  private applyBindings(): void {
    if (!this.settings || !this.engine || !this.currentGame) return;
    const map = { ...this.legacyBindings };
    for (const action of GAME_ACTIONS[this.currentGame as GameId] ?? []) {
      const value = this.settings[`key.${this.currentGame}.${action}`];
      if (typeof value === "string") map[action] = value;
    }
    this.engine.input.setKeymapOverrides(map);
  }

  private watching(): boolean {
    return (
      !!this.settings &&
      ((this.currentGame === "pong" && this.settings.pongWatch) ||
        (this.currentGame === "tictactoe" && this.settings.tictactoeWatch))
    );
  }

  private syncGameSettings(): void {
    if (!this.settings) return;
    const isPong = this.currentGame === "pong";
    const isTic = this.currentGame === "tictactoe";
    const isBoard = [
      "dropfour",
      "flipdisc",
      "drafts",
      "dotsboxes",
      "fleet",
      "handsignals",
    ].includes(this.currentGame);
    this.aiOptions.hidden = !isPong && !isTic && !isBoard;
    this.cpuModeField.hidden = isBoard;
    this.boardOptions.hidden = !isTic;
    this.handOptions.hidden = this.currentGame !== "handsignals";
    this.handMode.value = this.settings.handLizardSpock ? "extended" : "classic";
    this.boardSize.value = this.settings.tictactoeSize;
    if (isPong || isTic || isBoard) {
      this.cpuLevel.value = isPong
        ? this.settings.pongDifficulty
        : isTic
          ? this.settings.tictactoeDifficulty
          : String(this.settings.boardDifficulty);
      this.cpuMode.value = this.watching() ? "watch" : "play";
    }
    const manifest = getManifest(this.currentGame);
    this.hint.textContent = this.watching()
      ? "WATCH CPU · NO SOLO RECORDS"
      : manifest
        ? `${manifest.controls} · PAUSE KEY IN OPTIONS`
        : "Select a cabinet to begin.";
    this.updateControls();
  }

  private changeCpuLevel(): void {
    if (!this.settings || !isAIDifficulty(this.cpuLevel.value)) return;
    const key =
      this.currentGame === "pong"
        ? "pongDifficulty"
        : this.currentGame === "tictactoe"
          ? "tictactoeDifficulty"
          : ["dropfour", "flipdisc", "drafts", "dotsboxes", "fleet", "handsignals"].includes(
                this.currentGame,
              )
            ? "boardDifficulty"
            : "";
    if (key) this.changeSetting({ [key]: this.cpuLevel.value });
  }
  private changeCpuMode(): void {
    if (!this.settings || !["play", "watch"].includes(this.cpuMode.value)) return;
    const key =
      this.currentGame === "pong"
        ? "pongWatch"
        : this.currentGame === "tictactoe"
          ? "tictactoeWatch"
          : "";
    if (key) this.changeSetting({ [key]: this.cpuMode.value === "watch" });
  }
  private changeSetting(patch: Record<string, string | boolean>): void {
    if (!this.settings) return;
    this.applySettings({ ...this.settings, ...patch });
    void saveSettings(patch).catch(() => {
      if (!this.destroyed) this.notice.textContent = "SETTING COULD NOT BE SAVED";
    });
  }

  private makeControls(manifest: GameManifest): void {
    this.controls.replaceChildren();
    this.controls.setAttribute("aria-label", `${manifest.name} on-screen controls`);
    for (const [label, action, description] of CONTROLS[manifest.id] ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-label", description);
      button.addEventListener("pointerdown", (event) => {
        if (
          !this.settings ||
          !this.canInput() ||
          this.engine?.getState() === "paused" ||
          this.watching()
        )
          return;
        if (
          event.pointerType === "touch"
            ? !this.settings.touchEnabled
            : !this.settings.pointerEnabled
        )
          return;
        event.preventDefault();
        if (!this.focusGame()) return;
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          /* detached or synthetic */
        }
        this.engine?.input.virtualDown(action, `button:${event.pointerId}`);
      });
      const release = (event: PointerEvent): void =>
        this.engine?.input.virtualUp(action, `button:${event.pointerId}`);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      button.addEventListener("click", (event) => {
        if (
          event.detail !== 0 ||
          !this.canInput() ||
          this.engine?.getState() === "paused" ||
          this.watching()
        )
          return;
        if (!this.focusGame()) return;
        this.engine?.input.virtualDown(action, "accessible");
        this.engine?.input.virtualUp(action, "accessible");
      });
      this.controls.append(button);
    }
  }

  private canInput(): boolean {
    return this.loaded && !this.destroyed && !document.hidden && !this.restriction();
  }
  private focusGame(): boolean {
    if (!this.engine || !this.canInput()) return false;
    this.canvas.focus({ preventScroll: true });
    this.engine.setFocused(true);
    this.focus.hidden = false;
    return true;
  }
  private onCanvasKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.back.focus({ preventScroll: true });
      return;
    }
    if (!this.canInput()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.reconcile();
      return;
    }
    const engine = this.engine;
    if (engine?.getState() === "paused" && engine.input.actionFor(event.code) === "pause") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat && this.focusGame()) {
        engine.sound.unlock();
        engine.resumeFromDone();
      }
    }
  }
  private playPressed(): void {
    const engine = this.engine;
    if (!engine || !this.canInput()) return;
    if (engine.getState() === "playing") engine.pauseByUser();
    else if (engine.getState() === "paused") {
      if (this.focusGame()) {
        engine.sound.unlock();
        engine.resumeFromDone();
      }
    } else if (this.focusGame()) {
      // Confirm starts without accidentally triggering a game-specific action.
      engine.input.virtualDown("confirm", "start");
      engine.input.virtualUp("confirm", "start");
    }
  }

  private sceneChanged(scene: EngineState): void {
    this.canvas.dataset.scene = scene;
    this.state.textContent = SCENE_LABELS[scene];
    this.play.textContent = PLAY_LABELS[scene];
    if (scene === "playing" && this.canInput()) this.startTracking();
    else this.stopTracking(false);
    if (scene === "paused") {
      this.engine?.setFocused(false);
      this.focus.hidden = true;
    }
    this.updateControls();
  }

  private startTracking(): void {
    if (!this.guard || this.tracking || !this.currentGame) return;
    this.guard.begin(this.currentGame);
    this.tracking = true;
    void this.flushStats();
  }
  private stopTracking(end: boolean): void {
    if (!this.guard) return;
    if (end) this.guard.end();
    else if (this.tracking) this.guard.pause();
    this.tracking = false;
    void this.flushStats();
  }

  private restriction(snapshot = this.guard?.snapshot()): Restriction | null {
    if (this.settingsUnavailable || this.statsUnavailable)
      return {
        title: "STORAGE UNAVAILABLE",
        detail: "Play is paused until extension storage is available.",
      };
    if (this.pauseUntil > Date.now())
      return { title: "CABINETS PAUSED", detail: "Return to the menu to resume all cabinets." };
    if (snapshot?.block === "lock")
      return {
        title: "OUT OF COINS. BACK TO WORK.",
        detail: "Daily budget reached. Change Focus Guard in Options, or return tomorrow.",
      };
    if (snapshot?.block === "quiet")
      return { title: "QUIET HOURS", detail: "The cabinet is on hold during your quiet schedule." };
    if (snapshot?.block === "study")
      return { title: "STUDY MODE", detail: "The cabinet is on hold during your study schedule." };
    if (this.settings && !this.enabledGames().length)
      return {
        title: "NO GAMES ENABLED",
        detail: "Enable a cabinet in Options, then return here.",
      };
    return null;
  }
  private showGate(restriction: Restriction | null): void {
    this.gate.hidden = !restriction;
    if (restriction) {
      this.gateTitle.textContent = restriction.title;
      this.gateDetail.textContent = restriction.detail;
    }
  }
  private updateControls(): void {
    const blocked = !this.canInput();
    const scene = this.engine?.getState();
    this.play.disabled = blocked;
    this.reset.disabled = blocked;
    for (const button of this.controls.querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = blocked || scene === "paused" || this.watching();
  }

  /** The one-second cadence also catches clock, schedule and pause expiry changes. */
  private reconcile(): void {
    const engine = this.engine;
    const guard = this.guard;
    if (!engine || !guard || !this.settings || this.destroyed) return;
    const snapshot = this.tracking ? guard.tick() : guard.snapshot();
    for (const notice of guard.takeNotices()) {
      this.notice.textContent =
        notice.type === "budget"
          ? "DAILY BUDGET REACHED"
          : `${notice.minutes} MINUTES PLAYED TODAY`;
    }
    const reason = this.restriction(snapshot);
    if (reason && engine.getState() === "playing") engine.pauseByUser();
    if ((reason || document.hidden) && this.tracking) this.stopTracking(false);
    const hidden = !!reason || document.hidden;
    if (hidden !== this.hidden) {
      this.hidden = hidden;
      engine.setTabHidden(hidden);
    }
    if (hidden) {
      engine.setFocused(false);
      this.focus.hidden = true;
      if (reason && document.activeElement === this.canvas)
        this.back.focus({ preventScroll: true });
    } else if (
      document.activeElement === this.canvas &&
      engine.getState() !== "paused" &&
      this.loaded
    ) {
      engine.setFocused(true);
      this.focus.hidden = false;
    }
    this.canvas.tabIndex = reason || !this.loaded ? -1 : 0;
    this.canvas.setAttribute("aria-disabled", String(!!reason || !this.loaded));
    this.showGate(
      reason ??
        (this.loadError
          ? { title: "CABINET UNAVAILABLE", detail: this.loadError }
          : !this.loaded
            ? { title: "LOADING", detail: "Preparing the local cabinet." }
            : null),
    );
    if (reason) this.state.textContent = "ON HOLD";
    else if (this.loadError) this.state.textContent = "LOAD ERROR";
    else if (this.loaded) this.state.textContent = SCENE_LABELS[engine.getState()];
    this.summary.textContent = `${Math.floor(snapshot.todayMs / 60000)} MIN TODAY${this.settings.budgetEnabled ? ` / ${this.settings.budgetMinutes} MIN BUDGET` : ""} · BACK OR CLOSE ENDS THE RUN.`;
    this.updateControls();
    if (!hidden && this.loaded && engine.getState() === "playing" && !this.tracking)
      this.startTracking();
    if (guard.pendingDeltas().length) void this.flushStats();
  }

  private applySettings(next: InterludeSettings): void {
    if (!this.guard || !this.engine || this.destroyed) return;
    this.settings = next;
    this.guard.setSettings(next);
    this.engine.setSettings(next);
    this.applyBindings();
    this.renderPicker();
    this.syncGameSettings();
    const enabled = this.enabledGames();
    if (!enabled.length) this.clearGame();
    else if (!enabled.includes(this.currentGame)) void this.chooseGame(enabled[0]!);
    else this.reconcile();
  }

  private async refreshSettings(): Promise<void> {
    const request = ++this.settingsRequest;
    try {
      const next = await loadSettings();
      if (this.destroyed || request !== this.settingsRequest) return;
      this.settingsUnavailable = false;
      this.applySettings(next);
    } catch {
      if (this.destroyed || request !== this.settingsRequest) return;
      this.settingsUnavailable = true;
      this.reconcile();
    }
  }

  private onStorage: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    const settingsChanged = (area === "sync" || area === "local") && !!changes[SETTINGS_KEY];
    const statsChanged = area === "local" && !!changes[STATS_KEY];
    const pauseChanged = area === "local" && !!changes[PAUSE_KEY];
    if (!settingsChanged && !statsChanged && !pauseChanged) return;
    this.storageRevision++;
    if (!this.guard || !this.engine) return;
    if (settingsChanged) void this.refreshSettings();
    if (pauseChanged) {
      const value: unknown = changes[PAUSE_KEY]?.newValue;
      this.pauseUntil = typeof value === "number" && Number.isFinite(value) ? value : 0;
      this.reconcile();
    }
    if (statsChanged) {
      this.statsRevision++;
      if (this.flushing || this.guard.pendingDeltas().length) {
        this.statsDirty = true;
        if (!this.flushing) void this.flushStats();
      } else {
        this.guard.replaceBase(cleanStats(changes[STATS_KEY]?.newValue));
        this.reconcile();
      }
    }
  };

  /** Serialize writes through the service worker, then reconcile other windows' updates. */
  private async flushStats(): Promise<void> {
    const guard = this.guard;
    if (!guard || this.flushing || this.destroyed) return;
    this.flushing = true;
    let recovered = false;
    try {
      while (!this.destroyed && guard.pendingDeltas().length) {
        const deltas = guard.pendingDeltas();
        this.inFlightCount = deltas.length;
        const remote = await saveDeltas(deltas);
        this.inFlightCount = 0;
        guard.acknowledge(deltas.length, remote);
      }
      if (this.statsUnavailable) {
        this.statsUnavailable = false;
        recovered = true;
      }
    } catch {
      this.inFlightCount = 0;
      this.statsUnavailable = true;
      this.reconcile();
    } finally {
      this.flushing = false;
    }
    if (this.destroyed) return;
    if (this.statsDirty) {
      this.statsDirty = false;
      const revision = this.statsRevision;
      try {
        const latest = await loadStats();
        if (this.destroyed) return;
        if (revision === this.statsRevision && !this.flushing && !guard.pendingDeltas().length) {
          guard.replaceBase(latest);
          this.statsUnavailable = false;
          this.reconcile();
        } else if (this.flushing || guard.pendingDeltas().length) this.statsDirty = true;
      } catch {
        this.statsDirty = true;
        this.statsUnavailable = true;
        this.reconcile();
      }
    } else if (recovered) this.reconcile();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.selection++;
    // Send only the suffix not already handed to the worker. This also runs on
    // pagehide, before the popup context disappears, without double-counting.
    this.guard?.end();
    this.tracking = false;
    this.destroyed = true;
    const tail = this.guard?.pendingDeltas().slice(this.inFlightCount) ?? [];
    if (tail.length) void saveDeltas(tail).catch(() => {});
    if (this.timer !== undefined) clearInterval(this.timer);
    chrome.storage.onChanged.removeListener(this.onStorage);
    this.events.abort();
    this.engine?.destroy();
    this.engine = null;
  }
}

export function mountPopupArcade(root: HTMLElement): () => void {
  const arcade = new PopupArcade(root);
  return () => arcade.destroy();
}
