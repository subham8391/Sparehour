// Plan my day (SYSTEM_DESIGN.md §5.5): ordering, the back-pass, evenings,
// fixed times, splitting, pinned blocks, now in the middle of the day, the
// empty and the impossible day, Shuffle, the sentences, and properties over
// random days.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { merge, subtract, totalMinutes, type Interval } from "../capacity/intervals";
import { localDate, localTime, minutesOfDay, timeFromMinutes, toInstant, type LocalDate } from "../time";
import {
  PART_BREAK_MIN,
  PLAN_WEIGHTS,
  arrangementKey,
  explain,
  nextShuffle,
  plan,
  scoreTask,
  splitInto,
  type PlanBlock,
  type PlanInput,
  type PlanSettings,
  type PlanTask,
  type Proposal,
} from "./index";

const DAY0 = localDate("2026-10-01"); // a Thursday
const ZONE = "UTC";
const m = (hhmm: string) => minutesOfDay(localTime(hhmm));
const at = (hhmm: string, day: LocalDate = DAY0) => toInstant(day, localTime(hhmm), ZONE);
const SETTINGS: PlanSettings = { timezone: ZONE, maxBlockMin: 90, minBlockMin: 25, defaultEstimateMin: 30, eveningStartsAt: localTime("18:00"), bufferPct: 0 };

function task(id: string, over: Partial<PlanTask> = {}): PlanTask {
  return { id, title: `Task ${id}`, priority: 0, doDate: DAY0, doTime: null, deadline: null, startDate: null, evening: false, estimateMin: 30, carryCount: 0, createdAt: DAY0, sortKey: "a0", daySortKey: null, ...over };
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  return { day: DAY0, capacity: { windows: [{ start: m("09:00"), end: m("17:00") }], busy: [] }, blocks: [], candidates: [], settings: SETTINGS, now: at("08:00"), ...over };
}

const span = (p: Proposal, key: string) => {
  const b = p.blocks.find((x) => x.key === key);
  if (!b) throw new Error(`no block ${key} in ${arrangementKey(p)}`);
  return `${timeFromMinutes(b.start).toString({ smallestUnit: "minute" })}-${timeFromMinutes(b.end).toString({ smallestUnit: "minute" })}`;
};

