import type { InterludeSettings } from "../settings/schema";

export interface DayStats {
  games: Record<string, number>;
  sessions: number;
}
export interface PlayStats {
  version: 1;
  days: Record<string, DayStats>;
}
export interface PlayDelta {
  day: string;
  game: string;
  ms: number;
  sessions: number;
}
export type GuardNotice = { type: "nudge"; minutes: number } | { type: "budget" };
export type GuardBlock = "quiet" | "study" | "lock" | null;
export interface GuardSnapshot {
  todayMs: number;
  sessionMs: number;
  remainingMs: number | null;
  block: GuardBlock;
  notices: GuardNotice[];
}

export function emptyStats(): PlayStats {
  return { version: 1, days: {} };
}
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function cleanStats(raw: unknown): PlayStats {
  const result = emptyStats();
  if (!raw || typeof raw !== "object") return result;
  const days = (raw as { days?: unknown }).days;
  if (!days || typeof days !== "object" || Array.isArray(days)) return result;
  for (const [day, rawDay] of Object.entries(days)) {
    if (!/^\d{4}-\d\d-\d\d$/.test(day) || !rawDay || typeof rawDay !== "object") continue;
    const row = rawDay as { games?: unknown; sessions?: unknown };
    const games: Record<string, number> = {};
    if (row.games && typeof row.games === "object" && !Array.isArray(row.games)) {
      for (const [game, ms] of Object.entries(row.games))
        if (
          /^[a-z0-9-]{1,32}$/.test(game) &&
          typeof ms === "number" &&
          Number.isFinite(ms) &&
          ms >= 0 &&
          ms <= 864000000
        )
          games[game] = ms;
    }
    const sessions =
      typeof row.sessions === "number" &&
      Number.isSafeInteger(row.sessions) &&
      row.sessions >= 0 &&
      row.sessions <= 1000000
        ? row.sessions
        : 0;
    result.days[day] = { games, sessions };
  }
  return result;
}
export function applyDeltas(stats: PlayStats, deltas: readonly PlayDelta[]): PlayStats {
  const next = cleanStats(stats);
  for (const delta of deltas) {
    if (
      !/^\d{4}-\d\d-\d\d$/.test(delta.day) ||
      !/^[a-z0-9-]{1,32}$/.test(delta.game) ||
      !Number.isFinite(delta.ms) ||
      delta.ms < 0 ||
      delta.ms > 86400000 ||
      !Number.isSafeInteger(delta.sessions) ||
      delta.sessions < 0 ||
      delta.sessions > 1
    )
      continue;
    const day = (next.days[delta.day] ??= { games: {}, sessions: 0 });
    day.games[delta.game] = (day.games[delta.game] ?? 0) + delta.ms;
    day.sessions += delta.sessions;
  }
  return next;
}
export function dayTotal(stats: PlayStats, day: string): number {
  return Object.values(stats.days[day]?.games ?? {}).reduce((sum, ms) => sum + ms, 0);
}
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
function timeMinutes(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}
/** A cross-midnight interval belongs to the day on which it starts. */
export function inSchedule(
  now: number,
  days: readonly string[],
  start: string,
  end: string,
): boolean {
  const date = new Date(now);
  const minute = date.getHours() * 60 + date.getMinutes();
  const from = timeMinutes(start),
    until = timeMinutes(end);
  if (from === until) return days.includes(DAYS[date.getDay()]!); // full selected day
  if (from < until) return days.includes(DAYS[date.getDay()]!) && minute >= from && minute < until;
  if (minute >= from) return days.includes(DAYS[date.getDay()]!);
  return minute < until && days.includes(DAYS[(date.getDay() + 6) % 7]!);
}

