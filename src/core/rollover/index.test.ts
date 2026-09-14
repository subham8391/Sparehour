import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Temporal, instant, localDate, todayFor, type Instant } from "../time";
import type { Task, TaskId, SpaceId } from "../types";
import { carriedOver, clearTheSlate, nextRunDate, rollover, shouldAsk, type RolloverSettings } from "./index";

const SETTINGS: RolloverSettings = { timezone: "Europe/London", dayRolloverHour: 4, carryAskAfter: 3, autoSomedayDays: 30 };
// Tue 15 Sept 2026, 09:41 BST
const NOW = instant("2026-09-15T08:41:00Z");
const TODAY = localDate("2026-09-15");

let seq = 0;
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++seq}` as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  title: "Task",
  notes: null,
  state: "active",
  priority: 0,
  doDate: null,
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: null,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: NOW,
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
  ...over,
});

describe("carriedOver (the view)", () => {
  it("lists open tasks planned before today, most-carried first, and hides not-yet-started ones", () => {
    const a = task({ doDate: localDate("2026-09-14"), carryCount: 1 });
    const b = task({ doDate: localDate("2026-09-10"), carryCount: 3 });
    const notYet = task({ doDate: localDate("2026-09-14"), startDate: localDate("2026-09-20") });
    const today = task({ doDate: TODAY });
    const done = task({ doDate: localDate("2026-09-01"), state: "done" });
    const routine = task({ doDate: localDate("2026-09-14"), routineRunId: "r1" });
    expect(carriedOver([a, b, notYet, today, done, routine], TODAY).map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it("asks after the configured number of carries, live", () => {
    expect(shouldAsk(task({ carryCount: 2 }), SETTINGS)).toBe(false);
    expect(shouldAsk(task({ carryCount: 3 }), SETTINGS)).toBe(true);
    expect(shouldAsk(task({ carryCount: 3 }), { carryAskAfter: 5 })).toBe(false);
  });
});

describe("rollover (the job)", () => {
  it("bumps carry_count once per day for carry-policy tasks and leaves today's alone", () => {
    const missed = task({ doDate: localDate("2026-09-14") });
    const fine = task({ doDate: TODAY });
    const r = rollover({ tasks: [missed, fine], settings: SETTINGS, now: NOW });
    expect(r.outcomes.get(missed.id)).toBe("carried");
    expect(r.tasks[0].carryCount).toBe(1);
    expect(r.tasks[0].lastCarriedAt?.toString()).toBe("2026-09-15");
    expect(r.tasks[0].doDate?.toString()).toBe("2026-09-14"); // the view still shows it; the date is not moved
    expect(r.outcomes.get(fine.id)).toBe("untouched");
  });

  it("expires expire-policy tasks", () => {
    const t = task({ doDate: localDate("2026-09-14"), missPolicy: "expire" });
    const r = rollover({ tasks: [t], settings: SETTINGS, now: NOW });
    expect(r.tasks[0].state).toBe("dropped");
    expect(r.stats.expired).toBe(1);
  });

  it("skips a missed recurring occurrence to the next one without a guilt counter", () => {
    const water = task({ doDate: localDate("2026-09-12"), missPolicy: "skip", recurrenceRule: "FREQ=DAILY;INTERVAL=3", recurrenceMode: "fixed", recurrenceSeriesId: "s" as TaskId });
    const r = rollover({ tasks: [water], settings: SETTINGS, now: NOW });
    expect(r.outcomes.get(water.id)).toBe("skipped");
    expect(r.tasks[0].doDate?.toString()).toBe("2026-09-15");
    expect(r.tasks[0].carryCount).toBe(0);
  });

  it("drops a missed routine occurrence instead of carrying it", () => {
    const t = task({ doDate: localDate("2026-09-14"), routineRunId: "run1" });
    const r = rollover({ tasks: [t], settings: SETTINGS, now: NOW });
    expect(r.tasks[0].state).toBe("dropped");
    expect(r.stats.routine_dropped).toBe(1);
  });

  it("files tasks untouched for 30 days under Someday, regardless of carry count", () => {
    const old = task({ doDate: localDate("2026-08-01"), carryCount: 12, lastTouchedAt: instant("2026-08-10T10:00:00Z") });
    const r = rollover({ tasks: [old], settings: SETTINGS, now: NOW });
    expect(r.tasks[0].state).toBe("someday");
    expect(r.tasks[0].doDate).toBeNull();
    expect(r.tasks[0].carryCount).toBe(0);
    expect(r.outcomes.get(old.id)).toBe("someday");
  });

  it("never touches deadlines or done tasks", () => {
    const t = task({ doDate: localDate("2026-09-10"), deadline: localDate("2026-09-12") });
    const done = task({ doDate: localDate("2026-09-10"), state: "done" });
    const r = rollover({ tasks: [t, done], settings: SETTINGS, now: NOW });
    expect(r.tasks[0].deadline?.toString()).toBe("2026-09-12");
    expect(r.tasks[1]).toEqual(done);
  });

  it("is idempotent within a day: a second tick changes nothing", () => {
    const tasks = [task({ doDate: localDate("2026-09-14") }), task({ doDate: localDate("2026-09-01"), carryCount: 5 })];
    const once = rollover({ tasks, settings: SETTINGS, now: NOW });
    const twice = rollover({ tasks: once.tasks, settings: SETTINGS, now: NOW.add({ minutes: 15 }) });
    expect(twice.tasks).toEqual(once.tasks);
  });

  it("respects the 04:00 day boundary: at 01:30 it is still yesterday", () => {
    const t = task({ doDate: localDate("2026-09-14") });
    const r = rollover({ tasks: [t], settings: SETTINGS, now: instant("2026-09-15T00:30:00Z") }); // 01:30 BST
    expect(r.outcomes.get(t.id)).toBe("untouched");
  });
});

describe("clearTheSlate", () => {
  it("archives every carrying task and reports the ids for one undo entry", () => {
    const a = task({ doDate: localDate("2026-09-10") });
    const b = task({ doDate: TODAY });
    const r = clearTheSlate([a, b], TODAY);
    expect(r.archivedIds).toEqual([a.id]);
    expect(r.tasks[0].state).toBe("archived");
    expect(r.tasks[1].state).toBe("active");
  });
});

describe("nextRunDate", () => {
  it("runs once per local date", () => {
    const ledger = new Set<string>();
    const first = nextRunDate(ledger, SETTINGS, NOW);
    expect(first?.toString()).toBe("2026-09-15");
    ledger.add(first!.toString());
    expect(nextRunDate(ledger, SETTINGS, NOW.add({ minutes: 15 }))).toBeNull();
  });

  it("produces exactly one run per local date across a whole year in awkward zones, on a 15-minute tick", () => {
    for (const timezone of ["America/Santiago", "Australia/Lord_Howe", "Pacific/Chatham", "Europe/London"]) {
      const settings = { ...SETTINGS, timezone };
      const ledger = new Set<string>();
      const runs: string[] = [];
      let t: Instant = instant("2026-01-01T00:00:00Z");
      const end = instant("2027-01-01T00:00:00Z");
      while (Temporal.Instant.compare(t, end) < 0) {
        const d = nextRunDate(ledger, settings, t);
        if (d) {
          ledger.add(d.toString());
          runs.push(d.toString());
        }
        t = t.add({ minutes: 15 });
      }
      // 365 local dates, plus the partial ones at either end of the UTC window
      expect(runs.length).toBeGreaterThanOrEqual(365);
      expect(runs.length).toBeLessThanOrEqual(367);
      expect(new Set(runs).size).toBe(runs.length);
      for (let i = 1; i < runs.length; i++) {
        expect(localDate(runs[i]).since(localDate(runs[i - 1])).days).toBe(1);
      }
    }
  });
});

// ---------- properties ----------

const arbDate = fc.integer({ min: -60, max: 10 }).map((n) => TODAY.add({ days: n }));
const arbTask = fc
  .record({
    id: fc.uuid(),
    state: fc.constantFrom("inbox", "active", "someday", "done", "dropped", "archived"),
    doDate: fc.option(arbDate, { nil: null }),
    startDate: fc.option(arbDate, { nil: null }),
    carryCount: fc.integer({ min: 0, max: 40 }),
    lastCarried: fc.option(fc.integer({ min: -60, max: 0 }), { nil: null }),
    idleDays: fc.integer({ min: 0, max: 90 }),
    missPolicy: fc.constantFrom("carry", "skip", "expire"),
    recurring: fc.boolean(),
    routine: fc.boolean(),
  })
  .map((r) =>
    task({
      id: r.id as TaskId,
      state: r.state as Task["state"],
      doDate: r.doDate,
      startDate: r.startDate,
      carryCount: r.carryCount,
      lastCarriedAt: r.lastCarried == null ? null : TODAY.add({ days: r.lastCarried }),
      lastTouchedAt: NOW.subtract({ hours: r.idleDays * 24 }),
      missPolicy: r.missPolicy as Task["missPolicy"],
      recurrenceRule: r.recurring ? "FREQ=DAILY" : null,
      recurrenceMode: r.recurring ? "fixed" : null,
      recurrenceSeriesId: r.recurring ? ("s" as TaskId) : null,
      routineRunId: r.routine ? "run" : null,
    }),
  );

describe("properties", () => {
  it("idempotence: run(run(x)) == run(x) on the same day", () => {
    fc.assert(
      fc.property(fc.array(arbTask, { maxLength: 15 }), (tasks) => {
        const once = rollover({ tasks, settings: SETTINGS, now: NOW });
        const twice = rollover({ tasks: once.tasks, settings: SETTINGS, now: NOW });
        expect(twice.tasks).toEqual(once.tasks);
      }),
    );
  });

  it("conservation: every task lands in exactly one outcome and none vanish", () => {
    fc.assert(
      fc.property(fc.array(arbTask, { maxLength: 15 }), (tasks) => {
        const r = rollover({ tasks, settings: SETTINGS, now: NOW });
        expect(r.tasks).toHaveLength(tasks.length);
        expect(r.outcomes.size).toBe(tasks.length);
        expect(Object.values(r.stats).reduce((a, b) => a + b, 0)).toBe(tasks.length);
        expect(r.tasks.map((t) => t.id)).toEqual(tasks.map((t) => t.id));
      }),
    );
  });

  it("monotonicity: carry_count never decreases except by filing to Someday, and rises by at most one", () => {
    fc.assert(
      fc.property(fc.array(arbTask, { maxLength: 15 }), (tasks) => {
        const r = rollover({ tasks, settings: SETTINGS, now: NOW });
        for (let i = 0; i < tasks.length; i++) {
          const before = tasks[i].carryCount;
          const after = r.tasks[i].carryCount;
          if (r.outcomes.get(tasks[i].id) === "someday") expect(after).toBe(0);
          else expect(after === before || after === before + 1).toBe(true);
        }
      }),
    );
  });

  it("never touches a deadline, a done task, or a task planned for today or later", () => {
    fc.assert(
      fc.property(fc.array(arbTask, { maxLength: 15 }), (tasks) => {
        const r = rollover({ tasks, settings: SETTINGS, now: NOW });
        for (let i = 0; i < tasks.length; i++) {
          expect(r.tasks[i].deadline).toEqual(tasks[i].deadline);
          const t = tasks[i];
          const isOpen = t.state === "inbox" || t.state === "active";
          const future = t.doDate === null || t.doDate.toString() >= TODAY.toString();
          const idle = TODAY.since(todayFor(SETTINGS, t.lastTouchedAt)).days >= SETTINGS.autoSomedayDays;
          if (!isOpen || (future && !idle)) expect(r.tasks[i]).toEqual(t);
        }
      }),
    );
  });
});
