import { TOKENS } from "../../../design/tokens";
import { AI_PROFILES, isAIDifficulty, type AIDifficulty } from "../../ai/difficulty";
import {
  applyGrid,
  gridFallback,
  gridMoves,
  gridOutcome,
  initialGrid,
  type GridKind,
  type GridOutcome,
  type GridPosition,
  type GridSearchTask,
  type GridSide,
} from "../../ai/grid-games";
import { searchBoard } from "../../ai/search-client";
import type { SearchResult } from "../../ai/search";
import { getManifest } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext, GameManifest } from "../types";

type Search = (
  task: GridSearchTask,
  canvas: HTMLCanvasElement,
  timeoutMs?: number,
  signal?: AbortSignal,
) => Promise<SearchResult<number>>;
interface Geometry {
  x: number;
  y: number;
  cell: number;
  columns: number;
  rows: number;
}
function geometry(kind: GridKind): Geometry {
  return kind === "drop-four"
    ? { x: 166, y: 45, cell: 44, columns: 7, rows: 6 }
    : { x: 192, y: 49, cell: 32, columns: 8, rows: 8 };
}

/** Shared, single-human-versus-CPU cabinet. Web-only adapters override the turn policy. */
export class GridDuelGame implements ArcadeGame {
  readonly manifest: GameManifest;
  readonly readyHint: string;
  score = 0;
  protected g!: GameContext;
  protected position: GridPosition;
  private legal: number[] = [];
  private outcome: GridOutcome = null;
  private cursor: number;
  private level: AIDifficulty = "regular";
  private abort: AbortController | null = null;
  private version = 0;
  private decision: { move: number; basic: boolean } | null = null;
  private thinkingSeconds = 0;
  private lastMessage = "";
  private basic = false;
  private ended = false;

  constructor(
    readonly kind: GridKind,
    private readonly search: Search = searchBoard,
  ) {
    this.manifest = getManifest(kind === "drop-four" ? "dropfour" : "flipdisc")!;
    this.readyHint =
      kind === "drop-four"
        ? "ARROWS CHOOSE COLUMN · SPACE DROPS"
        : "ARROWS SELECT · SPACE PLACES DISC";
    this.position = initialGrid(kind);
    this.cursor = kind === "drop-four" ? 3 : 19;
  }
  get recordsAllowed(): boolean {
    return true;
  }
  get resultLabel(): string | undefined {
    if (!this.ended) return undefined;
    return this.outcome === 0 ? "DRAW" : `${this.sideName(this.outcome as GridSide)} WINS`;
  }
  protected isCpuTurn(side: GridSide): boolean {
    return side === -1;
  }
  protected sideName(side: GridSide): string {
    return side === 1 ? "YOU" : "CPU";
  }

