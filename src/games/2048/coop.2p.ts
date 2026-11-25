/** Website-only shared-board 2048. Both players take turns on the same game. */
import { TOKENS } from "../../../design/tokens";
import type { ArcadeGame, GameContext } from "../types";
import { TWENTY48_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import { Game2048, type Direction } from "./logic";
import { raceActions, type RaceAction } from "../../twoplayer/race-settings";
import {
  copyCoopSettings,
  defaultCoopSettings,
  validCoopSettings,
  type CoopResult,
  type CoopSettings,
} from "../../twoplayer/coop-settings";

type Player = 0 | 1;
type CoopAction = Exclude<RaceAction, "primary">;
interface Command {
  player: Player;
  action: CoopAction;
}
export interface CoopProgress {
  names: [string, string];
  turn: Player;
  score: number;
  bestTile: number;
  goal: number;
  moves: number;
  remaining: number;
  undos: number;
}

const CELL = 66;
const GAP = 8;
const BOARD = 4 * CELL + 5 * GAP;
const X = Math.round((640 - BOARD) / 2);
const Y = 27;
const TILE_COLORS: Record<number, string> = {
  2: "#1E1810",
  4: "#26200F",
  8: "#3A2B0E",
  16: "#54401A",
  32: "#7A5600",
  64: "#9A6B00",
  128: "#B88100",
  256: "#D69A00",
  512: "#FFB000",
  1024: "#FFC545",
  2048: "#FFD36B",
};

export class Coop2048Game implements ArcadeGame {
  readonly manifest = TWENTY48_MANIFEST;
  readonly recordsAllowed = false;
  readonly readyHint = "SHARED BOARD · TAKE TURNS · P PAUSES";
  onProgress: ((progress: CoopProgress) => void) | null = null;
  onResult: ((result: CoopResult) => void) | null = null;
  onMessage: ((message: string) => void) | null = null;

  private g!: GameContext;
  private logic!: Game2048;
  private settings = defaultCoopSettings();
  private round = copyCoopSettings(this.settings);
  private turn: Player = 0;
  private commands: Command[] = [];
  private elapsed = 0;
  private moves = 0;
  private completed = 0;
  private seed = 0;
  private finished = false;
  private started = false;
  private result: CoopResult | null = null;
  private previousPadActions: [Set<CoopAction>, Set<CoopAction>] = [new Set(), new Set()];
  private padSlots: [number | null, number | null] = [null, null];
  private progressKey = "";

  get score(): number {
    return this.logic?.score ?? 0;
  }
  get resultLabel(): string | undefined {
    if (!this.result) return undefined;
    return `${this.result.won ? "TEAM WINS" : "ROUND ENDS"} · ${this.result.score} PTS`;
  }

  configureLocal(settings: CoopSettings): void {
    if (!validCoopSettings(settings)) throw new Error("Invalid co-op settings");
    this.settings = copyCoopSettings(settings);
    this.commands = [];
  }
  resetSession(): void {
    this.completed = 0;
  }

  init(ctx: GameContext): void {
    this.g = ctx;
    this.round = copyCoopSettings(this.settings);
    this.seed = (this.round.seed + this.completed) >>> 0;
    this.logic = new Game2048({ seed: this.seed, undoLimit: this.round.undos });
    this.turn = 0;
    this.elapsed = 0;
    this.moves = 0;
    this.finished = false;
    this.started = false;
    this.result = null;
    this.progressKey = "";
    this.previousPadActions = [new Set(), new Set()];
    this.padSlots = [null, null];
    if (!ctx.input.isEnabled) this.commands = [];
    ctx.canvas.addEventListener("keydown", this.onKeyDown, true);
    ctx.canvas.addEventListener("blur", this.onBlur);
  }

  destroy(): void {
    if (this.g) {
      this.g.canvas.removeEventListener("keydown", this.onKeyDown, true);
      this.g.canvas.removeEventListener("blur", this.onBlur);
    }
    this.previousPadActions = [new Set(), new Set()];
    // Keep a start gesture queued across the engine's synchronous restart.
  }

  fixedUpdate(dt: number): void {
    if (this.finished) return;
    this.started = true;
    if (this.g.input.isEnabled) this.pollGamepads();
    else this.onBlur();
    const step = Math.max(0, Math.min(dt, this.round.seconds - this.elapsed));
    this.elapsed += step;
    while (this.commands.length && !this.finished) {
      const command = this.commands.shift()!;
      if (command.player !== this.turn) {
        this.onMessage?.(`${this.round.names[this.turn]} moves next.`);
        continue;
      }
      if (command.action === "secondary") {
        if (this.logic.undo()) {
          this.turn = this.turn === 0 ? 1 : 0;
          this.moves = Math.max(0, this.moves - 1);
          this.g.sound.play("undo");
        }
        continue;
      }
      const result = this.logic.move(command.action as Direction);
      if (result.moved) {
        this.moves++;
        this.turn = this.turn === 0 ? 1 : 0;
        this.g.sound.play(result.gained ? "coin" : "blip");
      }
      if (this.logic.bestTile >= this.round.goal || !this.logic.alive) {
        this.reportProgress();
        this.finish(this.logic.bestTile >= this.round.goal);
      }
    }
    if (!this.finished) {
      this.reportProgress();
      if (this.elapsed >= this.round.seconds) this.finish(false);
    }
  }

  private progress(): CoopProgress {
    return {
      names: [...this.round.names],
      turn: this.turn,
      score: this.logic.score,
      bestTile: this.logic.bestTile,
      goal: this.round.goal,
      moves: this.moves,
      remaining: Math.max(0, Math.ceil(this.round.seconds - this.elapsed)),
      undos: this.logic.undoRemaining,
    };
  }
  private reportProgress(): void {
    const progress = this.progress();
    const key = `${progress.turn}:${progress.score}:${progress.bestTile}:${progress.moves}:${progress.remaining}:${progress.undos}`;
    if (key === this.progressKey) return;
    this.progressKey = key;
    this.onProgress?.(progress);
  }
  private finish(won: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.commands = [];
    this.result = {
      playedAt: Date.now(),
      names: [...this.round.names],
      won,
      score: this.logic.score,
      bestTile: this.logic.bestTile,
      goal: this.round.goal,
      moves: this.moves,
      seconds: Math.round(this.elapsed * 100) / 100,
      seed: this.seed,
    };
    this.completed++;
    this.onResult?.(this.result);
    void this.g.reportGameOver();
  }

  render(): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    ctx.fillStyle = "#141009";
    ctx.fillRect(X, Y, BOARD, BOARD);
    ctx.strokeStyle = TOKENS.phosphorDim;
    ctx.strokeRect(X + 0.5, Y + 0.5, BOARD - 1, BOARD - 1);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const value = this.logic.grid[row]?.[col] ?? 0;
        const x = X + GAP + col * (CELL + GAP);
        const y = Y + GAP + row * (CELL + GAP);
        ctx.fillStyle = value ? (TILE_COLORS[value] ?? TOKENS.phosphorHot) : TOKENS.ink;
        ctx.fillRect(x, y, CELL, CELL);
        if (value) {
          ctx.strokeStyle = value >= 512 ? TOKENS.phosphorHot : "rgba(0,0,0,0.45)";
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
          const size = value < 100 ? 24 : value < 1000 ? 20 : 15;
          drawText(ctx, String(value), x + CELL / 2, y + CELL / 2 + size / 3, {
            font: `${size}px Silkscreen, monospace`,
            color: value >= 128 ? TOKENS.ink : TOKENS.phosphorHot,
            align: "center",
          });
        }
      }
    }
    const progress = this.progress();
    const text = (value: string, x: number, y: number, hot = false): void => {
      drawText(ctx, value, x, y, {
        font: hot ? "15px VT323, monospace" : '11px "IBM Plex Mono", monospace',
        color: hot ? TOKENS.phosphorHot : TOKENS.phosphor,
        align: "center",
      });
    };
    text("NEXT TURN", 84, 91);
    text(progress.names[progress.turn].toUpperCase(), 84, 111, true);
    text(`MOVES ${progress.moves}`, 84, 142);
    text(`UNDO ${progress.undos}`, 84, 163);
    text(`GOAL ${progress.goal}`, 555, 91);
    text(`TILE ${progress.bestTile}`, 555, 112, true);
    text(`TIME ${progress.remaining}`, 555, 142);
    text("TEAM PLAY", 555, 163);
  }

  /** Turn-based controls accept one keydown or accessible button activation. */
  pressControl(player: Player, action: CoopAction): void {
    if (!this.g.input.isEnabled) return;
    if (this.started && !this.finished && player !== this.turn) {
      this.onMessage?.(`${this.round.names[this.turn]} moves next.`);
      return;
    }
    // The engine may synchronously restart after a result. Queue the command
    // after the gesture so the new round receives the first move.
    this.g.input.virtualDown("confirm", "coop-start");
    this.g.input.virtualUp("confirm", "coop-start");
    if (this.commands.length < 16) this.commands.push({ player, action });
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.g.input.isEnabled || event.altKey || event.ctrlKey || event.metaKey) return;
    for (const player of [0, 1] as const) {
      for (const [action] of raceActions("twenty48")) {
        if (action === "primary" || this.settings.keys[player][action] !== event.code) continue;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) this.pressControl(player, action);
        return;
      }
    }
  };
  private onBlur = (): void => {
    this.commands = [];
    this.previousPadActions = [new Set(), new Set()];
  };
  private pollGamepads(): void {
    const pads =
      this.g.settings.gamepadEnabled && typeof navigator.getGamepads === "function"
        ? Array.from(navigator.getGamepads())
        : [];
    for (const player of [0, 1] as const) {
      if (this.padSlots[player] !== null) continue;
      const slot = pads.findIndex(
        (pad, index) => !!pad?.connected && !this.padSlots.includes(index),
      );
      if (slot >= 0) this.padSlots[player] = slot;
    }
    for (const player of [0, 1] as const) {
      const slot = this.padSlots[player];
      const candidate = slot === null ? null : pads[slot];
      const pad = candidate?.connected ? candidate : null;
      const next = new Set<CoopAction>();
      if (pad) {
        if ((pad.axes[0] ?? 0) < -0.45 || pad.buttons[14]?.pressed) next.add("left");
        if ((pad.axes[0] ?? 0) > 0.45 || pad.buttons[15]?.pressed) next.add("right");
        if ((pad.axes[1] ?? 0) < -0.45 || pad.buttons[12]?.pressed) next.add("up");
        if ((pad.axes[1] ?? 0) > 0.45 || pad.buttons[13]?.pressed) next.add("down");
        if (pad.buttons[1]?.pressed) next.add("secondary");
      }
      for (const action of next) {
        if (!this.previousPadActions[player].has(action) && this.commands.length < 16)
          this.commands.push({ player, action });
      }
      this.previousPadActions[player] = next;
    }
  }
}