describe("ordering", () => {
  it("ranks by score and places first-fit around meetings", () => {
    const p = plan(
      input({
        capacity: { windows: [{ start: m("09:00"), end: m("17:00") }], busy: [{ start: m("10:00"), end: m("11:00") }] },
        candidates: [task("low", { estimateMin: 30 }), task("high", { priority: 3, estimateMin: 60 }), task("mid", { priority: 2, estimateMin: 45 })],
      }),
    );
    expect(p.order).toEqual(["high", "mid", "low"]);
    expect(span(p, "high")).toBe("09:00-10:00");
    expect(span(p, "mid")).toBe("11:00-11:45");
    expect(span(p, "low")).toBe("11:45-12:15");
    expect(p.unplaced).toEqual([]);
  });

  it("scores deadline pressure as work against the free time before it, not days left", () => {
    const ahead = new Map(Array.from({ length: 5 }, (_, i) => DAY0.add({ days: i + 1 })).map((d) => [d.toString(), { day: d, workMin: 480, freeMin: 72 }]));
    const ctx = { day: DAY0, todayFreeMin: 0, typicalFreeMin: 0, ahead, defaultEstimateMin: 30 };
    const due = DAY0.add({ days: 5 });
    const light = scoreTask(task("light", { deadline: due, estimateMin: 20 }), ctx);
    const heavy = scoreTask(task("heavy", { deadline: due, estimateMin: 720 }), ctx);
    expect(light.freeUntilDeadline).toBe(360);
    expect(light.pressure).toBeCloseTo(20 / 360);
    expect(heavy.pressure).toBe(1);
    expect(heavy.parts.deadline).toBe(PLAN_WEIGHTS.deadline);
    // Due today and past deadlines are full pressure; no working day before the deadline is too.
    expect(scoreTask(task("today", { deadline: DAY0 }), ctx).pressure).toBe(1);
    expect(scoreTask(task("late", { deadline: DAY0.subtract({ days: 2 }) }), ctx).pressure).toBe(1);
    const weekend = new Map([[DAY0.add({ days: 1 }).toString(), { day: DAY0.add({ days: 1 }), workMin: 0, freeMin: 0 }]]);
    expect(scoreTask(task("sat", { deadline: DAY0.add({ days: 1 }), estimateMin: 10 }), { ...ctx, ahead: weekend, todayFreeMin: 400 }).pressure).toBe(1);
  });

  it("weighs priority, carry, age, the today boost and the large-task penalty", () => {
    const ctx = { day: DAY0, todayFreeMin: 400, typicalFreeMin: 400, ahead: new Map(), defaultEstimateMin: 30 };
    const s = scoreTask(task("x", { priority: 3, carryCount: 9, createdAt: DAY0.subtract({ days: 60 }), estimateMin: 150 }), ctx);
    expect(s.parts).toEqual({ deadline: 0, priority: 30, carry: 20, age: 10, today: 8, large: -15 });
    expect(s.score).toBe(53);
    const t = scoreTask(task("y", { priority: 1, carryCount: 2, createdAt: DAY0.subtract({ days: 15 }), doDate: DAY0.subtract({ days: 1 }), estimateMin: null }), ctx);
    expect(t.parts).toEqual({ deadline: 0, priority: 10, carry: 8, age: 5, today: 0, large: 0 });
    expect(t.estimateMin).toBe(30);
  });

  it("breaks ties by deadline, then the day's order, then sort key, then id, whatever the input order", () => {
    const tied = [
      task("d", { sortKey: "a1" }),
      task("c", { sortKey: "a0" }),
      task("b", { daySortKey: "a5", sortKey: "a9" }),
      task("a", { daySortKey: "a5", sortKey: "a9" }),
      task("e", { deadline: DAY0.add({ days: 60 }), estimateMin: 1 }),
    ];
    const p = plan(input({ candidates: tied }));
    expect(p.order[0]).toBe("e"); // the only deadline, however faint
    expect(p.order.slice(1)).toEqual(["a", "b", "c", "d"]);
    const q = plan(input({ candidates: [...tied].reverse() }));
    expect(q.order).toEqual(p.order);
    expect(q.planHash).toBe(p.planHash);
    expect(arrangementKey(q)).toBe(arrangementKey(p));
  });
});

describe("the deadline back-pass", () => {
  it("holds the latest slot where a task due today still finishes, leaving the morning to the rest", () => {
    const p = plan(input({ candidates: [task("due", { deadline: DAY0, estimateMin: 30 }), task("big", { priority: 3, estimateMin: 60 })] }));
    const due = p.blocks.find((b) => b.taskId === "due")!;
    expect(due.pass).toBe("back");
    expect(span(p, "due")).toBe("16:30-17:00");
    expect(span(p, "big")).toBe("09:00-10:00");
    expect(explain(due.reasons)).toBe("Due today, so it gets time before the day ends.");
  });

  it("reserves the one gap a due-today task fits before anything else can take it", () => {
    const p = plan(
      input({
        capacity: { windows: [{ start: m("09:00"), end: m("17:00") }], busy: [{ start: m("10:30"), end: m("15:00") }] },
        // A pinned fixed-time task cannot bump it; a high priority one goes round it.
        candidates: [task("due", { deadline: DAY0, estimateMin: 90 }), task("hp", { priority: 3, estimateMin: 90 })],
      }),
    );
    expect(span(p, "due")).toBe("15:30-17:00");
    expect(span(p, "hp")).toBe("09:00-10:30");
  });

  it("splits a long due-today task across the latest slots, each part apart, or hands it to the forward pass", () => {
    const p = plan(input({ candidates: [task("long", { deadline: DAY0, estimateMin: 180 })] }));
    expect(p.blocks.map((b) => [b.key, b.pass])).toEqual([
      ["long:1", "back"],
      ["long:2", "back"],
    ]);
    expect(span(p, "long:2")).toBe("15:30-17:00");
    expect(span(p, "long:1")).toBe("13:45-15:15");
    const tight = plan(input({ capacity: { windows: [{ start: m("09:00"), end: m("12:00") }], busy: [{ start: m("10:30"), end: m("10:40") }] }, candidates: [task("long", { deadline: DAY0, estimateMin: 180 })] }));
    // 90 + 90 cannot both fit with a break: the forward pass places what it can and says so.
    expect(tight.blocks.map((b) => b.pass)).toEqual(["forward"]);
    expect(tight.unplaced[0].reason).toEqual({ kind: "no_gap", neededMin: 90, placedParts: 1, partCount: 2 });
  });
});