  init(ctx: GameContext): void {
    this.suspend();
    this.g = ctx;
    this.position = initialGrid(this.kind);
    this.legal = gridMoves(this.kind, this.position);
    this.outcome = null;
    this.cursor = this.kind === "drop-four" ? 3 : (this.legal[0] ?? 19);
    this.level = this.difficulty();
    this.score = 0;
    this.ended = false;
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
    this.thinkingSeconds = 0;
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
    const directions = (["left", "right", "up", "down"] as const).filter((direction) =>
      input.wasPressedWithin(direction, 180, true),
    );
    const confirm = input.wasPressedWithin("primary", 180, true);
    const taps = input.drainTaps();
    input.drainSwipes();
    if (this.legal.length === 1 && this.legal[0] === -1) {
      this.play(-1);
      return;
    }
    if (this.isCpuTurn(this.position.turn)) {
      if (!this.abort && !this.decision) this.beginSearch();
      this.thinkingSeconds += Math.max(0, dt);
      const delay = Math.max(0.18, AI_PROFILES[this.level].reactionSeconds * 1.5);
      if (this.decision && this.thinkingSeconds >= delay) {
        const decision = this.decision;
        this.decision = null;
        this.thinkingSeconds = 0;
        this.play(decision.move, decision.basic);
      }
      return;
    }
    const shape = geometry(this.kind);
    let changed = false;
    for (const direction of directions) {
      const previous = this.cursor;
      if (this.kind === "drop-four") {
        this.cursor = Math.max(
          0,
          Math.min(6, this.cursor + (direction === "left" ? -1 : direction === "right" ? 1 : 0)),
        );
      } else {
        const row = Math.floor(this.cursor / 8),
          col = this.cursor % 8;
        const nextRow = Math.max(
          0,
          Math.min(7, row + (direction === "up" ? -1 : direction === "down" ? 1 : 0)),
        );
        const nextCol = Math.max(
          0,
          Math.min(7, col + (direction === "left" ? -1 : direction === "right" ? 1 : 0)),
        );
        this.cursor = nextRow * 8 + nextCol;
      }
      changed ||= this.cursor !== previous;
    }
    for (const tap of taps) {
      if (
        tap.x < shape.x ||
        tap.x >= shape.x + shape.columns * shape.cell ||
        tap.y < shape.y ||
        tap.y >= shape.y + shape.rows * shape.cell
      )
        continue;
      const col = Math.floor((tap.x - shape.x) / shape.cell);
      const row = Math.floor((tap.y - shape.y) / shape.cell);
      this.cursor = this.kind === "drop-four" ? col : row * 8 + col;
      if (this.play(this.cursor)) return;
      this.lastMessage =
        this.kind === "drop-four" ? "That column is full." : "That square is not a legal move.";
      changed = true;
    }
    if (confirm) {
      if (this.play(this.cursor)) return;
      this.lastMessage =
        this.kind === "drop-four" ? "That column is full." : "That square is not a legal move.";
      changed = true;
    }
    if (changed) this.announce();
  }

  private beginSearch(): void {
    const profile = AI_PROFILES[this.level];
    const task: GridSearchTask = {
      kind: this.kind,
      position: this.position,
      depth: Math.min(profile.searchDepth, this.kind === "drop-four" ? 6 : 4),
      maxNodes: 40_000,
    };
    const abort = new AbortController();
    this.abort = abort;
    const version = ++this.version;
    const accept = (result: SearchResult<number> | null): void => {
      if (abort.signal.aborted || version !== this.version || this.ended) return;
      this.abort = null;
      let move = result?.move;
      let basic = false;
      if (!result || !result.complete || typeof move !== "number" || !this.legal.includes(move)) {
        move = gridFallback(this.kind, this.position);
        basic = true;
      }
      if (move === null || move === undefined) return;
      if (this.g.rng.chance(profile.errorChance)) move = this.g.rng.pick(this.legal);
      this.decision = { move, basic };
    };
    void this.search(task, this.g.canvas, 2000, abort.signal).then(accept, () => accept(null));
  }

  private play(move: number, basic?: boolean): boolean {
    if (!this.legal.includes(move)) return false;
    const before = this.position;
    const side = before.turn;
    this.position = applyGrid(this.kind, before, move);
    if (move === -1) {
      this.lastMessage = `${this.sideName(side)} has no legal move and passes.`;
    } else {
      const index =
        this.kind === "drop-four"
          ? this.position.cells.findIndex((value, i) => value !== before.cells[i])
          : move;
      const columns = this.kind === "drop-four" ? 7 : 8;
      this.lastMessage = `${this.sideName(side)} played row ${Math.floor(index / columns) + 1}, column ${(index % columns) + 1}${basic === undefined ? "" : basic ? " using fallback" : " using search"}.`;
      this.g.sound.play("blip");
    }
    if (basic !== undefined) this.basic = basic;
    this.outcome = gridOutcome(this.kind, this.position);
    this.legal = gridMoves(this.kind, this.position);
    if (this.outcome !== null) {
      this.ended = true;
      const remaining = this.position.cells.filter((cell) => cell === 0).length;
      this.score = this.outcome === 1 ? 1000 + remaining * 10 : this.outcome === 0 ? 200 : 0;
      this.announce();
      void this.g.reportGameOver();
    } else this.announce();
    return true;
  }

