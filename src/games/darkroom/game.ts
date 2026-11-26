import { TOKENS } from "../../../design/tokens";
import type { SwipeDirection } from "../../engine/input";
import { gridCellAt, gridCellName } from "../grid-input";
import { DARK_ROOM_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import { createDarkRoom, ROOM_HEIGHT, ROOM_WIDTH, type DarkRoomMap } from "./logic";

const CELL = 28,
  LEFT = 138,
  TOP = 49;
export class DarkRoomGame implements ArcadeGame {
  readonly manifest = DARK_ROOM_MANIFEST;
  readonly readyHint = "ARROWS EXPLORE · FIND KEY AND EXIT";
  score = 0;
  private g!: GameContext;
  private map!: DarkRoomMap;
  private position = 0;
  private seen: boolean[] = [];
  private hasKey = false;
  private moves = 0;
  private ended = false;
  get resultLabel(): string | undefined {
    return this.ended ? "ESCAPED" : undefined;
  }
  init(ctx: GameContext): void {
    this.g = ctx;
    this.map = createDarkRoom(ctx.rng);
    this.position = this.map.start;
    this.seen = Array<boolean>(ROOM_WIDTH * ROOM_HEIGHT).fill(false);
    this.hasKey = false;
    this.moves = 0;
    this.score = 0;
    this.ended = false;
    this.reveal();
    this.announce("Find the key, then the exit.");
  }
  destroy(): void {}
  fixedUpdate(_dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    const directions: SwipeDirection[] = (["left", "right", "up", "down"] as const).filter((key) =>
      input.wasPressedWithin(key, 180, true),
    );
    directions.push(...input.drainSwipes());
    for (const direction of directions) this.move(direction);
    for (const tap of input.drainTaps()) {
      const cell = gridCellAt(tap.x, tap.y, LEFT, TOP, CELL, ROOM_WIDTH, ROOM_HEIGHT);
      if (cell === null) continue;
      const delta = cell - this.position;
      if (delta === -1 && Math.floor(cell / ROOM_WIDTH) === Math.floor(this.position / ROOM_WIDTH))
        this.move("left");
      else if (
        delta === 1 &&
        Math.floor(cell / ROOM_WIDTH) === Math.floor(this.position / ROOM_WIDTH)
      )
        this.move("right");
      else if (delta === -ROOM_WIDTH) this.move("up");
      else if (delta === ROOM_WIDTH) this.move("down");
      else this.announce("Tap a neighboring square.");
    }
  }
  private move(direction: SwipeDirection): void {
    const delta =
      direction === "left"
        ? -1
        : direction === "right"
          ? 1
          : direction === "up"
            ? -ROOM_WIDTH
            : ROOM_WIDTH;
    const next = this.position + delta;
    if (next < 0 || next >= this.map.walls.length || this.map.walls[next]) {
      this.announce(`Wall ${direction}.`);
      return;
    }
    this.position = next;
    this.moves++;
    this.reveal();
    this.g.sound.play("blip");
    let message = "Moved.";
    if (next === this.map.key && !this.hasKey) {
      this.hasKey = true;
      message = "Key found.";
      this.g.sound.play("coin");
    }
    if (next === this.map.exit) {
      if (this.hasKey) {
        this.ended = true;
        this.score = Math.max(1000, 5000 - this.moves * 10);
        this.announce("The exit is open. Escaped!");
        void this.g.reportGameOver();
        return;
      }
      message = "Exit found, but it is locked. Find the key.";
    }
    this.announce(message);
  }
  private reveal(): void {
    const row = Math.floor(this.position / ROOM_WIDTH),
      col = this.position % ROOM_WIDTH;
    for (let i = 0; i < this.seen.length; i++)
      if (Math.abs(Math.floor(i / ROOM_WIDTH) - row) + Math.abs((i % ROOM_WIDTH) - col) <= 2)
        this.seen[i] = true;
  }
  private announce(message: string): void {
    const open = (
      [
        [-1, "left"],
        [1, "right"],
        [-ROOM_WIDTH, "up"],
        [ROOM_WIDTH, "down"],
      ] as const
    )
      .filter(([delta]) => !this.map.walls[this.position + delta])
      .map(([, label]) => label)
      .join(", ");
    this.g.announce?.(
      `DARK ROOM. ${message} You are at ${gridCellName(this.position, ROOM_WIDTH)}. Open passages: ${open || "none"}. ${this.hasKey ? "Key held." : "Key not found."} ${this.moves} moves.`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    const playerRow = Math.floor(this.position / ROOM_WIDTH),
      playerCol = this.position % ROOM_WIDTH;
    for (let i = 0; i < this.map.walls.length; i++) {
      if (!this.seen[i]) continue;
      const row = Math.floor(i / ROOM_WIDTH),
        col = i % ROOM_WIDTH,
        x = LEFT + col * CELL,
        y = TOP + row * CELL;
      const lit = Math.abs(row - playerRow) + Math.abs(col - playerCol) <= 2;
      ctx.fillStyle = this.map.walls[i]
        ? lit
          ? "#60471C"
          : "#312514"
        : lit
          ? "#2B2113"
          : "#171209";
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      if (i === this.position)
        drawText(ctx, "@", x + CELL / 2, y + 21, {
          font: "17px Silkscreen, monospace",
          color: TOKENS.phosphorHot,
          align: "center",
        });
      else if (i === this.map.key && !this.hasKey)
        drawText(ctx, "K", x + CELL / 2, y + 21, {
          font: "15px Silkscreen, monospace",
          color: TOKENS.phosphorHot,
          align: "center",
        });
      else if (i === this.map.exit)
        drawText(ctx, "X", x + CELL / 2, y + 21, {
          font: "15px Silkscreen, monospace",
          color: TOKENS.phosphor,
          align: "center",
        });
    }
    drawText(
      ctx,
      `${this.hasKey ? "KEY FOUND" : "FIND THE KEY"} · ${this.moves} MOVES · X EXIT`,
      320,
      330,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphor, align: "center" },
    );
  }
}