describe("evenings", () => {
  const long = { capacity: { windows: [{ start: m("09:00"), end: m("20:00") }], busy: [] } };

  it("puts evening tasks after the evening hour and day tasks before it", () => {
    const p = plan(input({ ...long, candidates: [task("eve", { evening: true, priority: 3 }), task("work", { estimateMin: 60 })] }));
    expect(span(p, "eve")).toBe("18:00-18:30");
    expect(span(p, "work")).toBe("09:00-10:00");
    expect(explain({ kind: "evening", at: localTime("18:00") })).toBe("Marked for this evening, so it waits until after 18:00.");
    expect(p.blocks.find((b) => b.taskId === "eve")!.reasons.map((r) => r.kind)).toEqual(["priority", "evening", "gap"]);
  });

  it("lets a day task into the evening only when nothing else fits", () => {
    const p = plan(input({ ...long, capacity: { ...long.capacity, busy: [{ start: m("09:00"), end: m("17:45") }] }, candidates: [task("work", { estimateMin: 45 })] }));
    expect(span(p, "work")).toBe("18:00-18:45");
  });

  it("an evening task with no evening working time is listed, not dropped", () => {
    const p = plan(input({ candidates: [task("eve", { evening: true })] }));
    expect(p.blocks).toEqual([]);
    expect(p.unplaced).toEqual([{ taskId: "eve", title: "Task eve", minutes: 30, reason: { kind: "no_evening_time", eveningAt: localTime("18:00") } }]);
    expect(explain(p.unplaced[0].reason)).toBe("Your working hours end before 18:00, so there is no evening time to plan. It stays in This evening.");
  });
});

describe("fixed times", () => {
  it("honours a do-time before ranking can take the slot", () => {
    const p = plan(input({ capacity: { windows: [{ start: m("13:00"), end: m("15:00") }], busy: [] }, candidates: [task("hp", { priority: 3, estimateMin: 90 }), task("call", { doTime: localTime("13:30"), estimateMin: 30 })] }));
    expect(span(p, "call")).toBe("13:30-14:00");
    expect(p.blocks.find((b) => b.taskId === "call")!.reasons[0]).toEqual({ kind: "fixed_time", at: localTime("13:30") });
    expect(explain(p.blocks.find((b) => b.taskId === "call")!.reasons)).toBe("You set it for 13:30.");
    // 90 minutes no longer fits round the call: it is listed, never squeezed over it.
    expect(p.unplaced.map((u) => u.taskId)).toEqual(["hp"]);
  });

  it("says why a do-time could not be kept: taken, passed, or outside working hours", () => {
    const busy = [{ start: m("10:00"), end: m("11:00") }];
    const p = plan(
      input({
        capacity: { windows: [{ start: m("09:00"), end: m("17:00") }], busy },
        now: at("12:02"),
        candidates: [task("taken", { doTime: localTime("13:00") }), task("past", { doTime: localTime("09:30") }), task("late", { doTime: localTime("20:00") })],
        blocks: [{ id: "lock", taskId: null, start: m("13:00"), end: m("14:00"), locked: true, source: "manual" }],
      }),
    );
    const why = Object.fromEntries(p.unplaced.map((u) => [u.taskId, u.reason]));
    expect(why.taken).toEqual({ kind: "time_unavailable", at: localTime("13:00"), why: "busy" });
    expect(why.past).toEqual({ kind: "time_unavailable", at: localTime("09:30"), why: "passed" });
    expect(why.late).toEqual({ kind: "time_unavailable", at: localTime("20:00"), why: "outside_hours" });
    expect(explain(why.taken)).toBe("Its time, 13:00, is already taken. It stays on Today.");
    expect(explain(why.past)).toBe("Its time, 09:30, has passed. It stays on Today.");
    expect(explain(why.late)).toBe("Its time, 20:00, is outside your working hours. It stays on Today.");
  });

  it("a task that has not started yet waits for its start date", () => {
    const p = plan(input({ candidates: [task("later", { startDate: DAY0.add({ days: 2 }) })] }));
    expect(p.unplaced[0].reason).toEqual({ kind: "not_started", startDate: DAY0.add({ days: 2 }) });
    expect(explain(p.unplaced[0].reason)).toBe("It starts on Sat 3 Oct, so it waits until then.");
  });
});