  private announce(): void {
    if (!this.g) return;
    const columns = this.kind === "drop-four" ? 7 : 8;
    const rows = this.kind === "drop-four" ? 6 : 8;
    const board = Array.from({ length: rows }, (_, row) => {
      const contents = Array.from({ length: columns }, (_, col) => {
        const cell = this.position.cells[row * columns + col];
        return cell === 1 ? "X" : cell === -1 ? "O" : "empty";
      });
      return `row ${row + 1}: ${contents.join(", ")}`;
    }).join("; ");
    const selected =
      this.kind === "drop-four"
        ? `column ${this.cursor + 1}`
        : `row ${Math.floor(this.cursor / 8) + 1}, column ${(this.cursor % 8) + 1}`;
    const turn = this.ended ? this.resultLabel : `${this.sideName(this.position.turn)} turn`;
    const counts =
      this.kind === "flip-disc"
        ? ` X ${this.position.cells.filter((cell) => cell === 1).length}, O ${this.position.cells.filter((cell) => cell === -1).length}.`
        : "";
    this.g.announce?.(
      `${this.manifest.name}. ${this.lastMessage} ${turn}.${!this.ended && !this.isCpuTurn(this.position.turn) ? ` Selected ${selected}.` : ""}${counts} Board: ${board}.`,
    );
  }

  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    const shape = geometry(this.kind);
    for (let row = 0; row < shape.rows; row++)
      for (let col = 0; col < shape.columns; col++) {
        const index = row * shape.columns + col;
        const x = shape.x + col * shape.cell,
          y = shape.y + row * shape.cell;
        const selected =
          !this.ended &&
          !this.isCpuTurn(this.position.turn) &&
          (this.kind === "drop-four" ? col === this.cursor : index === this.cursor);
        ctx.fillStyle = selected ? "#30210A" : "#171209";
        ctx.fillRect(x + 1, y + 1, shape.cell - 2, shape.cell - 2);
        ctx.strokeStyle = selected ? TOKENS.phosphorHot : TOKENS.phosphorDim;
        ctx.lineWidth = selected ? 2 : 1;
        ctx.strokeRect(x + 1.5, y + 1.5, shape.cell - 3, shape.cell - 3);
        const value = this.position.cells[index];
        if (value) {
          ctx.beginPath();
          ctx.arc(x + shape.cell / 2, y + shape.cell / 2, shape.cell * 0.33, 0, Math.PI * 2);
          ctx.fillStyle = value === 1 ? TOKENS.phosphorHot : TOKENS.signalRed;
          ctx.fill();
          drawText(ctx, value === 1 ? "X" : "O", x + shape.cell / 2, y + shape.cell * 0.66, {
            font: `${Math.floor(shape.cell * 0.5)}px monospace`,
            color: TOKENS.ink,
            align: "center",
          });
        } else if (
          this.kind === "flip-disc" &&
          this.legal.includes(index) &&
          !this.isCpuTurn(this.position.turn)
        ) {
          ctx.fillStyle = TOKENS.phosphorDim;
          ctx.fillRect(x + shape.cell / 2 - 2, y + shape.cell / 2 - 2, 4, 4);
        }
      }
    for (const [side, x] of [
      [1, 80],
      [-1, 560],
    ] as const) {
      drawText(ctx, this.sideName(side), x, 160, {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
      drawText(ctx, side === 1 ? "X" : "O", x, 199, {
        font: "32px Silkscreen, monospace",
        color: !this.ended && this.position.turn === side ? TOKENS.phosphorHot : TOKENS.phosphorDim,
        align: "center",
      });
      if (this.kind === "flip-disc")
        drawText(ctx, String(this.position.cells.filter((cell) => cell === side).length), x, 222, {
          font: '13px "IBM Plex Mono", monospace',
          align: "center",
        });
    }
    if (this.basic)
      drawText(ctx, "CPU: BASIC", 560, 245, {
        font: '10px "IBM Plex Mono", monospace',
        color: TOKENS.signalRed,
        align: "center",
      });
    drawText(
      ctx,
      this.ended ? "MATCH COMPLETE" : `${this.sideName(this.position.turn)} / TURN`,
      320,
      331,
      { font: '11px "IBM Plex Mono", monospace', color: TOKENS.phosphorHot, align: "center" },
    );
  }
}