/** Local-clock, side-effect-free accounting. Persistence is a separate serialized service. */
export class FocusGuard {
  private base: PlayStats;
  private pending: PlayDelta[] = [];
  private runningSince: number | null = null;
  private game: string | null = null;
  private sessionMs = 0;
  private notices: GuardNotice[] = [];
  private notified = new Set<string>();
  constructor(
    private settings: InterludeSettings,
    initial: PlayStats = emptyStats(),
    private readonly now: () => number = Date.now,
  ) {
    this.base = cleanStats(initial);
  }
  setSettings(settings: InterludeSettings): void {
    this.tick();
    this.settings = settings;
  }
  /** Start or resume actual active play. READY and paused time do not count. */
  begin(game: string): void {
    if (this.runningSince !== null && this.game === game) return;
    this.tick();
    if (this.game !== game) {
      this.game = game;
      this.sessionMs = 0;
      this.pending.push({ day: dayKey(this.now()), game, ms: 0, sessions: 1 });
    }
    this.runningSince = this.now();
  }
  pause(): void {
    this.tick();
    this.runningSince = null;
  }
  end(): number {
    this.pause();
    const duration = this.sessionMs;
    this.game = null;
    this.sessionMs = 0;
    return duration;
  }
  tick(): GuardSnapshot {
    const now = this.now();
    const before = dayTotal(this.currentStats(), dayKey(now));
    if (this.runningSince !== null && this.game && now > this.runningSince) {
      let cursor = this.runningSince;
      while (cursor < now) {
        const d = new Date(cursor);
        const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const end = Math.min(now, midnight);
        const elapsed = end - cursor;
        this.pending.push({ day: dayKey(cursor), game: this.game, ms: elapsed, sessions: 0 });
        this.sessionMs += elapsed;
        cursor = end;
      }
      this.runningSince = now;
    } else if (this.runningSince !== null && now < this.runningSince) this.runningSince = now;
    const today = dayKey(now);
    const total = dayTotal(this.currentStats(), today);
    this.detectCrossings(before, total, today);
    return this.snapshot();
  }
  private detectCrossings(before: number, total: number, today: string): void {
    if (this.settings.nudgesEnabled) {
      for (const value of this.settings.nudgeMinutes) {
        const mark = Number(value),
          key = `${today}:nudge:${mark}`;
        if (before < mark * 60000 && total >= mark * 60000 && !this.notified.has(key)) {
          this.notified.add(key);
          this.notices.push({ type: "nudge", minutes: mark });
        }
      }
    }
    const budgetKey = `${today}:budget`;
    if (
      this.settings.budgetEnabled &&
      before < this.settings.budgetMinutes * 60000 &&
      total >= this.settings.budgetMinutes * 60000 &&
      !this.notified.has(budgetKey)
    ) {
      this.notified.add(budgetKey);
      this.notices.push({ type: "budget" });
    }
  }
  currentStats(): PlayStats {
    return applyDeltas(this.base, this.pending);
  }
  snapshot(): GuardSnapshot {
    const now = this.now(),
      total = dayTotal(this.currentStats(), dayKey(now));
    let block: GuardBlock = null;
    if (
      this.settings.studyMode &&
      inSchedule(now, this.settings.studyDays, this.settings.studyStart, this.settings.studyEnd)
    )
      block = "study";
    else if (
      this.settings.quietHours &&
      inSchedule(now, this.settings.quietDays, this.settings.quietStart, this.settings.quietEnd)
    )
      block = "quiet";
    else if (
      this.settings.budgetEnabled &&
      this.settings.budgetLockout &&
      total >= this.settings.budgetMinutes * 60000
    )
      block = "lock";
    return {
      todayMs: total,
      sessionMs: this.sessionMs,
      remainingMs: this.settings.budgetEnabled
        ? Math.max(0, this.settings.budgetMinutes * 60000 - total)
        : null,
      block,
      notices: [...this.notices],
    };
  }
  takeNotices(): GuardNotice[] {
    return this.notices.splice(0);
  }
  /** Copy deltas for a serialized write; acknowledgement removes only that prefix. */
  pendingDeltas(): PlayDelta[] {
    return this.pending.map((delta) => ({ ...delta }));
  }
  acknowledge(count: number, remote: PlayStats): void {
    const today = dayKey(this.now());
    const before = dayTotal(this.currentStats(), today);
    this.pending.splice(0, count);
    this.base = cleanStats(remote);
    this.detectCrossings(before, dayTotal(this.currentStats(), today), today);
  }
  replaceBase(remote: PlayStats): void {
    const today = dayKey(this.now());
    const before = dayTotal(this.currentStats(), today);
    this.base = cleanStats(remote);
    this.detectCrossings(before, dayTotal(this.currentStats(), today), today);
  }
}

export function streak(stats: PlayStats, now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (!dayTotal(stats, dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let count = 0;
  while (dayTotal(stats, dayKey(d.getTime())) > 0) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}