describe("splitting and block lengths", () => {
  it("clamps a block between the shortest and longest block, in fives", () => {
    const p = plan(input({ candidates: [task("tiny", { estimateMin: 5 }), task("odd", { estimateMin: 47 }), task("guess", { estimateMin: null })] }));
    expect(p.blocks.map((b) => [b.taskId, b.end - b.start])).toEqual([
      ["guess", 30],
      ["odd", 45],
      ["tiny", 25],
    ]);
  });

  it("cuts a long task into near-equal parts", () => {
    expect(splitInto(180, 90, 25)).toEqual([90, 90]);
    expect(splitInto(200, 90, 25)).toEqual([65, 65, 70]);
    expect(splitInto(95, 90, 25)).toEqual([50, 45]);
    expect(splitInto(60, 90, 25)).toEqual([60]);
  });

  it("splits a task longer than the longest block into parts, with air between them", () => {
    const p = plan(input({ candidates: [task("deck", { estimateMin: 180, priority: 3 })] }));
    expect(p.blocks.map((b) => b.key)).toEqual(["deck:1", "deck:2"]);
    expect(span(p, "deck:1")).toBe("09:00-10:30");
    expect(p.blocks[1].start - p.blocks[0].end).toBeGreaterThanOrEqual(PART_BREAK_MIN);
    expect(p.blocks[0].part).toEqual({ index: 1, count: 2 });
    expect(p.blocks[1].reasons).toContainEqual({ kind: "split", partIndex: 2, partCount: 2, maxBlockMin: 90 });
    expect(explain({ kind: "split", partIndex: 1, partCount: 2, maxBlockMin: 90 })).toBe("Part 1 of 2. It runs longer than your 1h 30m block limit.");
  });

  it("places the parts that fit and lists the rest", () => {
    const p = plan(input({ capacity: { windows: [{ start: m("09:00"), end: m("11:00") }], busy: [] }, candidates: [task("deck", { estimateMin: 180 })] }));
    expect(p.blocks.map((b) => b.key)).toEqual(["deck:1"]);
    expect(p.unplaced).toEqual([{ taskId: "deck", title: "Task deck", minutes: 90, reason: { kind: "no_gap", neededMin: 90, placedParts: 1, partCount: 2 } }]);
    expect(explain(p.unplaced[0].reason)).toBe("Only part 1 of 2 fits today. The rest stays on Today and will carry over quietly.");
  });
});

describe("blocks already on the day", () => {
  const blocks: PlanBlock[] = [
    { id: "locked", taskId: "x", start: m("10:00"), end: m("11:00"), locked: true, source: "plan" },
    { id: "mine", taskId: "a", start: m("12:00"), end: m("13:00"), locked: false, source: "plan" },
    { id: "manual", taskId: "b", start: m("14:00"), end: m("15:00"), locked: false, source: "manual" },
    { id: "orphan", taskId: "gone", start: m("15:00"), end: m("15:30"), locked: false, source: "plan" },
  ];

  it("never moves locked, hand-made or unrelated blocks; replaces the plan's own and leaves tasks that hold a block alone", () => {
    const p = plan(input({ blocks, candidates: [task("a", { estimateMin: 60, priority: 3 }), task("b"), task("x")] }));
    expect(p.replaces).toEqual(["mine"]);
    expect(p.kept).toEqual(["b", "x"]);
    expect(p.blocks.map((b) => b.taskId)).toEqual(["a"]);
    expect(span(p, "a")).toBe("09:00-10:00");
    for (const b of p.blocks) for (const o of blocks.filter((x) => x.id !== "mine")) expect(b.end <= o.start || b.start >= o.end).toBe(true);
  });

  it("re-planning the rest of today pins the past, never places before now, and rounds now up to five minutes", () => {
    const morning: PlanBlock[] = [{ id: "done", taskId: "a", start: m("09:00"), end: m("10:00"), locked: false, source: "plan" }];
    const p = plan(input({ now: at("13:07"), blocks: morning, candidates: [task("a", { estimateMin: 60 }), task("b", { estimateMin: 30 })] }));
    expect(p.replaces).toEqual([]);
    expect(p.kept).toEqual([]); // its block has ended, so the task (still open) is planned again
    expect(Math.min(...p.blocks.map((b) => b.start))).toBe(m("13:10"));
    expect(span(p, "a")).toBe("13:10-14:10");
    // A block under way is pinned too.
    const now = plan(input({ now: at("09:30"), blocks: morning, candidates: [task("a"), task("b")] }));
    expect(now.kept).toEqual(["a"]);
    expect(now.blocks.map((b) => [b.taskId, b.start])).toEqual([["b", m("10:00")]]);
  });

  it("a block that starts at the current minute but not second has already started", () => {
    const p = plan(input({ now: toInstant(DAY0, localTime("12:00:30"), ZONE), blocks: [{ id: "mine", taskId: "a", start: m("12:00"), end: m("13:00"), locked: false, source: "plan" }], candidates: [task("a")] }));
    expect(p.replaces).toEqual([]);
    expect(p.kept).toEqual(["a"]);
  });
});

