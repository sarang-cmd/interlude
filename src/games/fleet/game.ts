import { TOKENS } from "../../../design/tokens";
import { AI_PROFILES, isAIDifficulty, type AIDifficulty } from "../../ai/difficulty";
import { fleetTarget } from "../../ai/fleet";
import { FLEET_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import {
  createFleet,
  fireAt,
  fleetDefeated,
  fleetSquare,
  knownShots,
  type FleetBoard,
} from "./logic";
import {
  BOARD_Y,
  CELL,
  drawFleetBoard,
  fleetStatus,
  fleetTitles,
  OWN_X,
  TARGET_X,
} from "./display";

/** A human fleet and an independently placed CPU fleet, all kept in memory. */
export class FleetGame implements ArcadeGame {
  readonly manifest = FLEET_MANIFEST;
  readonly readyHint = "ARROWS AIM · SPACE FIRE · TAP TARGET GRID";
  score = 0;
  private g!: GameContext;
  private own!: FleetBoard;
  private target!: FleetBoard;
  private cursor = 0;
  private turn: 1 | -1 = 1;
  private level: AIDifficulty = "regular";
  private thinking = 0;
  private ended = false;
  private winner: 1 | -1 | null = null;
  private lastMessage = "";
  get recordsAllowed(): boolean {
    return true;
  }
  get resultLabel(): string | undefined {
    return this.ended ? (this.winner === 1 ? "YOU WIN" : "CPU WINS") : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.own = createFleet(ctx.rng);
    this.target = createFleet(ctx.rng);
    this.cursor = 0;
    this.turn = 1;
    this.level = this.difficulty();
    this.thinking = 0;
    this.ended = false;
    this.winner = null;
    this.score = 0;
    this.lastMessage = "Fleets placed automatically.";
    this.announce();
  }
  destroy(): void {
    this.suspend();
  }
  suspend(): void {
    this.thinking = 0;
  }
  settingsChanged(): void {
    if (this.g) this.level = this.difficulty();
  }
  private difficulty(): AIDifficulty {
    return isAIDifficulty(this.g.settings.boardDifficulty)
      ? this.g.settings.boardDifficulty
      : "regular";
  }
  fixedUpdate(dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    const directions = (["left", "right", "up", "down"] as const).filter((key) =>
      input.wasPressedWithin(key, 180, true),
    );
    const fire = input.wasPressedWithin("primary", 180, true);
    const taps = input.drainTaps();
    input.drainSwipes();
    if (this.turn === -1) {
      this.thinking += Math.max(0, dt);
      if (this.thinking >= AI_PROFILES[this.level].reactionSeconds * 2) {
        this.thinking = 0;
        const move = fleetTarget(knownShots(this.own), this.level, this.g.rng);
        if (move !== null) this.shoot(move, -1);
      }
      return;
    }
    let changed = false;
    for (const direction of directions) {
      const row = Math.floor(this.cursor / 10),
        col = this.cursor % 10;
      const r = Math.max(
        0,
        Math.min(9, row + (direction === "up" ? -1 : direction === "down" ? 1 : 0)),
      );
      const c = Math.max(
        0,
        Math.min(9, col + (direction === "left" ? -1 : direction === "right" ? 1 : 0)),
      );
      const next = r * 10 + c;
      changed ||= next !== this.cursor;
      this.cursor = next;
    }
    for (const tap of taps) {
      if (
        tap.x < TARGET_X ||
        tap.x >= TARGET_X + 10 * CELL ||
        tap.y < BOARD_Y ||
        tap.y >= BOARD_Y + 10 * CELL
      )
        continue;
      this.cursor =
        Math.floor((tap.y - BOARD_Y) / CELL) * 10 + Math.floor((tap.x - TARGET_X) / CELL);
      if (this.shoot(this.cursor, 1)) return;
      this.lastMessage = "That target was already fired on.";
      changed = true;
    }
    if (fire) {
      if (this.shoot(this.cursor, 1)) return;
      this.lastMessage = "That target was already fired on.";
      changed = true;
    }
    if (changed) this.announce();
  }
  private shoot(index: number, side: 1 | -1): boolean {
    const shot = fireAt(side === 1 ? this.target : this.own, index);
    if (!shot) return false;
    if (side === 1) this.target = shot.board;
    else this.own = shot.board;
    this.lastMessage = `${side === 1 ? "YOU" : "CPU"} fired at ${fleetSquare(index)}: ${shot.result}.`;
    this.g.sound.play("blip");
    if (fleetDefeated(shot.board)) {
      this.ended = true;
      this.winner = side;
      this.score =
        side === 1 ? Math.max(100, 2500 - this.target.shots.filter(Boolean).length * 10) : 0;
      this.announce();
      void this.g.reportGameOver();
    } else {
      this.turn = side === 1 ? -1 : 1;
      this.announce();
    }
    return true;
  }
  private announce(): void {
    if (!this.g) return;
    const turn = this.ended ? this.resultLabel : this.turn === 1 ? "YOUR TURN" : "CPU TURN";
    this.g.announce?.(
      `FLEET. ${this.lastMessage} ${turn}. ${fleetStatus(this.own, this.target, this.cursor)}`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    fleetTitles(ctx, "YOUR FLEET", "TARGET GRID");
    drawFleetBoard(ctx, this.own, OWN_X, true, null);
    drawFleetBoard(
      ctx,
      this.target,
      TARGET_X,
      false,
      !this.ended && this.turn === 1 ? this.cursor : null,
    );
    drawText(
      ctx,
      this.ended ? "MATCH COMPLETE" : this.turn === 1 ? "YOUR TURN" : "CPU TURN",
      320,
      328,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphorHot, align: "center" },
    );
  }
}
