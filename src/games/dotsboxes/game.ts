import { TOKENS } from "../../../design/tokens";
import { AI_PROFILES, isAIDifficulty, type AIDifficulty } from "../../ai/difficulty";
import {
  applyBoxEdge,
  boxEdges,
  boxMoves,
  boxesOutcome,
  initialBoxes,
  type BoxesPosition,
  type BoxesSearchTask,
  type BoxSide,
} from "../../ai/dots-and-boxes";
import { searchBoard } from "../../ai/search-client";
import type { SearchResult } from "../../ai/search";
import { DOTS_BOXES_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";

const LEFT = 200,
  TOP = 60,
  GAP = 60;
type Search = (
  task: BoxesSearchTask,
  canvas: HTMLCanvasElement,
  timeoutMs?: number,
  signal?: AbortSignal,
) => Promise<SearchResult<number>>;
function edgeShape(edge: number): {
  x: number;
  y: number;
  horizontal: boolean;
  row: number;
  column: number;
} {
  const horizontal = edge < 20,
    index = horizontal ? edge : edge - 20;
  const row = Math.floor(index / (horizontal ? 4 : 5)),
    column = index % (horizontal ? 4 : 5);
  return { x: LEFT + column * GAP, y: TOP + row * GAP, horizontal, row, column };
}
function edgeName(edge: number): string {
  const { row, column, horizontal } = edgeShape(edge);
  return `${horizontal ? "horizontal" : "vertical"} edge, row ${row + 1}, column ${column + 1}`;
}
function nearestEdge(x: number, y: number): number | null {
  let best = -1,
    distance = 13;
  for (let edge = 0; edge < 40; edge++) {
    const shape = edgeShape(edge);
    const dx = shape.horizontal
      ? Math.max(shape.x - x, 0, x - shape.x - GAP)
      : Math.abs(x - shape.x);
    const dy = shape.horizontal
      ? Math.abs(y - shape.y)
      : Math.max(shape.y - y, 0, y - shape.y - GAP);
    const d = Math.hypot(dx, dy);
    if (d < distance) {
      best = edge;
      distance = d;
    }
  }
  return best < 0 ? null : best;
}

/** One human against the CPU. The website supplies its own local-turn policy. */
export class DotsBoxesGame implements ArcadeGame {
  readonly manifest = DOTS_BOXES_MANIFEST;
  readonly readyHint = "ARROWS SELECT EDGE · SPACE DRAWS";
  score = 0;
  protected g!: GameContext;
  private position: BoxesPosition = initialBoxes();
  private cursor = 0;
  private level: AIDifficulty = "regular";
  private ended = false;
  private winner: -1 | 0 | 1 | null = null;
  private abort: AbortController | null = null;
  private decision: { move: number; basic: boolean } | null = null;
  private version = 0;
  private thinking = 0;
  private basic = false;
  private lastMessage = "";
  constructor(private readonly search: Search = searchBoard) {}
  get recordsAllowed(): boolean {
    return true;
  }
  get resultLabel(): string | undefined {
    if (!this.ended) return undefined;
    return this.winner === 0 ? "DRAW" : `${this.sideName(this.winner as BoxSide)} WINS`;
  }
  protected isCpuTurn(side: BoxSide): boolean {
    return side === -1;
  }
  protected sideName(side: BoxSide): string {
    return side === 1 ? "YOU" : "CPU";
  }

  init(ctx: GameContext): void {
    this.suspend();
    this.g = ctx;
    this.position = initialBoxes();
    this.cursor = 0;
    this.level = this.difficulty();
    this.score = 0;
    this.ended = false;
    this.winner = null;
    this.basic = false;
    this.lastMessage = "";
    this.announce();
  }
  destroy(): void {
    this.suspend();
  }
  suspend(): void {
    this.version++;
    this.abort?.abort();
    this.abort = null;
    this.decision = null;
    this.thinking = 0;
  }
  settingsChanged(): void {
    if (!this.g) return;
    const level = this.difficulty();
    if (level !== this.level) this.suspend();
    this.level = level;
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
    const select = input.wasPressedWithin("primary", 180, true);
    const taps = input.drainTaps();
    input.drainSwipes();
    if (this.isCpuTurn(this.position.turn)) {
      if (!this.abort && !this.decision) this.beginSearch();
      this.thinking += Math.max(0, dt);
      if (
        this.decision &&
        this.thinking >= Math.max(0.18, AI_PROFILES[this.level].reactionSeconds * 1.5)
      ) {
        const decision = this.decision;
        this.decision = null;
        this.thinking = 0;
        this.play(decision.move, decision.basic);
      }
      return;
    }
    let changed = false;
    for (const direction of directions) {
      const delta =
        direction === "left" ? -1 : direction === "right" ? 1 : direction === "up" ? -4 : 4;
      const next = Math.max(0, Math.min(39, this.cursor + delta));
      changed ||= next !== this.cursor;
      this.cursor = next;
    }
    for (const tap of taps) {
      const edge = nearestEdge(tap.x, tap.y);
      if (edge === null) continue;
      this.cursor = edge;
      if (this.play(edge)) return;
      this.lastMessage = "That edge is already drawn.";
      changed = true;
    }
    if (select) {
      if (this.play(this.cursor)) return;
      this.lastMessage = "That edge is already drawn.";
      changed = true;
    }
    if (changed) this.announce();
  }
  private beginSearch(): void {
    const profile = AI_PROFILES[this.level];
    const task: BoxesSearchTask = {
      kind: "dots-and-boxes",
      position: this.position,
      depth: Math.min(profile.searchDepth, 4),
      maxNodes: 40_000,
    };
    const abort = new AbortController(),
      version = ++this.version;
    this.abort = abort;
    const accept = (result: SearchResult<number> | null): void => {
      if (abort.signal.aborted || version !== this.version || this.ended) return;
      this.abort = null;
      const legal = boxMoves(this.position);
      let move = result?.move,
        basic = false;
      if (!result || !result.complete || typeof move !== "number" || !legal.includes(move)) {
        move = legal[0] ?? null;
        basic = true;
      }
      if (move === null || move === undefined) return;
      if (this.g.rng.chance(profile.errorChance)) move = this.g.rng.pick(legal);
      this.decision = { move, basic };
    };
    void this.search(task, this.g.canvas, 2000, abort.signal).then(accept, () => accept(null));
  }
  private play(edge: number, basic?: boolean): boolean {
    if (this.position.edges[edge] !== 0) return false;
    const before = this.position,
      side = before.turn;
    this.position = applyBoxEdge(before, edge);
    const captured = this.position.boxes.filter(
      (owner, index) => owner === side && before.boxes[index] === 0,
    ).length;
    this.lastMessage = `${this.sideName(side)} drew ${edgeName(edge)}${basic === undefined ? "" : basic ? " using fallback" : " using search"}.${captured ? ` Completed ${captured} ${captured === 1 ? "box" : "boxes"} and plays again.` : ""}`;
    if (basic !== undefined) this.basic = basic;
    this.g.sound.play("blip");
    this.winner = boxesOutcome(this.position);
    if (this.winner !== null) {
      this.ended = true;
      const own = this.position.boxes.filter((box) => box === 1).length;
      this.score = this.winner === 1 ? 1000 + own * 50 : this.winner === 0 ? 300 : own * 10;
      this.announce();
      void this.g.reportGameOver();
    } else this.announce();
    return true;
  }
  private announce(): void {
    if (!this.g) return;
    const own = this.position.boxes.filter((box) => box === 1).length;
    const other = this.position.boxes.filter((box) => box === -1).length;
    const rows = Array.from(
      { length: 4 },
      (_, row) =>
        `row ${row + 1}: ${Array.from({ length: 4 }, (_, col) => {
          const box = row * 4 + col,
            owner = this.position.boxes[box];
          return owner === 1
            ? "X"
            : owner === -1
              ? "O"
              : `open ${boxEdges(box).filter((edge) => this.position.edges[edge] !== 0).length} sides`;
        }).join(", ")}`,
    ).join("; ");
    const turn = this.ended ? this.resultLabel : `${this.sideName(this.position.turn)} turn`;
    const selected =
      !this.ended && !this.isCpuTurn(this.position.turn)
        ? ` Selected ${edgeName(this.cursor)}, ${this.position.edges[this.cursor] === 0 ? "available" : "already drawn"}.`
        : "";
    this.g.announce?.(
      `DOTS AND BOXES. ${this.lastMessage} ${turn}.${selected} X ${own}, O ${other}. Boxes: ${rows}.`,
    );
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    for (let box = 0; box < 16; box++) {
      const owner = this.position.boxes[box];
      if (!owner) continue;
      const row = Math.floor(box / 4),
        col = box % 4;
      ctx.fillStyle = owner === 1 ? "#4A350C" : "#472019";
      ctx.fillRect(LEFT + col * GAP + 5, TOP + row * GAP + 5, GAP - 10, GAP - 10);
      drawText(ctx, owner === 1 ? "X" : "O", LEFT + (col + 0.5) * GAP, TOP + row * GAP + 41, {
        font: "28px Silkscreen, monospace",
        color: owner === 1 ? TOKENS.phosphorHot : TOKENS.signalRed,
        align: "center",
      });
    }
    for (let edge = 0; edge < 40; edge++) {
      const shape = edgeShape(edge),
        owner = this.position.edges[edge];
      const selected = !this.ended && !this.isCpuTurn(this.position.turn) && edge === this.cursor;
      ctx.fillStyle = selected
        ? TOKENS.phosphorHot
        : owner === 1
          ? TOKENS.phosphor
          : owner === -1
            ? TOKENS.signalRed
            : "#4A3A21";
      const thickness = selected ? 7 : owner ? 5 : 2;
      if (shape.horizontal) ctx.fillRect(shape.x + 2, shape.y - thickness / 2, GAP - 4, thickness);
      else ctx.fillRect(shape.x - thickness / 2, shape.y + 2, thickness, GAP - 4);
    }
    ctx.fillStyle = TOKENS.phosphorHot;
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 5; col++)
        ctx.fillRect(LEFT + col * GAP - 3, TOP + row * GAP - 3, 6, 6);
    for (const [side, x] of [
      [1, 85],
      [-1, 555],
    ] as const) {
      drawText(ctx, this.sideName(side), x, 156, {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
      drawText(ctx, String(this.position.boxes.filter((value) => value === side).length), x, 197, {
        font: "32px Silkscreen, monospace",
        color: TOKENS.phosphorHot,
        align: "center",
      });
    }
    if (this.basic)
      drawText(ctx, "CPU: BASIC", 555, 235, {
        font: '10px "IBM Plex Mono", monospace',
        color: TOKENS.signalRed,
        align: "center",
      });
    drawText(
      ctx,
      this.ended ? "MATCH COMPLETE" : `${this.sideName(this.position.turn)} / TURN`,
      320,
      332,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphorHot, align: "center" },
    );
  }
}