describe("days with nothing to give", () => {
  it("no working hours: nothing is placed and every task says so", () => {
    const p = plan(input({ capacity: { windows: [], busy: [] }, candidates: [task("a"), task("b")] }));
    expect(p.noWorkDay).toBe(true);
    expect(p.blocks).toEqual([]);
    expect(p.unplaced.map((u) => u.reason.kind)).toEqual(["no_work_day", "no_work_day"]);
    expect(explain(p.unplaced[0].reason)).toBe("No working hours today. It stays on Today and will carry over quietly.");
  });

  it("nothing fits: every task is listed with the reason", () => {
    const p = plan(input({ capacity: { windows: [{ start: m("09:00"), end: m("09:20") }], busy: [] }, candidates: [task("a"), task("b", { priority: 2 })] }));
    expect(p.blocks).toEqual([]);
    expect(p.unplaced.map((u) => u.taskId)).toEqual(["b", "a"]);
    expect(explain(p.unplaced[0].reason)).toBe("No gap left today. It stays on Today and will carry over quietly.");
  });

  it("after the working day there is nothing left to plan", () => {
    const p = plan(input({ now: at("17:30"), candidates: [task("a")] }));
    expect(p.blocks).toEqual([]);
    expect(p.leftMin).toBe(0);
    expect(p.unplaced[0].reason.kind).toBe("no_gap");
  });

  it("keeps the buffer free and says how much was left", () => {
    const p = plan(input({ settings: { ...SETTINGS, bufferPct: 15 }, candidates: Array.from({ length: 6 }, (_, i) => task(`t${i}`, { estimateMin: 75, sortKey: `a${i}` })) }));
    expect(p.bufferMin).toBe(70); // 15% of 8h, to five minutes
    expect(p.plannedMin).toBe(375); // five of the six: the sixth would eat the buffer
    expect(p.leftMin).toBe(105);
    expect(p.unplaced.map((u) => u.taskId)).toEqual(["t5"]);
    expect(explain({ kind: "buffer", leftMin: p.leftMin, bufferMin: p.bufferMin })).toBe("Left 1h 45m unplanned: your 1h 10m buffer and 35m spare.");
  });

  it("lets a task due today use the buffer, because it has to finish", () => {
    const p = plan(input({ capacity: { windows: [{ start: m("09:00"), end: m("10:00") }], busy: [] }, settings: { ...SETTINGS, bufferPct: 50 }, candidates: [task("due", { deadline: DAY0, estimateMin: 60 })] }));
    expect(p.bufferMin).toBe(30);
    expect(span(p, "due")).toBe("09:00-10:00");
    expect(p.leftMin).toBe(0);
  });
});

