// Adversarial tests for the rollover engine: miss policies on non-recurring
// tasks, carry-count boundaries, auto-Someday at exactly N days across the
// rollover hour, hidden (not-yet-started) tasks, the Carried-over ordering,
// and Clear the slate on edge inputs.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { instant, localDate, type Instant } from "../time";
import type { Task, TaskId } from "../types";
import { keyBetween, sorted } from "../ordering";
import { taskFixture } from "../../test/fixtures";
import { carriedOver, clearTheSlate, nextRunDate, rollover, shouldAsk, type RolloverSettings } from "./index";

const SETTINGS: RolloverSettings = { timezone: "Europe/London", dayRolloverHour: 4, carryAskAfter: 3, autoSomedayDays: 30 };
const NOW = instant("2026-09-15T08:41:00Z"); // Tue 15 Sept 2026, 09:41 BST
const TODAY = localDate("2026-09-15");
const d = localDate;
const t = (id: string, over: Partial<Task> = {}): Task => taskFixture(id, id, { doDate: null, estimateMin: null, sortKey: "a0", daySortKey: null, lastTouchedAt: NOW, ...over });
const run = (tasks: Task[], now: Instant = NOW, settings = SETTINGS) => rollover({ tasks, settings, now });

describe("miss policies", () => {
  it("PRODUCT_SPEC §8.2 rule 4 / SQL job step 2b: a non-recurring task with miss_policy=skip loses its missed date and keeps its carry_count", () => {
    const r = run([t("s", { doDate: d("2026-09-14"), missPolicy: "skip", carryCount: 2 })]);
    expect(r.outcomes.get("s")).toBe("unscheduled");
    expect(r.tasks[0]).toMatchObject({ state: "active", doDate: null, doTime: null, carryCount: 2, lastCarriedAt: null });
  });

  it("a skipped repeat takes its deadline along at the same offset; a carried one keeps it", () => {
    const skip = t("s", { doDate: d("2026-09-11"), deadline: d("2026-09-13"), missPolicy: "skip", recurrenceRule: "FREQ=WEEKLY", recurrenceMode: "fixed" });
    const carry = t("c", { doDate: d("2026-09-11"), deadline: d("2026-09-13"), missPolicy: "carry", recurrenceRule: "FREQ=WEEKLY", recurrenceMode: "fixed" });
    const r = run([skip, carry]);
    expect(r.tasks[0]).toMatchObject({ doDate: d("2026-09-18"), deadline: d("2026-09-20") });
    expect(r.tasks[1]).toMatchObject({ doDate: d("2026-09-11"), deadline: d("2026-09-13"), carryCount: 1 });
  });

  it("a paused repeat is not rolled whatever its policy: it waits on the pause date, uncounted and not expired", () => {
    const over = { doDate: d("2026-09-12"), recurrenceRule: "FREQ=DAILY", recurrenceMode: "fixed" as const, recurrencePausedUntil: d("2026-09-20") };
    const r = run([t("c", { ...over, missPolicy: "carry" }), t("e", { ...over, missPolicy: "expire" }), t("s", { ...over, missPolicy: "skip" })]);
    for (const x of r.tasks) expect(x).toMatchObject({ state: "active", doDate: d("2026-09-20"), carryCount: 0 });
    // a pause that ended yesterday holds nothing back
    expect(run([t("o", { ...over, recurrencePausedUntil: d("2026-09-14") })]).outcomes.get("o")).toBe("carried");
  });

  it("a skip-policy recurring task whose series has ended is dropped and reported as skipped", () => {
    const r = run([t("s", { doDate: d("2026-09-10"), missPolicy: "skip", recurrenceRule: "FREQ=DAILY;UNTIL=20260912", recurrenceMode: "fixed" })]);
    expect(r.outcomes.get("s")).toBe("skipped");
    expect(r.tasks[0].state).toBe("dropped");
  });

  it("skip honours exceptions keyed by the series id, or by the task id when there is no series", () => {
    const withSeries = t("a", { doDate: d("2026-09-14"), missPolicy: "skip", recurrenceRule: "FREQ=DAILY", recurrenceMode: "fixed", recurrenceSeriesId: "series" as TaskId });
    const noSeries = t("b", { doDate: d("2026-09-14"), missPolicy: "skip", recurrenceRule: "FREQ=DAILY", recurrenceMode: "fixed" });
    const exceptions = new Map([
      ["series", [{ occurrenceDate: d("2026-09-15"), kind: "skip" as const }]],
      ["b", [{ occurrenceDate: d("2026-09-15"), kind: "move" as const, movedTo: d("2026-09-20") }]],
    ]);
    const r = rollover({ tasks: [withSeries, noSeries], settings: SETTINGS, now: NOW, exceptions });
    expect(r.tasks[0].doDate?.toString()).toBe("2026-09-16");
    expect(r.tasks[1].doDate?.toString()).toBe("2026-09-20");
  });

  it("skip with a pause lands on the pause date; a missed after-completion task counts from yesterday", () => {
    const paused = t("p", { doDate: d("2026-09-10"), missPolicy: "skip", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO", recurrenceMode: "fixed", recurrencePausedUntil: d("2026-09-17") });
    expect(run([paused]).tasks[0].doDate?.toString()).toBe("2026-09-17");
    const after = t("a", { doDate: d("2026-09-01"), missPolicy: "skip", recurrenceRule: "FREQ=DAILY;INTERVAL=3", recurrenceMode: "after_completion" });
    expect(run([after]).tasks[0].doDate?.toString()).toBe("2026-09-17"); // 14th + 3
  });

  it("documents: expire on a recurring task drops the whole task, not just the occurrence", () => {
    const r = run([t("e", { doDate: d("2026-09-14"), missPolicy: "expire", recurrenceRule: "FREQ=DAILY", recurrenceMode: "fixed" })]);
    expect(r.tasks[0].state).toBe("dropped");
    expect(r.tasks[0].recurrenceRule).toBe("FREQ=DAILY");
  });

  it("a routine occurrence is dropped whatever its miss policy, and a routine due today is untouched", () => {
    const r = run([t("r1", { doDate: d("2026-09-14"), routineRunId: "run", missPolicy: "carry" }), t("r2", { doDate: d("2026-09-14"), routineRunId: "run", missPolicy: "expire" }), t("r3", { doDate: TODAY, routineRunId: "run" })]);
    expect([...r.outcomes.values()]).toEqual(["routine_dropped", "routine_dropped", "untouched"]);
  });
});

describe("carry counts", () => {
  it("carries exactly once per local day however many ticks, and once more each following day", () => {
    let tasks = [t("c", { doDate: d("2026-09-10") })];
    for (let i = 0; i < 70; i++) tasks = run(tasks, NOW.add({ minutes: 15 * i })).tasks; // 09:41 → 02:56 next morning: still the 15th
    expect(tasks[0].carryCount).toBe(1);
    for (const day of [1, 2, 3]) tasks = run(tasks, NOW.add({ hours: 24 * day })).tasks;
    expect(tasks[0].carryCount).toBe(4);
    expect(tasks[0].lastCarriedAt?.toString()).toBe("2026-09-18");
    expect(tasks[0].doDate?.toString()).toBe("2026-09-10");
  });

  it("documents: a last_carried_at in the future (clock skew) blocks carrying", () => {
    const r = run([t("c", { doDate: d("2026-09-10"), lastCarriedAt: d("2026-09-20") })]);
    expect(r.outcomes.get("c")).toBe("untouched");
  });

  it("documents: a task hidden by a future start date is still carried every day it is hidden", () => {
    const hidden = t("h", { doDate: d("2026-09-10"), startDate: d("2026-09-20"), carryCount: 0 });
    expect(carriedOver([hidden], TODAY)).toEqual([]);
    const r = run([hidden]);
    expect(r.outcomes.get("h")).toBe("carried");
    expect(r.tasks[0].carryCount).toBe(1);
  });

  it("the ask threshold is inclusive, and zero or negative thresholds always ask", () => {
    expect(shouldAsk(t("x", { carryCount: 2 }), { carryAskAfter: 3 })).toBe(false);
    expect(shouldAsk(t("x", { carryCount: 3 }), { carryAskAfter: 3 })).toBe(true);
    expect(shouldAsk(t("x", { carryCount: 0 }), { carryAskAfter: 0 })).toBe(true);
    expect(shouldAsk(t("x", { carryCount: 0 }), { carryAskAfter: -1 })).toBe(true);
  });
});

describe("auto-Someday", () => {
  it("files at exactly N days idle, measured in rolled-over local days", () => {
    // touched 04:30 BST on 16 Aug = local day 16 Aug → 30 days before 15 Sept
    expect(run([t("a", { lastTouchedAt: instant("2026-08-16T03:30:00Z") })]).outcomes.get("a")).toBe("someday");
    // touched 03:30 BST on 17 Aug = still local day 16 Aug (before 04:00) → 30 days
    expect(run([t("b", { lastTouchedAt: instant("2026-08-17T02:30:00Z") })]).outcomes.get("b")).toBe("someday");
    // touched 04:30 BST on 17 Aug = local day 17 Aug → 29 days
    expect(run([t("c", { lastTouchedAt: instant("2026-08-17T03:30:00Z") })]).outcomes.get("c")).toBe("untouched");
  });

  it("spares the exempt (PRODUCT_SPEC §8.4 rule 3, A8 as ruled): a plan ahead, a repeat (paused or not), a deadline still to come, priority 1, a block in the next 7 days, and the Inbox", () => {
    const idle = { lastTouchedAt: NOW.subtract({ hours: 24 * 40 }) };
    const spared = [
      t("ahead", { ...idle, doDate: d("2026-12-01") }),
      t("today", { ...idle, doDate: TODAY }),
      t("repeat", { ...idle, doDate: d("2026-09-16"), recurrenceRule: "FREQ=DAILY", recurrenceMode: "fixed", missPolicy: "skip" }),
      t("paused", { ...idle, recurrenceRule: "FREQ=DAILY", recurrenceMode: "fixed", recurrencePausedUntil: d("2026-12-01") }),
      t("due", { ...idle, deadline: d("2026-12-01") }),
      t("dueToday", { ...idle, deadline: TODAY }),
      t("top", { ...idle, priority: 3 }),
      t("blocked", { ...idle }),
      t("inbox", { ...idle, state: "inbox" }),
    ];
    const filed = [t("wasDue", { ...idle, deadline: d("2026-09-01") }), t("missed", { ...idle, doDate: d("2026-08-01") }), t("low", { ...idle, priority: 1 })];
    const r = rollover({ tasks: [...spared, ...filed], settings: SETTINGS, now: NOW, blockedTaskIds: new Set(["blocked"]) });
    for (const x of spared) expect(r.outcomes.get(x.id)).not.toBe("someday");
    for (const x of filed) expect(r.outcomes.get(x.id)).toBe("someday");
    expect(r.tasks.find((x) => x.id === "inbox")?.state).toBe("inbox");
  });

  it("documents: autoSomedayDays = 0 files every active task with no plan ahead on the first run, but not today's or the Inbox's", () => {
    const r = run([t("a", { doDate: TODAY }), t("b", { state: "inbox" }), t("c")], NOW, { ...SETTINGS, autoSomedayDays: 0 });
    expect(r.stats.someday).toBe(1);
    expect(r.outcomes.get("c")).toBe("someday");
  });

  it("a task touched in the future (clock skew) is not filed", () => {
    expect(run([t("a", { doDate: d("2026-09-10"), lastTouchedAt: NOW.add({ hours: 24 * 400 }) })]).outcomes.get("a")).toBe("carried");
  });

  it("a carried task that is also idle ends up someday, counted once, with carry_count reset", () => {
    const r = run([t("a", { doDate: d("2026-09-01"), carryCount: 9, lastTouchedAt: NOW.subtract({ hours: 24 * 31 }) })]);
    expect(r.outcomes.get("a")).toBe("someday");
    expect(r.stats).toEqual({ carried: 0, skipped: 0, unscheduled: 0, expired: 0, someday: 1, routine_dropped: 0, untouched: 0 });
    expect(r.tasks[0].carryCount).toBe(0);
    expect(r.tasks[0].lastCarriedAt?.toString()).toBe("2026-09-15"); // the carry stamp survives the filing
  });
});

describe("carriedOver ordering", () => {
  it("orders ties by day_sort_key using the same key order as the ordering module (byte order, not locale order)", () => {
    const front = keyBetween(null, "a0"); // a key that sorts before "a0" — starts with an upper-case letter
    expect(front < "a0").toBe(true);
    const a = t("a", { doDate: d("2026-09-10"), daySortKey: "a0" });
    const b = t("b", { doDate: d("2026-09-10"), daySortKey: front });
    const expected = sorted([{ id: "a", sortKey: "a0" }, { id: "b", sortKey: front }]).map((x) => x.id);
    expect(carriedOver([a, b], TODAY).map((x) => x.id)).toEqual(expected);
  });

  it("hides not-yet-started, someday, done and routine tasks, and tasks due today", () => {
    const list = [
      t("notyet", { doDate: d("2026-09-10"), startDate: d("2026-09-16") }),
      t("started", { doDate: d("2026-09-10"), startDate: TODAY }),
      t("someday", { doDate: d("2026-09-10"), state: "someday" }),
      t("done", { doDate: d("2026-09-10"), state: "done" }),
      t("routine", { doDate: d("2026-09-10"), routineRunId: "r" }),
      t("today", { doDate: TODAY }),
      t("inbox", { doDate: d("2026-09-10"), state: "inbox" }),
    ];
    expect(carriedOver(list, TODAY).map((x) => x.id).sort()).toEqual(["inbox", "started"]);
  });
});

describe("clearTheSlate", () => {
  it("does nothing on an empty list and is idempotent", () => {
    expect(clearTheSlate([], TODAY)).toEqual({ tasks: [], archivedIds: [] });
    const once = clearTheSlate([t("a", { doDate: d("2026-09-10"), carryCount: 4 })], TODAY);
    expect(once.tasks[0]).toMatchObject({ state: "archived", doDate: d("2026-09-10"), carryCount: 0 });
    expect(clearTheSlate(once.tasks, TODAY).archivedIds).toEqual([]);
  });

  it("Today only takes do_date ≤ today (PRODUCT_SPEC §8.5 rule 2), Carried over included", () => {
    const r = clearTheSlate([t("today", { doDate: TODAY }), t("yesterday", { doDate: d("2026-09-14") })], TODAY);
    expect(r.archivedIds).toEqual(["today", "yesterday"]);
  });

  it("leaves routine, someday, done and not-yet-started tasks alone", () => {
    const list = [t("routine", { doDate: d("2026-09-10"), routineRunId: "r" }), t("someday", { doDate: d("2026-09-10"), state: "someday" }), t("done", { doDate: d("2026-09-10"), state: "done" }), t("hidden", { doDate: d("2026-09-10"), startDate: d("2026-09-20") })];
    expect(clearTheSlate(list, TODAY).archivedIds).toEqual(["hidden"]); // hidden but overdue: archived too
  });
});

describe("nextRunDate", () => {
  it("never runs the same local date twice across a DST fall-back, and runs the skipped spring-forward date exactly once", () => {
    const settings = { timezone: "Europe/London", dayRolloverHour: 1 }; // the rollover hour sits inside the changed hour
    const ledger = new Set<string>();
    const runs: string[] = [];
    for (const start of ["2026-03-28T00:00:00Z", "2026-10-24T00:00:00Z"]) {
      let now = instant(start);
      for (let i = 0; i < 4 * 24 * 3; i++) {
        const r = nextRunDate(ledger, settings, now);
        if (r) {
          ledger.add(r.toString());
          runs.push(r.toString());
        }
        now = now.add({ minutes: 15 });
      }
    }
    expect(new Set(runs).size).toBe(runs.length);
    expect(runs).toContain("2026-03-29");
    expect(runs).toContain("2026-10-25");
  });
});

describe("properties", () => {
  const arbTask = fc
    .record({
      id: fc.uuid(),
      state: fc.constantFrom("inbox", "active", "someday", "done"),
      doOff: fc.option(fc.integer({ min: -40, max: 5 }), { nil: null }),
      startOff: fc.option(fc.integer({ min: -10, max: 10 }), { nil: null }),
      carryCount: fc.integer({ min: 0, max: 5 }),
      idle: fc.integer({ min: 0, max: 40 }),
      missPolicy: fc.constantFrom("carry", "skip", "expire"),
      recurring: fc.boolean(),
      routine: fc.boolean(),
    })
    .map((r) =>
      t(r.id, {
        state: r.state as Task["state"],
        doDate: r.doOff == null ? null : TODAY.add({ days: r.doOff }),
        startDate: r.startOff == null ? null : TODAY.add({ days: r.startOff }),
        carryCount: r.carryCount,
        lastTouchedAt: NOW.subtract({ hours: 24 * r.idle }),
        missPolicy: r.missPolicy as Task["missPolicy"],
        recurrenceRule: r.recurring ? "FREQ=WEEKLY;BYDAY=MO,WE,FR" : null,
        recurrenceMode: r.recurring ? "fixed" : null,
        routineRunId: r.routine ? "run" : null,
      }),
    );

  it("the outcome labels match the change made to each task", () => {
    fc.assert(
      fc.property(fc.array(arbTask, { maxLength: 20 }), (tasks) => {
        const r = run(tasks);
        for (let i = 0; i < tasks.length; i++) {
          const before = tasks[i];
          const after = r.tasks[i];
          const outcome = r.outcomes.get(before.id);
          expect(after.id).toBe(before.id);
          if (outcome !== "skipped") expect(after.deadline).toEqual(before.deadline);
          expect(after.title).toBe(before.title);
          switch (outcome) {
            case "untouched":
              expect(after).toEqual(before);
              break;
            case "carried":
              expect(after).toEqual({ ...before, carryCount: before.carryCount + 1, lastCarriedAt: TODAY });
              break;
            case "skipped":
              expect(before.recurrenceRule).not.toBeNull();
              expect(after.carryCount).toBe(before.carryCount);
              if (after.state === "dropped") expect(after.doDate).toEqual(before.doDate);
              else expect(after.doDate!.toString() > TODAY.subtract({ days: 1 }).toString()).toBe(true);
              break;
            case "unscheduled":
              expect(before.recurrenceRule).toBeNull();
              expect(after).toEqual({ ...before, doDate: null, doTime: null });
              break;
            case "expired":
            case "routine_dropped":
              expect(after).toEqual({ ...before, state: "dropped" });
              break;
            case "someday":
              expect(before.state).toBe("active");
              expect(after).toMatchObject({ state: "someday", doDate: null, doTime: null, carryCount: 0 });
              break;
            default:
              throw new Error(`unknown outcome ${outcome}`);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("running on day N then day N+1 carries at most one more than running on N+1 alone", () => {
    fc.assert(
      fc.property(fc.array(arbTask, { maxLength: 12 }), (tasks) => {
        const tomorrow = NOW.add({ hours: 24 });
        const chained = run(run(tasks).tasks, tomorrow).tasks;
        const direct = run(tasks, tomorrow).tasks;
        for (let i = 0; i < tasks.length; i++) {
          expect(chained[i].carryCount - tasks[i].carryCount).toBeLessThanOrEqual(2);
          expect(direct[i].carryCount - tasks[i].carryCount).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 200 },
    );
  });
});
