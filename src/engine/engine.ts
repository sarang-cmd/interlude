/**
 * Engine — owns the canvas, scene flow, HUD, shake, hit-stop, score pops,
 * CRT post-pass (scanlines + bloom INSIDE the canvas only), and the
 * signal→first-frame measurement hook.
 *
 * Scene flow:  boot → ready → playing ⇄ paused(done) → gameover → ready…
 *
 * Idle costs nothing: stop() cancels the rAF loop, detaches nothing
 * (the panel owns DOM), and all sounds/particles go quiet.
 */
import { GameLoop } from "./loop";
import { SceneStack } from "./sceneStack";
import { Input } from "./input";
import { Sound } from "./sound";
import { ParticleSystem } from "./particles";
import { RNG, randomSeed } from "../shared/rng";
import { saveHighScore, type InterludeSettings } from "../shared/storage";
import { TOKENS, LOGICAL_WIDTH, LOGICAL_HEIGHT } from "../../design/tokens";
import type { ArcadeGame, GameContext } from "../games/types";

export type EngineState =
  | "boot"
  | "ready"
  | "playing"
  | "paused" // generation finished — frozen, DOM overlay offers RESUME/CLOSE
  | "gameover";

export interface EngineOptions {
  settings: InterludeSettings;
  highScore: number;
  /** Preview sessions never persist scores. */
  preview?: boolean;
  doneLabel?: string;
  /** Called after a run ends and the new best (if any) is persisted. */
  onHighScore?: (best: number, isRecord: boolean) => void;
  /** First rendered frame after construction — for signal→frame timing. */
  onFirstFrame?: () => void;
  onStateChange?: (state: EngineState) => void;
}

interface ScorePop {
  x: number;
  y: number;
  text: string;
  t: number;
}

const BOOT_SECONDS = 0.2;

export class Engine implements GameContext {
  readonly width = LOGICAL_WIDTH;
  readonly height = LOGICAL_HEIGHT;
  readonly input = new Input();
  readonly sound = new Sound();
  readonly particles = new ParticleSystem();

  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private loop = new GameLoop();
  private game: ArcadeGame | null = null;
  private options: EngineOptions;
  private rngState = new RNG(randomSeed());
  private scenes = new SceneStack<EngineState>("ready");
  private active = false;
  private focused = false;
  private bootPlayed = false;
  private startedBefore = false;
  private stateBeforePause: EngineState = "ready";
  private get state(): EngineState {
    return this.scenes.current;
  }
  private bootT = 0;
  private shakeMag = 0;
  private shakeDur = 0;
  private shakeT = 0;
  private scorePops: ScorePop[] = [];
  private hiScore: number;
  private rafVisible = true;
  private io: IntersectionObserver | null = null;
  private scanPattern: CanvasPattern | null = null;
  private firstFrameFired = false;
  private recordedBest = false;
  private runVersion = 0;
  private pauseReason: "done" | "user" = "done";
  private musicTime = 0;
  private musicIndex = 0;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this._canvas = canvas;
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this._ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    this.options = options;
    this.hiScore = options.highScore;
    this.sound.configure(options.settings.volume, options.settings.soundPack);
    this.sound.setMuted(options.settings.muted);
    this.input.configure({
      pointer: options.settings.pointerEnabled,
      touch: options.settings.touchEnabled,
      gamepad: options.settings.gamepadEnabled,
      repeat: options.settings.keyRepeat,
    });
    this.input.onGesture = () => {
      this.sound.unlock();
      // A real key/pointer/button gesture retries immediately, even if the
      // previous death is still in hit-stop. Its action is then buffered for
      // the new run by Input.
      if (this.active && this.state === "gameover") {
        this.loop.clearHitStop();
        this.beginRun();
        this.render(0);
      }
    };