describe("Shuffle", () => {
  const busyDay = input({
    capacity: { windows: [{ start: m("09:00"), end: m("17:00") }], busy: [{ start: m("11:00"), end: m("12:00") }, { start: m("14:00"), end: m("14:30") }] },
    candidates: [task("a", { estimateMin: 45 }), task("b", { estimateMin: 60 }), task("c", { estimateMin: 30 }), task("d", { estimateMin: 25, priority: 1 })],
  });

  it("is reproducible: the same seed gives the same plan and hash, seed 0 is the canonical plan", () => {
    expect(plan({ ...busyDay, seed: 3 })).toEqual(plan({ ...busyDay, seed: 3 }));
    expect(plan(busyDay).planHash).toBe(plan({ ...busyDay, seed: 0 }).planHash);
    expect(plan({ ...busyDay, seed: 3 }).planHash).not.toBe(plan(busyDay).planHash);
  });

  it("finds a different arrangement that is still valid", () => {
    const first = plan(busyDay);
    const next = nextShuffle(busyDay, 0)!;
    expect(next).not.toBeNull();
    expect(arrangementKey(next)).not.toBe(arrangementKey(first));
    expect(next.blocks.map((b) => b.taskId).sort()).toEqual(first.blocks.map((b) => b.taskId).sort());
    expectValid(busyDay, next);
    // And again from there: a chain of shuffles is reproducible.
    expect(arrangementKey(nextShuffle(busyDay, next.seed)!)).toBe(arrangementKey(nextShuffle(busyDay, next.seed)!));
  });

  it("says when there is only one arrangement", () => {
    const one = input({ capacity: { windows: [{ start: m("09:00"), end: m("09:30") }], busy: [] }, candidates: [task("a")] });
    expect(nextShuffle(one, 0)).toBeNull();
  });
});

