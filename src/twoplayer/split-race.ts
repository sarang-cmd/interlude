/** Two independent copies of an existing game, sharing one seeded round clock. */
import { Input } from "../engine/input";
import { ParticleSystem } from "../engine/particles";
import type { ArcadeGame, GameContext, GameManifest } from "../games/types";
import { RNG } from "../shared/rng";
import { TOKENS } from "../../design/tokens";
import {
  copyRaceSettings,
  defaultRaceSettings,
  raceActions,
  raceBindingError,
  RACE_DURATIONS,
  RACE_HANDICAPS,
  type RaceAction,
  type RaceGameId,
  type RaceResult,
  type RaceSettings,
} from "./race-settings";

type PlayerIndex = 0 | 1;
type HeldControl = { player: PlayerIndex; action: RaceAction; source: string };
interface PlayerRun {
  game: ArcadeGame;
  input: Input;
  canvas: HTMLCanvasElement;
  particles: ParticleSystem;
  ended: boolean;
  survival: number;
}
export interface RaceProgress {
  scores: [number, number];
  adjusted: [number, number];
  ended: [boolean, boolean];
  remaining: number;
}

/** The only state shared by both games is the clock, seed and parent sound. */
export class SplitRaceGame implements ArcadeGame {
  readonly manifest: GameManifest;
  readonly recordsAllowed = false;
  readonly readyHint = "TWO PLAYERS · START TO RACE · P PAUSES";
  onResult: ((result: RaceResult) => void) | null = null;
  onProgress: ((progress: RaceProgress) => void) | null = null;

  private g!: GameContext;
  private settings: RaceSettings;
  private round: RaceSettings;
  private players: PlayerRun[] = [];
  private elapsed = 0;
  private roundSeed = 0;
  private completedRounds = 0;
  private finished = false;
  private started = false;
  private result: RaceResult | null = null;
  private held = new Map<string, HeldControl>();
  private pending = new Map<string, HeldControl>();
  private padActions: [Set<RaceAction>, Set<RaceAction>] = [new Set(), new Set()];
  private padSlots: [number | null, number | null] = [null, null];
  private progressKey = "";

  constructor(
    readonly gameId: RaceGameId,
    private readonly createGame: () => ArcadeGame,
  ) {
    this.manifest = createGame().manifest;
    this.settings = defaultRaceSettings(gameId);
    this.round = copyRaceSettings(this.settings);
  }

  get score(): number {
    return Math.max(0, ...this.players.map((player) => player.game.score));
  }

  get resultLabel(): string | undefined {
    if (!this.result) return undefined;
    const label = this.result.winner ? `${this.result.names[this.result.winner - 1]} WINS` : "DRAW";
    return `${label} · ${this.result.adjusted[0]} / ${this.result.adjusted[1]}`;
  }

  /** Rules apply to the next round. Key changes apply immediately. */
  configureLocal(settings: RaceSettings): void {
    if (raceBindingError(this.gameId, settings.keys)) throw new Error("Conflicting keys");
    if (
      !RACE_DURATIONS.some((value) => value === settings.seconds) ||
      !settings.handicap.every((value) => RACE_HANDICAPS.some((choice) => choice === value)) ||
      !Number.isInteger(settings.seed) ||
      settings.seed < 0 ||
      settings.seed > 0xffffffff ||
      ![1, 3, 5].includes(settings.bestOf)
    )
      throw new Error("Invalid race settings");
    const changedKeys = JSON.stringify(this.settings.keys) !== JSON.stringify(settings.keys);
    this.settings = copyRaceSettings(settings);
    if (changedKeys) this.clearControls();
  }

  resetSeries(): void {
    this.completedRounds = 0;
  }

  init(ctx: GameContext): void {
    this.g = ctx;
    this.round = copyRaceSettings(this.settings);
    this.roundSeed = (this.round.seed + this.completedRounds) >>> 0;
    this.elapsed = 0;
    this.finished = false;
    this.started = false;
    this.result = null;
    this.progressKey = "";
    this.padActions = [new Set(), new Set()];
    this.padSlots = [null, null];
    this.players = [this.createPlayer(), this.createPlayer()];
    ctx.canvas.addEventListener("keydown", this.onKeyDown, true);
    ctx.canvas.addEventListener("keyup", this.onKeyUp, true);
    ctx.canvas.addEventListener("blur", this.clearControls);
    if (ctx.input.isEnabled) {
      for (const control of this.held.values()) this.applyControl(control, true);
      // A quick start gesture may have ended before the engine initialized.
      for (const [key, control] of this.pending) {
        if (this.held.has(key)) continue;
        this.applyControl(control, true);
        this.applyControl(control, false);
      }
    } else this.held.clear();
    this.pending.clear();
  }

