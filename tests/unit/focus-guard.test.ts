import { describe, expect, it } from "vitest";
import {
  FocusGuard,
  applyDeltas,
  dayKey,
  dayTotal,
  emptyStats,
  inSchedule,
  streak,
} from "../../src/focus/guard";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

describe("Focus Guard with a fake local clock", () => {
  it("counts active play, not paused time, and preserves pending time during acknowledgement", () => {
    let now = new Date(2026, 10, 25, 12).getTime();
    const guard = new FocusGuard(DEFAULT_SETTINGS, emptyStats(), () => now);
    guard.begin("snake");
    now += 10000;
    guard.tick();
    const sent = guard.pendingDeltas();
    now += 5000;
    guard.tick();
    guard.acknowledge(sent.length, applyDeltas(emptyStats(), sent));
    expect(guard.snapshot().todayMs).toBe(15000);
    guard.pause();
    now += 9000;
    expect(guard.tick().todayMs).toBe(15000);
    guard.begin("snake");
    now += 5000;
    expect(guard.end()).toBe(20000);
    expect(guard.currentStats().days[dayKey(now)]?.sessions).toBe(1);
    expect(guard.snapshot().block).toBeNull();
  });
  it("nudges once, does not punish by default, and locks exactly when configured", () => {
    let now = new Date(2026, 10, 25, 12).getTime();
    const settings = {
      ...DEFAULT_SETTINGS,
      budgetEnabled: true,
      budgetMinutes: 1,
      nudgesEnabled: true,
      nudgeMinutes: ["1"],
    };
    const guard = new FocusGuard(settings, emptyStats(), () => now);
    guard.begin("pong");
    now += 60000;
    expect(guard.tick().block).toBeNull();
    expect(guard.takeNotices()).toEqual([{ type: "nudge", minutes: 1 }, { type: "budget" }]);
    expect(guard.tick().notices).toEqual([]);
    guard.setSettings({ ...settings, budgetLockout: true });
    expect(guard.snapshot().block).toBe("lock");
    guard.setSettings({ ...settings, budgetLockout: false });
    expect(guard.snapshot().block).toBeNull();
    guard.setSettings({ ...settings, budgetLockout: true });
    guard.pause();
    now = new Date(2026, 10, 26, 0, 0, 1).getTime();
    expect(guard.snapshot().block).toBeNull();
  });
  it("splits play at local midnight and computes an active-day streak", () => {
    let now = new Date(2026, 10, 25, 23, 59, 50).getTime();
    const first = dayKey(now),
      guard = new FocusGuard(DEFAULT_SETTINGS, emptyStats(), () => now);
    guard.begin("flappy");
    now += 20000;
    guard.tick();
    const second = dayKey(now),
      stats = guard.currentStats();
    expect(dayTotal(stats, first)).toBe(10000);
    expect(dayTotal(stats, second)).toBe(10000);
    expect(streak(stats, now)).toBe(2);
  });
  it("handles cross-midnight schedules by the day the schedule begins", () => {
    const wedLate = new Date(2026, 10, 25, 23, 30).getTime();
    const thuEarly = new Date(2026, 10, 26, 2, 0).getTime();
    expect(inSchedule(wedLate, ["wed"], "22:00", "07:00")).toBe(true);
    expect(inSchedule(thuEarly, ["wed"], "22:00", "07:00")).toBe(true);
    expect(inSchedule(thuEarly, ["thu"], "22:00", "07:00")).toBe(false);
    const guard = new FocusGuard(
      {
        ...DEFAULT_SETTINGS,
        studyMode: true,
        studyDays: ["wed"],
        studyStart: "22:00",
        studyEnd: "07:00",
      },
      emptyStats(),
      () => thuEarly,
    );
    expect(guard.snapshot().block).toBe("study");
  });
});