describe("explanations", () => {
  it("renders the product's sentences from structured reasons", () => {
    expect(explain({ kind: "deadline", deadline: localDate("2026-10-02"), daysLeft: 4, freeMin: 120, slackMin: 75 })).toBe("Due Friday and there are only 2h of free time before then.");
    expect(explain([{ kind: "priority", priority: 3 }, { kind: "gap", fit: "longest", gapStart: localTime("14:00"), gapMin: 150 }])).toBe("High priority, and this is the longest free stretch today.");
    expect(explain({ kind: "carried", times: 5 })).toBe("Carried over 5 times.");
    expect(explain({ kind: "no_gap", neededMin: 30, placedParts: 0, partCount: 1 })).toBe("No gap left today. It stays on Today and will carry over quietly.");
    expect(explain({ kind: "buffer", leftMin: 80, bufferMin: 80 })).toBe("Left 1h 20m unplanned. That's your buffer.");
  });

  it("covers every other wording", () => {
    const d = localDate("2026-10-02");
    expect(explain({ kind: "deadline", deadline: d, daysLeft: 1, freeMin: 40, slackMin: 10 })).toBe("Due tomorrow and there are only 40m of free time before then.");
    expect(explain({ kind: "deadline", deadline: localDate("2026-10-12"), daysLeft: 11, freeMin: 3000, slackMin: 2970 })).toBe("Due 12 Oct.");
    expect(explain({ kind: "deadline", deadline: d, daysLeft: 2, freeMin: 0, slackMin: -30 })).toBe("Due Friday and there is no free time left before then.");
    expect(explain({ kind: "deadline", deadline: localDate("2026-09-29"), daysLeft: -2, freeMin: 100, slackMin: 70 })).toBe("Its deadline, Tue 29 Sep, has passed.");
    expect(explain({ kind: "priority", priority: 2 })).toBe("Medium priority.");
    expect(explain({ kind: "priority", priority: 1 })).toBe("Low priority.");
    expect(explain({ kind: "carried", times: 1 })).toBe("Carried over once.");
    expect(explain({ kind: "carried", times: 2 })).toBe("Carried over twice.");
    expect(explain({ kind: "gap", fit: "only", gapStart: localTime("09:00"), gapMin: 60 })).toBe("This is the only free gap left that fits it.");
    expect(explain({ kind: "gap", fit: "first", gapStart: localTime("09:00"), gapMin: 60 })).toBe("This is the first free gap it fits in.");
    expect(explain({ kind: "gap", fit: "later", gapStart: localTime("15:00"), gapMin: 90 })).toBe("It fits the 1h 30m free from 15:00.");
    expect(explain([{ kind: "carried", times: 3 }, { kind: "gap", fit: "only", gapStart: localTime("15:00"), gapMin: 90 }])).toBe("Carried over 3 times, and this is the only free gap left that fits it.");
    expect(explain([{ kind: "priority", priority: 3 }, { kind: "gap", fit: "first", gapStart: localTime("09:00"), gapMin: 60 }])).toBe("High priority.");
    expect(explain({ kind: "no_gap", neededMin: 90, placedParts: 2, partCount: 3 })).toBe("Only 2 of 3 parts fit today. The rest stays on Today and will carry over quietly.");
    expect(explain({ kind: "buffer", leftMin: 0, bufferMin: 60 })).toBe("Every free minute is planned. There is no buffer left.");
    expect(explain({ kind: "buffer", leftMin: 45, bufferMin: 0 })).toBe("Left 45m unplanned.");
  });

  it("gives every placed block a sentence", () => {
    const p = plan(input({ candidates: [task("a", { priority: 3, carryCount: 4 }), task("b", { deadline: DAY0.add({ days: 1 }), estimateMin: 200 }), task("c")] }));
    for (const b of p.blocks) expect(explain(b.reasons).length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------- properties

/** The invariants every proposal keeps. */
function expectValid(inp: PlanInput, p: Proposal) {
  const z = inp.now.toZonedDateTimeISO(ZONE);
  const nowMin = z.toPlainDate().equals(inp.day) ? z.hour * 60 + z.minute : z.toPlainDate().since(inp.day).days > 0 ? 1440 : 0;
  const replaced = new Set(p.replaces);
  const obstacles: Interval[] = [...inp.capacity.busy, ...inp.blocks.filter((b) => !replaced.has(b.id))];
  const windows = merge(inp.capacity.windows);
  // Blocks start on five-minute marks, so the plannable day begins at the next one.
  const free = subtract(subtract(windows, obstacles), [{ start: 0, end: Math.ceil(nowMin / 5) * 5 }]);
  for (const id of replaced) {
    const b = inp.blocks.find((x) => x.id === id)!;
    expect(b.locked || b.source !== "plan" || b.start < nowMin).toBe(false);
  }
  const sorted = [...p.blocks].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    expect(b.end).toBeGreaterThan(b.start);
    if (i > 0) expect(b.start).toBeGreaterThanOrEqual(sorted[i - 1].end);
    for (const o of obstacles) expect(b.end <= o.start || b.start >= o.end, `${b.key} ${b.start}-${b.end} hits ${o.start}-${o.end}`).toBe(true);
    expect(windows.some((w) => b.start >= w.start && b.end <= w.end)).toBe(true);
    expect(b.start).toBeGreaterThanOrEqual(nowMin);
    expect((b.end - b.start) % 5).toBe(0);
    expect(b.reasons.length).toBeGreaterThan(0);
    expect(explain(b.reasons)).not.toBe("");
  }
  expect(p.plannedMin).toBeLessThanOrEqual(totalMinutes(free));
  expect(p.plannedMin + p.leftMin).toBe(p.noWorkDay ? 0 : totalMinutes(free));
  // Conservation: every candidate is planned, listed, or left alone with its own block, and only once in each list.
  const ids = new Set(inp.candidates.map((t) => t.id));
  const planned = new Set(p.blocks.map((b) => b.taskId));
  const listed = p.unplaced.map((u) => u.taskId);
  expect(new Set(listed).size).toBe(listed.length);
  for (const id of ids) expect(planned.has(id) || listed.includes(id) || p.kept.includes(id), `lost ${id}`).toBe(true);
  for (const id of p.kept) expect(planned.has(id) || listed.includes(id)).toBe(false);
  for (const u of p.unplaced) {
    const parts = p.blocks.filter((b) => b.taskId === u.taskId).length;
    if (parts > 0) expect(u.reason).toMatchObject({ kind: "no_gap", placedParts: parts });
  }
}

const minute = fc.integer({ min: 0, max: 287 }).map((i) => i * 5);
const interval = (minLen: number, maxLen: number) => fc.record({ start: minute, len: fc.integer({ min: minLen, max: maxLen }) }).map(({ start, len }) => ({ start, end: Math.min(1440, start + len) }));

const arbInput = fc
  .record({
    windows: fc.array(interval(15, 600), { maxLength: 3 }),
    busy: fc.array(interval(5, 180), { maxLength: 4 }),
    tasks: fc.array(
      fc.record({
        priority: fc.integer({ min: 0, max: 3 }),
        estimateMin: fc.option(fc.integer({ min: 1, max: 320 }), { nil: null }),
        deadline: fc.option(fc.integer({ min: -3, max: 12 }), { nil: null }),
        startDate: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
        doTime: fc.option(minute, { nil: null, freq: 4 }),
        evening: fc.boolean(),
        carryCount: fc.integer({ min: 0, max: 7 }),
        age: fc.option(fc.integer({ min: 0, max: 60 }), { nil: null }),
        sortKey: fc.constantFrom("a0", "a1", "a2", "b0"),
        daySortKey: fc.option(fc.constantFrom("a0", "a1", "a2"), { nil: null }),
      }),
      { maxLength: 8 },
    ),
    blocks: fc.array(fc.record({ at: interval(5, 120), task: fc.integer({ min: -1, max: 7 }), locked: fc.boolean(), plan: fc.boolean() }), { maxLength: 4 }),
    now: fc.integer({ min: 0, max: 1440 }),
    seed: fc.integer({ min: 0, max: 4 }),
    eveningAt: fc.integer({ min: 30, max: 44 }).map((h) => h * 30),
    bufferPct: fc.integer({ min: 0, max: 40 }),
    minBlock: fc.constantFrom(5, 15, 25),
    maxBlock: fc.constantFrom(30, 60, 90, 120),
  })
  .map((r): PlanInput => {
    const candidates = r.tasks.map((t, i) =>
      task(`t${i}`, {
        priority: t.priority,
        estimateMin: t.estimateMin,
        deadline: t.deadline === null ? null : DAY0.add({ days: t.deadline }),
        startDate: t.startDate === null ? null : DAY0.add({ days: t.startDate }),
        doTime: t.doTime === null ? null : timeFromMinutes(t.doTime),
        evening: t.evening,
        carryCount: t.carryCount,
        createdAt: t.age === null ? null : DAY0.subtract({ days: t.age }),
        sortKey: t.sortKey,
        daySortKey: t.daySortKey,
      }),
    );
    return {
      day: DAY0,
      capacity: { windows: r.windows, busy: r.busy },
      blocks: r.blocks.map((b, i) => ({ id: `b${i}`, taskId: b.task >= 0 && b.task < candidates.length ? `t${b.task}` : null, start: b.at.start, end: b.at.end, locked: b.locked, source: b.plan ? "plan" : "manual" })),
      candidates,
      settings: { ...SETTINGS, eveningStartsAt: timeFromMinutes(r.eveningAt), bufferPct: r.bufferPct, minBlockMin: r.minBlock, maxBlockMin: r.maxBlock },
      now: r.now >= 1440 ? at("00:00", DAY0.add({ days: 1 })) : toInstant(DAY0, timeFromMinutes(r.now), ZONE),
      seed: r.seed,
    };
  });

describe("properties", () => {
  it("blocks never overlap each other, meetings or pinned blocks, stay inside working hours and after now, and never exceed the free time", () => {
    fc.assert(
      fc.property(arbInput, (inp) => {
        expectValid(inp, plan(inp));
      }),
      { numRuns: 400 },
    );
  });

  it("is deterministic whatever order the inputs arrive in", () => {
    fc.assert(
      fc.property(arbInput, (inp) => {
        const a = plan(inp);
        const b = plan({ ...inp, candidates: [...inp.candidates].reverse(), blocks: [...inp.blocks].reverse(), capacity: { windows: [...inp.capacity.windows].reverse(), busy: [...inp.capacity.busy].reverse() } });
        expect(b.planHash).toBe(a.planHash);
        expect(b).toEqual(a);
      }),
      { numRuns: 200 },
    );
  });

  it("every shuffle is as valid as the canonical plan", () => {
    fc.assert(
      fc.property(arbInput, (inp) => {
        const next = nextShuffle({ ...inp, seed: 0 }, 0);
        if (next) expectValid({ ...inp, seed: next.seed }, next);
      }),
      { numRuns: 100 },
    );
  });
});
