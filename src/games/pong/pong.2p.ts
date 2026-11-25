import { PongGame } from "./game";
import { PongLogic } from "./logic";
import { RNG } from "../../shared/rng";
import type { GameContext } from "../types";
import {
  bindingError,
  defaultLocalPongSettings,
  type LocalPongSettings,
} from "../../twoplayer/pong-settings";

export type PaddleDirection = "up" | "down";
export interface LocalPongResult {
  winner: 1 | 2;
  scores: [number, number];
}

/** Browser-only local match. The shared renderer and ball rules stay unchanged. */
export class PongLocalGame extends PongGame {
  private local = defaultLocalPongSettings();
  private held = { up: new Set<string>(), down: new Set<string>() };
  private pendingMove = 0;
  private completedRounds = 0;
  onResult: ((result: LocalPongResult) => void) | null = null;

  constructor() {
    super(false);
  }

  override get recordsAllowed(): boolean {
    // Human match records use a separate website-only store.
    return false;
  }

  override get resultLabel(): string | undefined {
    if (this.logic.alive || !this.logic.winner) return undefined;
    const name = this.logic.winner === "player" ? this.leftLabel : this.rightLabel;
    return `${name} WINS · ${this.logic.playerScore} / ${this.logic.aiScore}`;
  }

  configureLocal(settings: LocalPongSettings): void {
    if (bindingError(settings.keys)) throw new Error("Conflicting keys");
    this.local = {
      names: [...settings.names],
      keys: { ...settings.keys },
      speeds: [...settings.speeds],
      bestOf: settings.bestOf,
      seed: settings.seed,
    };
    this.clearSecond();
    this.updateReadyHint();
    if (this.g) this.configureFirstInput();
  }

  protected override createLogic(ctx: GameContext): PongLogic {
    const initial = new RNG(this.local.seed).chance(0.5) ? 1 : -1;
    const direction = this.completedRounds % 2 === 0 ? initial : -initial;
    return new PongLogic({
      seed: this.local.seed,
      initialDirection: direction as 1 | -1,
      firstTo: ctx.settings.pongFirstTo,
      difficulty: ctx.settings.pongDifficulty,
    });
  }

  resetSeries(): void {
    this.completedRounds = 0;
  }

  override init(ctx: GameContext): void {
    super.init(ctx);
    this.updateReadyHint();
    this.clearSecond();
    this.configureFirstInput();
    this.logic.opponentDriver = (dt, y) => this.driveSecond(dt, y);
    ctx.canvas.addEventListener("keydown", this.onKeyDown, true);
    ctx.canvas.addEventListener("keyup", this.onKeyUp, true);
    ctx.canvas.addEventListener("blur", this.clearSecond);
  }

  override destroy(): void {
    if (this.g) {
      this.g.canvas.removeEventListener("keydown", this.onKeyDown, true);
      this.g.canvas.removeEventListener("keyup", this.onKeyUp, true);
      this.g.canvas.removeEventListener("blur", this.clearSecond);
      this.g.input.setKeymapOverrides({});
    }
    this.clearSecond();
    super.destroy();
  }

  override fixedUpdate(dt: number): void {
    const wasAlive = this.logic.alive;
    super.fixedUpdate(dt);
    if (wasAlive && !this.logic.alive && this.logic.winner) {
      this.completedRounds++;
      this.onResult?.({
        winner: this.logic.winner === "player" ? 1 : 2,
        scores: [this.logic.playerScore, this.logic.aiScore],
      });
    }
  }

  protected override movePlayer(dt: number): void {
    const input = this.g.input;
    const up = input.isDown("up");
    const down = input.isDown("down");
    if (up) input.consumePresses("up");
    if (down) input.consumePresses("down");
    const direction = Number(down) - Number(up);
    if (direction) this.logic.nudgePlayer(direction * 430 * (this.local.speeds[0] / 100) * dt);
    else if (input.wasPressedWithin("up", 120, true)) this.logic.nudgePlayer(-24);
    else if (input.wasPressedWithin("down", 120, true)) this.logic.nudgePlayer(24);
  }

  protected override get leftLabel(): string {
    return this.local.names[0].toUpperCase();
  }
  protected override get rightLabel(): string {
    return this.local.names[1].toUpperCase();
  }
  protected override get statusLine(): string {
    return `LOCAL MATCH · FIRST TO ${this.logic.firstTo}`;
  }

  setSecond(direction: PaddleDirection, pressed: boolean, source: string): void {
    if (pressed) this.held[direction].add(source);
    else this.held[direction].delete(source);
  }
  tapSecond(direction: PaddleDirection): void {
    this.pendingMove += direction === "up" ? -24 : 24;
  }
  startGesture(source: string): void {
    this.g.input.virtualDown("confirm", source);
    this.g.input.virtualUp("confirm", source);
  }

  private updateReadyHint(): void {
    const key = (code: string): string =>
      code
        .replace(/^Key/, "")
        .replace(/^Arrow/, "")
        .toUpperCase();
    this.readyHint = `P1 ${key(this.local.keys.p1Up)}/${key(this.local.keys.p1Down)} · P2 ${key(this.local.keys.p2Up)}/${key(this.local.keys.p2Down)}`;
  }
  private configureFirstInput(): void {
    this.g.input.setKeymapOverrides({
      up: this.local.keys.p1Up,
      down: this.local.keys.p1Down,
      pause: "KeyP",
    });
  }
  private clearSecond = (): void => {
    this.held.up.clear();
    this.held.down.clear();
    this.pendingMove = 0;
  };
  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.g.input.isEnabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const action =
      event.code === this.local.keys.p2Up
        ? "up"
        : event.code === this.local.keys.p2Down
          ? "down"
          : null;
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) this.g.input.virtualDown("confirm", `p2:${event.code}`);
    this.setSecond(action, true, `key:${event.code}`);
  };
  private onKeyUp = (event: KeyboardEvent): void => {
    const action =
      event.code === this.local.keys.p2Up
        ? "up"
        : event.code === this.local.keys.p2Down
          ? "down"
          : null;
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.g.input.virtualUp("confirm", `p2:${event.code}`);
    this.setSecond(action, false, `key:${event.code}`);
  };
  private driveSecond(dt: number, currentY: number): number {
    if (!this.g.input.isEnabled) return currentY;
    let up = this.held.up.size > 0;
    let down = this.held.down.size > 0;
    if (this.g.settings.gamepadEnabled && typeof navigator.getGamepads === "function") {
      const pads = Array.from(navigator.getGamepads()).filter((pad) => pad?.connected);
      const pad = pads[1];
      if (pad) {
        up ||= (pad.axes[1] ?? 0) < -0.45 || !!pad.buttons[12]?.pressed;
        down ||= (pad.axes[1] ?? 0) > 0.45 || !!pad.buttons[13]?.pressed;
      }
    }
    const movement = (Number(down) - Number(up)) * 430 * (this.local.speeds[1] / 100) * dt;
    const pending = this.pendingMove;
    this.pendingMove = 0;
    return currentY + movement + pending;
  }
}
