import { TOKENS } from "../../../design/tokens";
import { AI_PROFILES, isAIDifficulty, type AIDifficulty } from "../../ai/difficulty";
import { searchThree } from "../../ai/search-client";
import type { SearchResult } from "../../ai/search";
import type { ThreeSearchTask } from "../../ai/three-in-row";
import { TICTACTOE_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";
import { tacticalFallback, TicTacToeLogic, type Mark } from "./logic";

const CELL = 86;
const BOARD = 3 * CELL;
const X = (640 - BOARD) / 2;
const Y = 49;
type Search = (
  task: ThreeSearchTask,
  canvas: HTMLCanvasElement,
  timeoutMs?: number,
  signal?: AbortSignal,
) => Promise<SearchResult<number>>;
type Decision = { move: number; source: "search" | "fallback" };

/** One human X against O, or two CPUs in watch mode. */
export class TicTacToeGame implements ArcadeGame {
  readonly manifest = TICTACTOE_MANIFEST;
  readyHint = "ARROWS MOVE · SPACE MARK · TAP A CELL";
  score = 0;
  protected g!: GameContext;
  protected logic = new TicTacToeLogic();
  private cursor = 4;
  private automatedRun = false;
  private ended = false;
  private searchVersion = 0;
  private searchAbort: AbortController | null = null;
  private decision: Decision | null = null;
  private thinkingSeconds = 0;
  private currentDifficulty: AIDifficulty = "regular";
  private currentWatch = false;
  private lastMessage = "";
  private lastCpuSource: Decision["source"] | null = null;

  constructor(
    private readonly watchOverride?: boolean,
    private readonly search: Search = searchThree,
  ) {}

  get recordsAllowed(): boolean {
    return !this.automatedRun;
  }
  get resultLabel(): string | undefined {
    if (!this.ended) return undefined;
    if (this.logic.outcome === "draw") return "DRAW";
    const side: Mark = this.logic.outcome === "x" ? 1 : -1;
    return `${this.sideName(side)} WINS`;
  }
  protected get watching(): boolean {
    return this.watchOverride ?? this.g.settings.tictactoeWatch;
  }
  protected isCpuTurn(side: Mark): boolean {
    return this.watching || side === -1;
  }
  protected sideName(side: Mark): string {
    if (this.watching) return side === 1 ? "CPU X" : "CPU O";
    return side === 1 ? "YOU / X" : "CPU / O";
  }

  init(ctx: GameContext): void {
    this.suspend();
    this.g = ctx;
    this.logic = new TicTacToeLogic();
    this.cursor = 4;
    this.ended = false;
    this.score = 0;
    this.currentDifficulty = this.level();
    this.currentWatch = this.watching;
    this.automatedRun = this.currentWatch;
    this.lastMessage = "";
    this.lastCpuSource = null;
    this.updateReadyHint();
    this.announce();
  }
  destroy(): void {
    this.suspend();
  }
  suspend(): void {
    this.searchVersion++;
    this.searchAbort?.abort();
    this.searchAbort = null;
    this.decision = null;
    this.thinkingSeconds = 0;
  }
  settingsChanged(): void {
    if (!this.g) return;
    const level = this.level();
    const watch = this.watching;
    if (watch) this.automatedRun = true;
    if (this.currentDifficulty !== level || this.currentWatch !== watch) this.suspend();
    this.currentDifficulty = level;
    this.currentWatch = watch;
    this.updateReadyHint();
    this.announce();
  }
  private level(): AIDifficulty {
    return isAIDifficulty(this.g.settings.tictactoeDifficulty)
      ? this.g.settings.tictactoeDifficulty
      : "regular";
  }
  private updateReadyHint(): void {
    this.readyHint = this.watching
      ? "WATCH CPU · P PAUSES · NO RECORDS"
      : "ARROWS MOVE · SPACE MARK · TAP A CELL";
  }

  fixedUpdate(dt: number): void {
    if (this.ended) return;
    const input = this.g.input;
    // Always drain input, even during a CPU turn. A late press must not place
    // a mark when the human's turn arrives.
    const directions = (["left", "right", "up", "down"] as const).filter((direction) =>
      input.wasPressedWithin(direction, 180, true),
    );
    const mark = input.wasPressedWithin("primary", 180, true);
    const taps = input.drainTaps();
    input.drainSwipes();
    const turn = this.logic.position.turn;
    if (this.isCpuTurn(turn)) {
      if (!this.searchAbort && !this.decision) this.beginSearch();
      this.thinkingSeconds += Math.max(0, dt);
      const delay = Math.max(0.18, AI_PROFILES[this.currentDifficulty].reactionSeconds * 1.5);
      if (this.decision && this.thinkingSeconds >= delay) {
        const decision = this.decision;
        this.decision = null;
        this.thinkingSeconds = 0;
        this.play(decision.move, decision.source);
      }
      return;
    }
    let changed = false;
    for (const direction of directions) {
      const row = Math.floor(this.cursor / 3);
      const column = this.cursor % 3;
      const nextRow = Math.max(
        0,
        Math.min(2, row + (direction === "down" ? 1 : direction === "up" ? -1 : 0)),
      );
      const nextColumn = Math.max(
        0,
        Math.min(2, column + (direction === "right" ? 1 : direction === "left" ? -1 : 0)),
      );
      const next = nextRow * 3 + nextColumn;
      changed ||= next !== this.cursor;
      this.cursor = next;
    }
    for (const tap of taps) {
      if (tap.x < X || tap.x >= X + BOARD || tap.y < Y || tap.y >= Y + BOARD) continue;
      this.cursor = Math.floor((tap.y - Y) / CELL) * 3 + Math.floor((tap.x - X) / CELL);
      if (this.play(this.cursor)) return;
      this.lastMessage = "That square is occupied.";
      changed = true;
    }
    if (mark) {
      if (this.play(this.cursor)) return;
      this.lastMessage = "That square is occupied.";
      changed = true;
    }
    if (changed) this.announce();
  }

  private beginSearch(): void {
    const position = this.logic.position;
    const level = this.currentDifficulty;
    const profile = AI_PROFILES[level];
    const task: ThreeSearchTask = {
      kind: "three-in-row",
      position,
      method: "minimax",
      depth: profile.searchDepth,
      maxNodes: 100_000,
      simulations: profile.simulations,
      seed: Math.floor(this.g.rng.next() * 0x100000000),
    };
    const controller = new AbortController();
    const version = ++this.searchVersion;
    this.searchAbort = controller;
    // Keep the previous move announcement available while the CPU thinks.
    const accept = (result: SearchResult<number> | null): void => {
      if (controller.signal.aborted || version !== this.searchVersion || this.ended) return;
      this.searchAbort = null;
      const legal = this.logic.legalMoves;
      let move = result?.move;
      let source: Decision["source"] = "search";
      if (!result || !result.complete || typeof move !== "number" || !legal.includes(move)) {
        move = tacticalFallback(this.logic.position);
        source = "fallback";
      }
      if (move === null || move === undefined) return;
      if (this.g.rng.chance(profile.errorChance)) move = this.g.rng.pick(legal);
      this.decision = { move, source };
    };
    void this.search(task, this.g.canvas, 2000, controller.signal).then(accept, () => accept(null));
  }

  private play(index: number, source?: Decision["source"]): boolean {
    const side = this.logic.position.turn;
    if (!this.logic.move(index)) return false;
    const row = Math.floor(index / 3) + 1;
    const column = (index % 3) + 1;
    if (source) this.lastCpuSource = source;
    this.lastMessage = `${this.sideName(side)} played row ${row}, column ${column}${source ? ` using ${source}` : ""}.`;
    this.g.sound.play("blip");
    if (this.logic.outcome !== "playing") {
      this.ended = true;
      const empty = this.logic.position.cells.filter((cell) => cell === 0).length;
      this.score =
        this.logic.outcome === "x" ? 1000 + empty * 50 : this.logic.outcome === "draw" ? 200 : 0;
      this.announce();
      void this.g.reportGameOver();
    } else this.announce();
    return true;
  }

  private announce(): void {
    if (!this.g) return;
    const position = this.logic.position;
    const cell = (index: number): string =>
      position.cells[index] === 1 ? "X" : position.cells[index] === -1 ? "O" : "empty";
    const board = [0, 1, 2]
      .map((row) => `row ${row + 1}: ${[0, 1, 2].map((col) => cell(row * 3 + col)).join(", ")}`)
      .join("; ");
    const turn = this.ended
      ? (this.resultLabel ?? "Game over")
      : `${this.sideName(position.turn)} turn`;
    const selected =
      !this.ended && !this.isCpuTurn(position.turn)
        ? ` Selected row ${Math.floor(this.cursor / 3) + 1}, column ${(this.cursor % 3) + 1}, ${cell(this.cursor)}.`
        : "";
    this.g.announce?.(`Tic-Tac-Toe. ${this.lastMessage} ${turn}.${selected} Board: ${board}.`);
  }

  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    const position = this.logic.position;
    const winning = this.logic.winningLine ?? [];
    for (let index = 0; index < 9; index++) {
      const row = Math.floor(index / 3),
        column = index % 3;
      const x = X + column * CELL,
        y = Y + row * CELL;
      const selected = !this.ended && !this.isCpuTurn(position.turn) && index === this.cursor;
      ctx.fillStyle = winning.includes(index) ? "#4A350C" : selected ? "#30210A" : "#171209";
      ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
      ctx.strokeStyle = selected ? TOKENS.phosphorHot : TOKENS.phosphorDim;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x + 3.5, y + 3.5, CELL - 7, CELL - 7);
      if (position.cells[index]) {
        drawText(ctx, position.cells[index] === 1 ? "X" : "O", x + CELL / 2, y + 61, {
          font: "48px Silkscreen, monospace",
          color: position.cells[index] === 1 ? TOKENS.phosphorHot : TOKENS.phosphor,
          align: "center",
        });
      }
    }
    for (const [side, x] of [
      [1, 92],
      [-1, 548],
    ] as const) {
      drawText(ctx, this.sideName(side), x, 159, {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
      drawText(ctx, side === 1 ? "X" : "O", x, 202, {
        font: "32px Silkscreen, monospace",
        color: !this.ended && position.turn === side ? TOKENS.phosphorHot : TOKENS.phosphorDim,
        align: "center",
      });
    }
    if (this.lastCpuSource === "fallback") {
      drawText(ctx, "CPU: BASIC", 548, 228, {
        font: '10px "IBM Plex Mono", monospace',
        color: TOKENS.signalRed,
        align: "center",
      });
    }
    drawText(
      ctx,
      this.ended ? "MATCH COMPLETE" : `${this.sideName(position.turn)} / TURN`,
      320,
      331,
      {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorHot,
        align: "center",
      },
    );
  }
}
