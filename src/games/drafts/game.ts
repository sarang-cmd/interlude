import { TOKENS } from "../../../design/tokens";
import { AI_PROFILES, isAIDifficulty, type AIDifficulty } from "../../ai/difficulty";
import {
  applyDraftMove,
  decodeDraftMove,
  draftMoves,
  draftsOutcome,
  encodeDraftMove,
  initialDrafts,
  type DraftPosition,
  type DraftSearchTask,
  type DraftSide,
} from "../../ai/drafts";
import { searchBoard } from "../../ai/search-client";
import type { SearchResult } from "../../ai/search";
import { DRAFTS_MANIFEST } from "../manifest";
import { drawText } from "../shared";
import type { ArcadeGame, GameContext } from "../types";

const LEFT = 192,
  TOP = 49,
  CELL = 32;
type Search = (
  task: DraftSearchTask,
  canvas: HTMLCanvasElement,
  timeoutMs?: number,
  signal?: AbortSignal,
) => Promise<SearchResult<number>>;
const squareName = (square: number): string =>
  `row ${Math.floor(square / 8) + 1}, column ${(square % 8) + 1}`;

/** Single-human-versus-CPU draughts. Website local play supplies its own turn policy. */
export class DraftsGame implements ArcadeGame {
  readonly manifest = DRAFTS_MANIFEST;
  readonly readyHint = "SELECT PIECE, THEN DESTINATION · SPACE";
  score = 0;
  protected g!: GameContext;
  private position: DraftPosition = initialDrafts();
  private cursor = 42;
  private selected: number | null = null;
  private legal: number[] = [];
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
    return this.winner === 0 ? "DRAW" : `${this.sideName(this.winner as DraftSide)} WINS`;
  }
  protected isCpuTurn(side: DraftSide): boolean {
    return side === -1;
  }
  protected sideName(side: DraftSide): string {
    return side === 1 ? "YOU" : "CPU";
  }

  init(ctx: GameContext): void {
    this.suspend();
    this.g = ctx;
    this.position = initialDrafts();
    this.cursor = 42;
    this.selected = null;
    this.legal = draftMoves(this.position);
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
      const row = Math.floor(this.cursor / 8),
        col = this.cursor % 8;
      const r = Math.max(
        0,
        Math.min(7, row + (direction === "up" ? -1 : direction === "down" ? 1 : 0)),
      );
      const c = Math.max(
        0,
        Math.min(7, col + (direction === "left" ? -1 : direction === "right" ? 1 : 0)),
      );
      const next = r * 8 + c;
      changed ||= next !== this.cursor;
      this.cursor = next;
    }
    for (const tap of taps) {
      if (tap.x < LEFT || tap.x >= LEFT + 8 * CELL || tap.y < TOP || tap.y >= TOP + 8 * CELL)
        continue;
      this.cursor = Math.floor((tap.y - TOP) / CELL) * 8 + Math.floor((tap.x - LEFT) / CELL);
      this.chooseSquare(this.cursor);
      changed = true;
      if (this.ended || this.isCpuTurn(this.position.turn)) return;
    }
    if (select) {
      this.chooseSquare(this.cursor);
      changed = true;
    }
    if (changed) this.announce();
  }
  private chooseSquare(square: number): void {
    const canSelect = this.legal.some((move) => decodeDraftMove(move)[0] === square);
    if (this.selected !== null) {
      const move = encodeDraftMove(this.selected, square);
      if (this.legal.includes(move)) {
        this.play(move);
        return;
      }
      if (square === this.selected && this.position.forced === -1) {
        this.selected = null;
        this.lastMessage = "Selection cleared.";
        return;
      }
    }
    if (canSelect) {
      this.selected = square;
      this.lastMessage = `Selected piece at ${squareName(square)}.`;
    } else
      this.lastMessage =
        this.selected === null
          ? "Select a movable piece. Captures are compulsory."
          : "That destination is not legal.";
  }
  private beginSearch(): void {
    const profile = AI_PROFILES[this.level];
    const task: DraftSearchTask = {
      kind: "drafts",
      position: this.position,
      depth: Math.min(profile.searchDepth, 6),
      maxNodes: 40_000,
    };
    const abort = new AbortController(),
      version = ++this.version;
    this.abort = abort;
    const accept = (result: SearchResult<number> | null): void => {
      if (abort.signal.aborted || version !== this.version || this.ended) return;
      this.abort = null;
      let move = result?.move,
        basic = false;
      if (!result || !result.complete || typeof move !== "number" || !this.legal.includes(move)) {
        move = this.legal[0] ?? null;
        basic = true;
      }
      if (move === null || move === undefined) return;
      if (this.g.rng.chance(profile.errorChance)) move = this.g.rng.pick(this.legal);
      this.decision = { move, basic };
    };
    void this.search(task, this.g.canvas, 2000, abort.signal).then(accept, () => accept(null));
  }
  private play(move: number, basic?: boolean): void {
    if (!this.legal.includes(move)) return;
    const side = this.position.turn,
      [from, to] = decodeDraftMove(move),
      previous = this.position;
    this.position = applyDraftMove(previous, move);
    this.legal = draftMoves(this.position);
    const capture = Math.abs(Math.floor(from / 8) - Math.floor(to / 8)) === 2;
    const crowned =
      Math.abs(previous.cells[from]!) === 1 && Math.abs(this.position.cells[to]!) === 2;
    this.cursor = to;
    this.selected = this.position.forced >= 0 ? this.position.forced : null;
    this.lastMessage = `${this.sideName(side)} moved from ${squareName(from)} to ${squareName(to)}${basic === undefined ? "" : basic ? " using fallback" : " using search"}.${capture ? " Captured." : ""}${crowned ? " Crowned king." : ""}${this.position.forced >= 0 ? " Continue the capture with the same piece." : ""}`;
    if (basic !== undefined) this.basic = basic;
    this.g.sound.play("blip");
    this.winner = draftsOutcome(this.position);
    if (this.winner !== null) {
      this.ended = true;
      const left = this.position.cells.filter((piece) => piece > 0).length;
      this.score = this.winner === 1 ? 1000 + 100 * left : this.winner === 0 ? 400 : 0;
      this.announce();
      void this.g.reportGameOver();
    } else this.announce();
  }
  private announce(): void {
    if (!this.g) return;
    const pieceName = (index: number): string =>
      ({ "0": "empty", "1": "X", "2": "X king", "-1": "O", "-2": "O king" })[
        String(this.position.cells[index])
      ] ?? "empty";
    const rows = Array.from(
      { length: 8 },
      (_, row) =>
        `row ${row + 1}: ${Array.from({ length: 8 }, (_, col) => pieceName(row * 8 + col)).join(", ")}`,
    ).join("; ");
    const turn = this.ended ? this.resultLabel : `${this.sideName(this.position.turn)} turn`;
    const selected =
      !this.ended && !this.isCpuTurn(this.position.turn)
        ? ` Cursor ${squareName(this.cursor)}, ${pieceName(this.cursor)}.${
            this.selected === null
              ? ""
              : ` Piece selected at ${squareName(this.selected)}. Destinations: ${this.legal
                  .filter((move) => decodeDraftMove(move)[0] === this.selected)
                  .map((move) => squareName(decodeDraftMove(move)[1]))
                  .join("; ")}.`
          }`
        : "";
    this.g.announce?.(`DRAFTS. ${this.lastMessage} ${turn}.${selected} Board: ${rows}.`);
  }
  render(_alpha: number): void {
    const ctx = this.g.ctx;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    const destinations =
      this.selected === null
        ? []
        : this.legal
            .filter((move) => decodeDraftMove(move)[0] === this.selected)
            .map((move) => decodeDraftMove(move)[1]);
    for (let index = 0; index < 64; index++) {
      const row = Math.floor(index / 8),
        col = index % 8,
        x = LEFT + col * CELL,
        y = TOP + row * CELL;
      const cursor = !this.ended && !this.isCpuTurn(this.position.turn) && this.cursor === index;
      ctx.fillStyle = (row + col) % 2 ? "#30210A" : "#171209";
      ctx.fillRect(x, y, CELL, CELL);
      if (index === this.selected || cursor) {
        ctx.strokeStyle = index === this.selected ? TOKENS.signalGreen : TOKENS.phosphorHot;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }
      const piece = this.position.cells[index]!;
      if (piece) {
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, 10, 0, 2 * Math.PI);
        ctx.fillStyle = piece > 0 ? TOKENS.phosphorHot : TOKENS.signalRed;
        ctx.fill();
        drawText(ctx, Math.abs(piece) === 2 ? "K" : piece > 0 ? "X" : "O", x + CELL / 2, y + 22, {
          font: "15px monospace",
          color: TOKENS.ink,
          align: "center",
        });
      } else if (destinations.includes(index)) {
        ctx.fillStyle = TOKENS.signalGreen;
        ctx.fillRect(x + 13, y + 13, 6, 6);
      }
    }
    for (const [side, x] of [
      [1, 85],
      [-1, 555],
    ] as const) {
      drawText(ctx, this.sideName(side), x, 156, {
        font: '11px "IBM Plex Mono", monospace',
        color: TOKENS.phosphorDim,
        align: "center",
      });
      drawText(
        ctx,
        String(this.position.cells.filter((piece) => Math.sign(piece) === side).length),
        x,
        197,
        { font: "32px Silkscreen, monospace", color: TOKENS.phosphorHot, align: "center" },
      );
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