  private createPlayer(): PlayerRun {
    const canvas = document.createElement("canvas");
    canvas.width = this.g.width;
    canvas.height = this.g.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingEnabled = false;
    const input = new Input();
    input.setEnabled(this.g.input.isEnabled);
    const particles = new ParticleSystem();
    const player: PlayerRun = {
      game: this.createGame(),
      input,
      canvas,
      particles,
      ended: false,
      survival: 0,
    };
    const parent = this.g;
    const gameContext: GameContext = {
      width: parent.width,
      height: parent.height,
      canvas,
      ctx,
      rng: new RNG(this.roundSeed),
      input,
      sound: parent.sound,
      particles,
      preview: true,
      highScore: 0,
      // Each player has the same external race clock. Disable the solo 2048 clock.
      get settings() {
        return { ...parent.settings, twenty48Seconds: 0 };
      },
      // A hit from one game must not freeze or move the other player's board.
      shake: () => {},
      hitStop: () => {},
      scorePop: () => {},
      reportGameOver: async () => {
        player.ended = true;
      },
    };
    player.game.init(gameContext);
    return player;
  }

  settingsChanged(): void {
    for (const player of this.players) player.game.settingsChanged?.();
  }

  destroy(): void {
    if (this.g) {
      this.g.canvas.removeEventListener("keydown", this.onKeyDown, true);
      this.g.canvas.removeEventListener("keyup", this.onKeyUp, true);
      this.g.canvas.removeEventListener("blur", this.clearControls);
    }
    for (const player of this.players) {
      player.input.setEnabled(false);
      player.game.destroy();
      player.particles.clear();
    }
    this.players = [];
    this.padActions = [new Set(), new Set()];
    // Keep held controls during the engine's synchronous ready-to-play restart.
    // The blur handler clears them when focus leaves the game.
  }

  fixedUpdate(dt: number): void {
    if (this.finished || this.players.length !== 2) return;
    this.started = true;
    this.pending.clear();
    if (!this.g.input.isEnabled) this.clearControls();
    else {
      this.enableInputs();
      this.pollGamepads();
    }
    const step = Math.max(0, Math.min(dt, this.round.seconds - this.elapsed));
    this.elapsed += step;
    for (const player of this.players) {
      if (!player.ended) {
        player.survival += step;
        player.game.fixedUpdate(step);
        player.particles.update(step);
      }
    }
    this.reportProgress();
    if (this.elapsed >= this.round.seconds || this.players.every((player) => player.ended)) {
      this.finish();
    }
  }

  private reportProgress(): void {
    const progress = this.progress();
    const key = `${progress.scores.join(":")}:${progress.ended.join(":")}:${progress.remaining}`;
    if (key === this.progressKey) return;
    this.progressKey = key;
    this.onProgress?.(progress);
  }

  private progress(): RaceProgress {
    const scores: [number, number] = [
      this.players[0]?.game.score ?? 0,
      this.players[1]?.game.score ?? 0,
    ];
    return {
      scores,
      adjusted: [
        Math.round((scores[0] * this.round.handicap[0]) / 100),
        Math.round((scores[1] * this.round.handicap[1]) / 100),
      ],
      ended: [this.players[0]?.ended ?? false, this.players[1]?.ended ?? false],
      remaining: Math.max(0, Math.ceil(this.round.seconds - this.elapsed)),
    };
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const { scores, adjusted } = this.progress();
    const survival: [number, number] = [
      Math.round((this.players[0]?.survival ?? 0) * 100) / 100,
      Math.round((this.players[1]?.survival ?? 0) * 100) / 100,
    ];
    const scoreDiff = adjusted[0] - adjusted[1];
    const timeDiff = survival[0] - survival[1];
    const winner =
      scoreDiff > 0 ? 1 : scoreDiff < 0 ? 2 : timeDiff > 0 ? 1 : timeDiff < 0 ? 2 : null;
    this.result = {
      game: this.gameId,
      playedAt: Date.now(),
      names: [...this.round.names],
      scores,
      adjusted,
      handicap: [...this.round.handicap],
      survival,
      winner,
      seed: this.roundSeed,
    };
    this.completedRounds++;
    this.onResult?.(this.result);
    void this.g.reportGameOver();
  }

