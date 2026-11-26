/** Website-only FLEET hot-seat. Every turn begins behind an opaque hand-off screen. */
import { TOKENS } from "../../../design/tokens";
import { FLEET_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import { createFleet, fireAt, fleetDefeated, fleetSquare, type FleetBoard } from "./logic";
import {
  BOARD_Y,
  CELL,
  drawFleetBoard,
  fleetStatus,
  fleetTitles,
  OWN_X,
  TARGET_X,
} from "./display";

export class FleetLocalGame implements ArcadeGame {
  readonly manifest = FLEET_MANIFEST;
  readonly readyHint = "PASS DEVICE · REVEAL · AIM AND FIRE";
  readonly score = 0;
  readonly recordsAllowed = false;
  private g!: GameContext;
  private boards!: [FleetBoard, FleetBoard];
  private player: 0 | 1 = 0;
  private cursor = 0;
  private handoff = true;
  private ended = false;
  private winner: 0 | 1 = 0;
  private lastResult = "";
  get resultLabel(): string | undefined {
    return this.ended ? `PLAYER ${this.winner + 1} WINS` : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.boards = [createFleet(ctx.rng), createFleet(ctx.rng)];
    this.player = 0;
    this.cursor = 0;
    this.handoff = true;
    this.ended = false;
    this.winner = 0;
    this.lastResult = "";
    this.announce();
  }
  destroy(): void {
    this.suspend();
  }
  suspend(): void {
    if (this.g && !this.ended) {
      this.handoff = true;
      this.announce();
      // Tab hiding stops the engine loop without another frame. Clear any
      // revealed fleet immediately, before the page can be shown again.
      this.render(0);
    }
  }
  fixedUpdate(_dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    const directions = (["left", "right", "up", "down"] as const).filter((key) =>
      input.wasPressedWithin(key, 180, true),
    );
    const primary = input.wasPressedWithin("primary", 180, true);
    const taps = input.drainTaps();
    input.drainSwipes();
    if (this.handoff) {
      if (primary || taps.length) {
        this.handoff = false;
        this.announce();
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
      if (this.fire()) return;
      this.lastResult = "That target was already fired on.";
      changed = true;
    }
    if (primary) {
      if (this.fire()) return;
      this.lastResult = "That target was already fired on.";
      changed = true;
    }
    if (changed) this.announce();
  }
  private fire(): boolean {
    const opponent = this.player === 0 ? 1 : 0;
    const shot = fireAt(this.boards[opponent], this.cursor);
    if (!shot) return false;
    this.boards[opponent] = shot.board;
    this.g.sound.play("blip");
    this.lastResult = `Previous shot: ${shot.result}.`;
    if (fleetDefeated(shot.board)) {
      this.ended = true;
      this.winner = this.player;
      this.handoff = true;
      this.announce();
      void this.g.reportGameOver();
    } else {
      this.player = opponent;
      this.cursor = 0;
      this.handoff = true;
      this.announce();
    }
    return true;
  }
  private announce(): void {
    if (!this.g) return;
    if (this.ended) {
      this.g.announce?.(`FLEET. ${this.resultLabel}.`);
      return;
    }
    if (this.handoff) {
      this.g.announce?.(
        `FLEET privacy screen. ${this.lastResult} Pass the device to PLAYER ${this.player + 1}. Press Space or tap to reveal.`,
      );
      return;
    }
    const opponent = this.player === 0 ? 1 : 0;
    this.g.announce?.(
      `FLEET. PLAYER ${this.player + 1} turn. ${this.lastResult} ${fleetStatus(this.boards[this.player], this.boards[opponent], this.cursor)}`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    if (this.handoff || this.ended) {
      if (!this.ended) {
        drawText(ctx, "PRIVACY SCREEN", 320, 122, {
          font: "24px Silkscreen, monospace",
          color: TOKENS.phosphorHot,
          align: "center",
        });
        drawText(ctx, `PASS TO PLAYER ${this.player + 1}`, 320, 174, {
          font: '16px "IBM Plex Mono", monospace',
          color: TOKENS.phosphor,
          align: "center",
        });
        drawText(ctx, "SPACE / TAP TO REVEAL", 320, 210, {
          font: '13px "IBM Plex Mono", monospace',
          color: TOKENS.phosphorDim,
          align: "center",
        });
        drawText(ctx, this.lastResult.toUpperCase(), 320, 250, {
          font: '11px "IBM Plex Mono", monospace',
          color: TOKENS.phosphorDim,
          align: "center",
        });
      }
      return;
    }
    const opponent = this.player === 0 ? 1 : 0;
    fleetTitles(ctx, `PLAYER ${this.player + 1} FLEET`, "TARGET GRID");
    drawFleetBoard(ctx, this.boards[this.player], OWN_X, true, null);
    drawFleetBoard(ctx, this.boards[opponent], TARGET_X, false, this.cursor);
    drawText(
      ctx,
      `PLAYER ${this.player + 1} / ${fleetSquare(this.cursor).toUpperCase()}`,
      320,
      328,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphorHot, align: "center" },
    );
  }
}