    this.loop.onFixedUpdate = (dt) => this.fixedUpdate(dt);
    this.loop.onRender = (alpha) => this.render(alpha);
    this.makeScanPattern();
  }

  // ---- GameContext implementation -----------------------------------------

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }
  get ctx(): CanvasRenderingContext2D {
    return this._ctx;
  }
  get rng(): RNG {
    return this.rngState;
  }
  get settings(): InterludeSettings {
    return this.options.settings;
  }
  get highScore(): number {
    return this.hiScore;
  }
  get preview(): boolean {
    return !!this.options.preview;
  }

  shake(mag: number, dur: number): void {
    if (this.settings.reduceMotion) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeDur = Math.max(this.shakeDur, dur);
    this.shakeT = 0;
  }

  hitStop(ms: number): void {
    this.loop.hitStop(ms);
  }

  scorePop(x: number, y: number, text: string): void {
    this.scorePops.push({ x, y, text, t: 0 });
  }

  // ---- lifecycle ---------------------------------------------------------

  /** Attach input listeners to a focusable element (panel's canvas wrapper). */
  attachInput(target: HTMLElement | ShadowRoot): void {
    this.input.attach(target, (clientX, clientY) => {
      const rect = this._canvas.getBoundingClientRect();
      const sx = this.width / Math.max(1, rect.width);
      const sy = this.height / Math.max(1, rect.height);
      return {
        x: (clientX - rect.left) * sx,
        y: (clientY - rect.top) * sy,
      };
    });
  }

  detachInput(): void {
    this.input.detach();
  }

  setSettings(settings: InterludeSettings): void {
    const old = this.options.settings;
    this.options.settings = settings;
    if (settings.reduceMotion) this.shakeMag = 0;
    if (this.active && this.state === "boot" && (settings.reduceMotion || settings.skipBoot))
      this.setState("ready");
    if (
      settings.muteHidden &&
      !old.muteHidden &&
      typeof document !== "undefined" &&
      document.hidden
    )
      this.sound.silence();
    this.sound.configure(settings.volume, settings.soundPack);
    this.sound.setMuted(
      settings.muted || !!(this.game && settings[`game.${this.game.manifest.id}.muted`]),
    );
    if (
      old.pointerEnabled !== settings.pointerEnabled ||
      old.touchEnabled !== settings.touchEnabled ||
      old.gamepadEnabled !== settings.gamepadEnabled ||
      old.keyRepeat !== settings.keyRepeat
    ) {
      this.input.configure({
        pointer: settings.pointerEnabled,
        touch: settings.touchEnabled,
        gamepad: settings.gamepadEnabled,
        repeat: settings.keyRepeat,
      });
    }
    this.game?.settingsChanged?.();
  }

  setGame(game: ArcadeGame, highScore = 0): void {
    const preservePause = this.active && this.state === "paused";
    this.runVersion++;
    if (this.game) this.game.destroy();
    this.game = game;
    this.sound.setMuted(this.settings.muted || !!this.settings[`game.${game.manifest.id}.muted`]);
    this.rngState = new RNG(randomSeed());
    this.particles.clear();
    this.scorePops = [];
    this.recordedBest = false;
    this.hiScore = highScore;
    this.game.init(this);
    this.input.clearActivity();
    this.scenes.reset("ready");
    if (preservePause) {
      this.stateBeforePause = "ready";
      this.setState("paused", this.pauseReason);
    } else this.options.onStateChange?.("ready");
    this.input.setPointerPrimary(
      ["flappy", "dashline", "breakout", "rockfall"].includes(game.manifest.id),
    );
    this.bootT = 0;
    if (this.active) this.render(0);
  }

  get isLoopRunning(): boolean {
    return this.loop.isRunning;
  }
  get isLowRate(): boolean {
    return this.loop.isLowRate;
  }

  getState(): EngineState {
    return this.state;
  }

  private setState(state: EngineState, reason?: "done" | "user"): void {
    if (state === "paused" && this.state !== "paused") this.scenes.push(state);
    else if (this.state === "paused" && state === this.stateBeforePause) this.scenes.pop();
    else this.scenes.replace(state);
    if (reason) this.pauseReason = reason;
    if (state === "gameover") this.input.clearActivity();
    this.options.onStateChange?.(state);
  }

  /** Input is enabled only when the canvas or a panel control owns focus. */
  setFocused(focused: boolean): void {
    this.focused = focused;
    this.input.setEnabled(this.active && focused);
  }

  /** The caller invokes start inside the reveal animation frame. */
  start(): void {
    if (!this.game) return;
    this.active = true;
    this.input.setEnabled(this.focused);
    if (this.startedBefore) {
      this.game.destroy();
      this.game.init(this);
      this.particles.clear();
      this.scorePops = [];
      this.recordedBest = false;
    }
    this.startedBefore = true;
    this.scenes.reset("ready");
    if (!this.bootPlayed && !this.settings.skipBoot && !this.settings.reduceMotion) {
      this.bootT = 0;
      this.setState("boot");
    } else this.setState("ready");
    this.bootPlayed = true;
    this.firstFrameFired = false;
    // A real canvas frame is painted in the same rAF that reveals the host.
    this.render(0);
    if (this.rafVisible) this.loop.start();
  }

  stop(): void {
    this.active = false;
    this.loop.stop();
    this.input.setEnabled(false);
    this.sound.silence();
  }

  freezeForDone(): void {
    if (!this.active) return;
    if (this.state !== "paused")
      this.stateBeforePause = this.state === "boot" ? "ready" : this.state;
    this.setState("paused", "done");
    this.loop.stop();
    this.sound.silence();
    this.render(1);
  }

  /** Pause a running cabinet without a site-completion message. */
  pauseByUser(): void {
    if (!this.active || this.state !== "playing") return;
    this.stateBeforePause = "playing";
    this.setState("paused", "user");
    this.loop.stop();
    this.sound.silence();
    this.render(1);
  }

  resumeFromDone(): void {
    if (!this.active || this.state !== "paused") return;
    this.setState(this.stateBeforePause);
    this.render(0);
    if (this.rafVisible) this.loop.start();
  }

  /** Tab visibility: hidden → loop pauses entirely. */
  setTabHidden(hidden: boolean): void {
    if (hidden && this.settings.muteHidden) this.sound.silence();
    this.rafVisible = !hidden;
    this.applyRate();
  }

  /** Panel out of view → 30 Hz; in view → 60 Hz. */
  setPanelVisible(visible: boolean): void {
    // An unseen boot is skipped instead of being stretched by low-rate mode.
    if (!visible && this.state === "boot") this.setState("ready");
    this.loop.setLowRate(!visible);
  }

  watchVisibility(host: Element): void {
    this.io?.disconnect();
    this.io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) this.setPanelVisible(entry.isIntersecting);
      },
      { threshold: 0.05 },
    );
    this.io.observe(host);
  }

  unwatchVisibility(): void {
    this.io?.disconnect();
    this.io = null;
  }

  private applyRate(): void {
    if (this.rafVisible && this.active && this.state !== "paused") this.loop.start();
    else this.loop.stop();
  }

  destroy(): void {
    this.stop();
    this.unwatchVisibility();
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }
    this.detachInput();
  }

  // ---- update ------------------------------------------------------------

  private fixedUpdate(dt: number): void {
    this.input.pollGamepads();
    if (this.shakeT < this.shakeDur) this.shakeT += dt;
    else {
      this.shakeMag = 0;
      this.shakeDur = 0;
    }
    for (let i = this.scorePops.length - 1; i >= 0; i--) {
      const pop = this.scorePops[i] as ScorePop;
      pop.t += dt;
      pop.y -= 22 * dt;
      if (pop.t > 0.9) this.scorePops.splice(i, 1);
    }
    this.particles.update(dt);

    switch (this.state) {
      case "boot":
        this.bootT += dt;
        if (this.bootT >= BOOT_SECONDS) this.setState("ready");
        break;
      case "ready": {
        this.game?.updateAttract?.(dt);
        if (this.anyStartPressed()) this.beginRun();
        break;
      }
      case "playing": {
        const id = this.game?.manifest.id;
        const speed =
          id && typeof this.settings[`game.${id}.speed`] === "number"
            ? (this.settings[`game.${id}.speed`] as number)
            : 100;
        const difficulty = id ? this.settings[`game.${id}.difficulty`] : "standard";
        const factor = difficulty === "relaxed" ? 0.8 : difficulty === "fast" ? 1.2 : 1;
        this.game?.fixedUpdate(((dt * speed) / 100) * factor);
        if (this.settings.music) {
          this.musicTime += dt;
          if (this.musicTime >= 0.45) {
            this.musicTime %= 0.45;
            this.sound.musicNote(this.musicIndex++);
          }
        }
        if (this.input.wasPressedWithin("pause", 120, true)) this.pauseByUser();
        break;
      }
      case "paused":
        if (this.input.wasPressedWithin("pause", 120, true)) {
          this.setState("playing");
        }
        break;
      case "gameover": {
        if (this.anyStartPressed()) this.restart();
        break;
      }
    }
  }

  private anyStartPressed(): boolean {
    return this.input.wasAnyPressed(true);
  }

  private beginRun(): void {
    if (!this.game) return;
    this.sound.unlock();
    this.sound.play("ready");
    this.restart();
  }

  private restart(): void {
    if (!this.game) return;
    this.runVersion++;
    this.rngState = new RNG(randomSeed());
    this.particles.clear();
    this.scorePops = [];
    this.recordedBest = false;
    this.game.destroy();
    this.game.init(this);
    this.setState("playing");
  }

  /** Freeze the run immediately; persistence must not hold up game-over. */
  async reportGameOver(): Promise<void> {
    if (!this.game || this.state !== "playing") return;
    const endedGame = this.game;
    const endedRun = this.runVersion;
    const gameId = endedGame.manifest.id;
    const score = endedGame.score;
    this.recordedBest = score > this.hiScore;
    this.hiScore = Math.max(score, this.hiScore);
    this.setState("gameover");
    this.sound.play("gameOver");
    const { best, isRecord } = this.options.preview
      ? { best: this.hiScore, isRecord: this.recordedBest }
      : await saveHighScore(gameId, score);
    if (this.game === endedGame && this.runVersion === endedRun && this.getState() === "gameover") {
      this.hiScore = best;
      this.recordedBest = isRecord;
      this.options.onHighScore?.(best, isRecord);
    }
  }

  get wasRecord(): boolean {
    return this.recordedBest;
  }

  // ---- render ------------------------------------------------------------

  private makeScanPattern(): void {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 4;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = "rgba(0,0,0,0)";
    g.fillRect(0, 0, 4, 4);
    g.fillStyle = "rgba(0,0,0,1)";
    g.fillRect(0, 3, 4, 1);
    this.scanPattern = this._ctx.createPattern(c, "repeat");
  }

  private render(alpha: number): void {
    const ctx = this._ctx;
    const w = this.width;
    const h = this.height;

    // Shake offset
    let ox = 0;
    let oy = 0;
    if (this.shakeMag > 0) {
      const k = 1 - this.shakeT / Math.max(0.001, this.shakeDur);
      const mag = this.shakeMag * Math.max(0, k);
      ox = Math.round((Math.random() * 2 - 1) * mag);
      oy = Math.round((Math.random() * 2 - 1) * mag);
    }

    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(-8, -8, w + 16, h + 16);

    switch (this.state) {
      case "boot":
        this.renderBoot(ctx);
        break;
      case "ready":
        if (this.game?.renderAttract) this.game.renderAttract();
        else this.game?.render(0);
        this.renderReady(ctx);
        break;
      case "playing":
      case "paused":
        this.game?.render(alpha);
        this.renderHud(ctx);
        this.particles.render(ctx);
        this.renderScorePops(ctx);
        if (this.state === "paused") this.renderPaused(ctx);
        break;
      case "gameover":
        this.game?.render(1);
        this.renderHud(ctx);
        this.particles.render(ctx);
        this.renderGameOver(ctx);
        break;
    }

    ctx.restore();
    this.renderCrtPass(ctx);

    if (!this.firstFrameFired) {
      this.firstFrameFired = true;
      this.options.onFirstFrame?.();
    }
  }

  private renderBoot(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const t = this.bootT / BOOT_SECONDS; // 0..1
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, w, h);
    // Horizontal collapse line expanding — the power-on thump.
    const lineH = Math.max(2, Math.round(h * (1 - Math.abs(t - 0.45) * 2.4)));
    ctx.fillStyle = t < 0.5 ? TOKENS.phosphorHot : TOKENS.phosphor;
    const y = Math.round((h - lineH) / 2);
    ctx.fillRect(0, y, w, lineH);
    if (t > 0.55) {
      ctx.globalAlpha = Math.min(1, (t - 0.55) * 2.4);
      ctx.fillStyle = TOKENS.phosphor;
      ctx.font = "32px Silkscreen, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("INTERLUDE", w / 2, h / 2);
      ctx.globalAlpha = 1;
    }
  }

  private renderReady(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    ctx.fillStyle = "rgba(14,11,7,0.72)";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = TOKENS.phosphor;
    ctx.font = "28px Silkscreen, monospace";
    ctx.fillText(this.game?.manifest.name ?? "INTERLUDE", w / 2, 128);
    ctx.font = "16px VT323, monospace";
    ctx.fillStyle = TOKENS.phosphorHot;
    ctx.fillText(`HI-SCORE ${String(this.hiScore).padStart(6, "0")}`, w / 2, 168);
    ctx.fillStyle = TOKENS.phosphor;
    ctx.fillText(this.game?.readyHint ?? "PRESS SPACE TO START", w / 2, 216);
    ctx.fillStyle = TOKENS.phosphorDim;
    ctx.font = '13px "IBM Plex Mono", monospace';
    ctx.fillText("INSERT COIN", w / 2, 258);
  }

  private renderPaused(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    ctx.fillStyle = "rgba(14,11,7,0.72)";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = TOKENS.phosphor;
    ctx.font = "22px Silkscreen, monospace";
    const isDone = this.pauseReason === "done";
    ctx.fillText(
      isDone ? (this.options.doneLabel ?? "CLAUDE IS DONE") : "PAUSED",
      w / 2,
      h / 2 - 8,
    );
    ctx.font = "15px VT323, monospace";
    ctx.fillStyle = TOKENS.phosphorDim;
    ctx.fillText(
      isDone ? "PRESS P OR RESUME — THE ANSWER IS IN" : "PRESS P TO RESUME",
      w / 2,
      h / 2 + 22,
    );
  }

  private renderHud(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    ctx.fillStyle = TOKENS.phosphorHot;
    ctx.font = "13px Silkscreen, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`SCORE ${String(this.game?.score ?? 0).padStart(6, "0")}`, 10, 8);
    ctx.textAlign = "right";
    ctx.fillStyle = TOKENS.phosphorDim;
    ctx.fillText(
      `HI ${String(Math.max(this.hiScore, this.game?.score ?? 0)).padStart(6, "0")}`,
      w - 10,
      8,
    );
    ctx.textBaseline = "alphabetic";
  }

  private renderScorePops(ctx: CanvasRenderingContext2D): void {
    ctx.font = "14px VT323, monospace";
    ctx.textAlign = "center";
    for (const pop of this.scorePops) {
      ctx.globalAlpha = Math.max(0, 1 - pop.t / 0.9);
      ctx.fillStyle = TOKENS.phosphorHot;
      ctx.fillText(pop.text, Math.round(pop.x), Math.round(pop.y));
    }
    ctx.globalAlpha = 1;
  }

  private renderGameOver(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    ctx.fillStyle = "rgba(14,11,7,0.78)";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = TOKENS.signalRed;
    ctx.font = "30px Silkscreen, monospace";
    ctx.fillText("GAME OVER", w / 2, 128);
    ctx.font = "17px VT323, monospace";
    ctx.fillStyle = TOKENS.phosphorHot;
    const finalScore = this.game?.score ?? 0;
    ctx.fillText(`SCORE ${String(finalScore).padStart(6, "0")}`, w / 2, 176);
    if (this.recordedBest) {
      ctx.fillStyle = TOKENS.signalGreen;
      ctx.fillText("★ NEW HI-SCORE ★", w / 2, 202);
    }
    ctx.fillStyle = TOKENS.phosphor;
    ctx.fillText("ANY KEY — RETRY", w / 2, 246);
  }

  /** Scanlines + vignette + faint bloom. Canvas only — never over DOM text. */
  private renderCrtPass(ctx: CanvasRenderingContext2D): void {
    if (this.scanPattern) {
      ctx.save();
      ctx.globalAlpha = this.settings.scanlineStrength / 100;
      ctx.fillStyle = this.scanPattern;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
    // Square-edged vignette bands, kept inside the canvas. No gradients.
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 0, this.width, 8);
    ctx.fillRect(0, this.height - 8, this.width, 8);
    ctx.fillRect(0, 8, 8, this.height - 16);
    ctx.fillRect(this.width - 8, 8, 8, this.height - 16);
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(8, 8, this.width - 16, 8);
    ctx.fillRect(8, this.height - 16, this.width - 16, 8);
    ctx.fillRect(8, 16, 8, this.height - 32);
    ctx.fillRect(this.width - 16, 16, 8, this.height - 32);
    // Faint amber bloom line at top — phosphor character, kept subtle
    ctx.fillStyle = `rgba(255,176,0,${this.settings.bloomStrength / 100})`;
    ctx.fillRect(0, 0, this.width, 26);
  }
}