  render(alpha: number): void {
    const context = this.g.ctx;
    context.fillStyle = TOKENS.ink;
    context.fillRect(0, 0, this.g.width, this.g.height);
    const progress = this.progress();
    for (const index of [0, 1] as const) {
      const player = this.players[index];
      if (!player) continue;
      const child = player.canvas.getContext("2d");
      if (!child) continue;
      child.save();
      player.game.render(alpha);
      player.particles.render(child);
      child.restore();
      const x = index === 0 ? 8 : 326;
      context.drawImage(player.canvas, x, 75, 306, 172);
      context.strokeStyle = TOKENS.phosphorDim;
      context.strokeRect(x + 0.5, 75.5, 305, 171);
      context.font = '12px "IBM Plex Mono", monospace';
      context.textAlign = "center";
      context.fillStyle = TOKENS.phosphorHot;
      context.fillText(this.round.names[index].toUpperCase(), x + 153, 55);
      context.fillStyle = TOKENS.phosphor;
      context.fillText(
        `${progress.scores[index]} PTS · ${progress.adjusted[index]} ADJ${player.ended ? " · OUT" : ""}`,
        x + 153,
        272,
      );
    }
    context.textAlign = "center";
    context.fillStyle = TOKENS.phosphorHot;
    context.font = "16px VT323, monospace";
    context.fillText(
      `TIME ${progress.remaining} · SAME SEED ${this.roundSeed}`,
      this.g.width / 2,
      315,
    );
    context.fillStyle = TOKENS.phosphorDim;
    context.fillText("HIGHER ADJUSTED SCORE WINS · TIME BREAKS TIES", this.g.width / 2, 337);
  }

  /** Separate touch controls use distinct sources, so two fingers work together. */
  setControl(player: PlayerIndex, action: RaceAction, pressed: boolean, source: string): void {
    const key = `${player}:${action}:${source}`;
    const control: HeldControl = { player, action, source };
    if (pressed) {
      if (!this.g.input.isEnabled || this.held.has(key)) return;
      // Engine handles start/retry and audio unlock. On a retry this restarts
      // synchronously, so route the action only after the gesture.
      this.g.input.virtualDown("confirm", `race:${key}`);
      this.g.input.virtualUp("confirm", `race:${key}`);
      this.enableInputs();
      this.held.set(key, control);
      if (!this.started) this.pending.set(key, control);
      this.applyControl(control, true);
    } else {
      this.held.delete(key);
      this.applyControl(control, false);
    }
  }

  private enableInputs(): void {
    if (!this.g.input.isEnabled) return;
    for (const player of this.players) if (!player.input.isEnabled) player.input.setEnabled(true);
  }

  private applyControl(control: HeldControl, pressed: boolean): void {
    const input = this.players[control.player]?.input;
    if (!input) return;
    if (pressed) input.virtualDown(control.action, control.source);
    else input.virtualUp(control.action, control.source);
  }

  private clearControls = (): void => {
    this.held.clear();
    this.pending.clear();
    this.padActions = [new Set(), new Set()];
    for (const player of this.players) player.input.setEnabled(false);
  };

  private findKey(code: string): { player: PlayerIndex; action: RaceAction } | null {
    for (const player of [0, 1] as const) {
      for (const [action] of raceActions(this.gameId)) {
        if (this.settings.keys[player][action] === code) return { player, action };
      }
    }
    return null;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.g.input.isEnabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const found = this.findKey(event.code);
    if (!found) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) this.setControl(found.player, found.action, true, `key:${event.code}`);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const found = this.findKey(event.code);
    if (!found) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.setControl(found.player, found.action, false, `key:${event.code}`);
  };

  private pollGamepads(): void {
    const pads =
      this.g.settings.gamepadEnabled && typeof navigator.getGamepads === "function"
        ? Array.from(navigator.getGamepads())
        : [];
    // Keep the original slots for this round. Disconnecting one controller
    // must not silently give the other controller to the wrong player.
    for (const player of [0, 1] as const) {
      if (this.padSlots[player] !== null) continue;
      const slot = pads.findIndex(
        (pad, index) => !!pad?.connected && !this.padSlots.includes(index),
      );
      if (slot >= 0) this.padSlots[player] = slot;
    }
    for (const index of [0, 1] as const) {
      const slot = this.padSlots[index];
      const candidate = slot === null ? null : pads[slot];
      const pad = candidate?.connected ? candidate : null;
      const next = new Set<RaceAction>();
      if (pad) {
        if ((pad.axes[0] ?? 0) < -0.45 || pad.buttons[14]?.pressed) next.add("left");
        if ((pad.axes[0] ?? 0) > 0.45 || pad.buttons[15]?.pressed) next.add("right");
        if ((pad.axes[1] ?? 0) < -0.45 || pad.buttons[12]?.pressed) next.add("up");
        if ((pad.axes[1] ?? 0) > 0.45 || pad.buttons[13]?.pressed) next.add("down");
        if (pad.buttons[0]?.pressed) next.add("primary");
        if (pad.buttons[1]?.pressed) next.add("secondary");
      }
      const input = this.players[index]?.input;
      if (!input) continue;
      for (const action of next)
        if (!this.padActions[index].has(action)) input.virtualDown(action, "pad");
      for (const action of this.padActions[index])
        if (!next.has(action)) input.virtualUp(action, "pad");
      this.padActions[index] = next;
    }
  }
}
