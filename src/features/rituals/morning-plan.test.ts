import { describe, expect, it } from "vitest";
import { capacityFor } from "@/core/capacity";
import { compareDates, instant, localDate, localTime, timeFromMinutes, toInstant } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { candidates, easiestMove, fitsToday, frameLine, onTodayTasks, pullInSuggestions, readout } from "./morning-plan";

const today = localDate("2026-09-14");
const base: Task = {
  id: "t" as TaskId,
  spaceId: "s" as SpaceId,
  projectId: null,
  headingId: null,
  title: "t",
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
  lastTouchedAt: instant("2026-09-10T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};
const task = (id: string, over: Partial<Task>): Task => ({ ...base, id: id as TaskId, title: id, ...over });

describe("candidates", () => {
  it("puts each task in exactly one group, in the picker's order", () => {
    const tasks = [
      task("carried2", { doDate: localDate("2026-09-12"), carryCount: 2 }),
      task("carried3", { doDate: localDate("2026-09-11"), carryCount: 3 }),
      task("today", { doDate: today }),
      task("dueFri", { deadline: localDate("2026-09-18") }),
      task("dueLate", { deadline: localDate("2026-10-30") }),
      task("startsToday", { startDate: today }),
      task("old", { state: "inbox", lastTouchedAt: instant("2026-08-01T08:00:00Z") }),
      task("newer", { lastTouchedAt: instant("2026-09-13T08:00:00Z") }),
      task("done", { state: "done" }),
      task("routine", { doDate: localDate("2026-09-12"), routineRunId: "r1" }),
      task("nextWeek", { doDate: localDate("2026-09-21") }),
    ];
    const c = candidates(tasks, today);
    expect(c.carried.map((t) => t.id)).toEqual(["carried3", "carried2"]);
    expect(c.dueThisWeek.map((t) => t.id)).toEqual(["dueFri", "startsToday"]);
    // undated and open, oldest touch first — a far deadline does not make it "due this week"
    expect(c.fromProjects.map((t) => t.id)).toEqual(["old", "dueLate", "newer"]);
  });
});

describe("readout", () => {
  it("reads the picked total against what fits, leaving evening tasks out", () => {
    const picked = [task("a", { estimateMin: 90 }), task("b", { estimateMin: null }), task("c", { estimateMin: 60, evening: true })];
    const r = readout(picked, 340, 30);
    expect(r.line).toBe("3h 40m to spare · 5h 40m fits today · 2h picked · 2 tasks");
    expect(r.coach).toBeNull();
  });

  it("says how far over, and what to do about it", () => {
    const picked = [task("a", { estimateMin: 240 }), task("b", { estimateMin: 140 })];
    const r = readout(picked, 340, 30);
    expect(r.overMin).toBe(40);
    expect(r.line).toBe("40m over · 5h 40m fits today · 6h 20m picked · 2 tasks");
    expect(r.coach).toBe("40m more than fits. Move something to tomorrow, or keep it and let the day breathe less.");
  });
});

describe("pullInSuggestions", () => {
  it("offers deadlines soon, then what starts today, then the oldest inbox — three at most", () => {
    const tasks = [
      task("inboxOld", { state: "inbox", lastTouchedAt: instant("2026-08-01T08:00:00Z") }),
      task("inboxNew", { state: "inbox", lastTouchedAt: instant("2026-09-13T08:00:00Z") }),
      task("dueWed", { deadline: localDate("2026-09-16") }),
      task("dueNextMonth", { deadline: localDate("2026-10-16") }),
      task("startsToday", { startDate: today }),
      task("onToday", { doDate: today, deadline: localDate("2026-09-15") }),
      task("parked", { state: "someday" }),
    ];
    const s = pullInSuggestions(tasks, today);
    expect(s.map((p) => [p.task.id, p.source])).toEqual([
      ["dueWed", "deadline"],
      ["startsToday", "starts today"],
      ["inboxOld", "inbox"],
    ]);
  });

  it("falls back to Someday, labelled, only when nothing else qualifies", () => {
    const s = pullInSuggestions([task("parked", { state: "someday" }), task("onToday", { doDate: today })], today);
    expect(s.map((p) => [p.task.id, p.source])).toEqual([["parked", "someday"]]);
    expect(pullInSuggestions([], today)).toEqual([]);
  });
});

describe("easiestMove", () => {
  const picked = [task("deadline", { estimateMin: 120, deadline: localDate("2026-09-16") }), task("talk", { estimateMin: 30 }), task("research", { estimateMin: 60 }), task("huge", { estimateMin: 240 })];

  it("picks the largest deadline-free task that fits tomorrow, and explains", () => {
    const m = easiestMove(picked, 40, 65, 30);
    expect(m?.task.id).toBe("research");
    expect(m?.reason).toBe("No deadline, and tomorrow has 1h 05m spare. Moving it makes the day fit.");
    const m2 = easiestMove(picked, 40, 30, 30);
    expect(m2?.task.id).toBe("talk");
    expect(m2?.reason).toMatch(/leaves 10m over — close enough to keep/);
  });

  it("has nothing to say when the day fits, tomorrow is unknown, or nothing fits", () => {
    expect(easiestMove(picked, 0, 65, 30)).toBeNull();
    expect(easiestMove(picked, 40, null, 30)).toBeNull();
    expect(easiestMove(picked, 40, 10, 30)).toBeNull();
  });
});

describe("frameLine", () => {
  const day = { state: "comfortable" as const, windows: [{ start: 540, end: 1080 }], busy: [{ start: 600, end: 630 }, { start: 780, end: 810 }], busyMin: 60, committedMin: 90, unscheduledMin: 180 };
  it("says the working hours, the meetings, the plan and the carry-over in one sentence", () => {
    expect(frameLine(day, 1)).toBe("Working 09:00 to 18:00 with 2 meetings (1h) and 4h 30m planned. 1 task carried over.");
    expect(frameLine({ ...day, busy: [], busyMin: 0, committedMin: 0, unscheduledMin: 0 }, 0)).toBe("Working 09:00 to 18:00 with no meetings and nothing planned yet. Nothing carried over.");
  });

  it("keeps the carry-over when there are no working hours", () => {
    expect(frameLine(null, 3)).toBe("No working hours today. 3 tasks carried over.");
    expect(frameLine({ ...day, state: "no_work_day" }, 0)).toBe("No working hours today. Nothing carried over.");
  });
});

describe("the readout starts from Today's spare figure", () => {
  // Monday 14 Sep, 09:00–18:00 with a meeting at 10:00, a 10 % buffer, an ad-hoc focus block, and tasks on today.
  const draft = task("draft", { doDate: today, estimateMin: 45 });
  const call = task("call", { doDate: today, estimateMin: 30 });
  // On today, but it does not start until tomorrow: Today does not list it, so the plan must not count it either.
  const later = task("later", { doDate: today, estimateMin: 120, startDate: localDate("2026-09-15") });
  const evening = task("evening", { doDate: today, estimateMin: 40, evening: true });
  const open = [draft, call, later, evening];
  const blocks = [
    { taskId: null, start: 840, end: 900 },
    { taskId: "draft", start: 900, end: 945 },
  ];
  const at = (minute: number) => toInstant(today, timeFromMinutes(minute), "UTC");
  const capacity = () =>
    capacityFor({
      day: today,
      settings: { timezone: "UTC", bufferPct: 10, defaultEstimateMin: 30 },
      workHours: [{ weekday: 1, start: localTime("09:00"), end: localTime("18:00") }],
      events: [{ id: "e", startAt: at(600), endAt: at(660), startDate: null, endDate: null, allDay: false, busy: true, status: "confirmed", selfResponse: "accepted", eventType: "default", isOurs: false, calendarRead: true }],
      blocks: blocks.map((b, i) => ({ id: `b${i}`, taskId: b.taskId as TaskId | null, startAt: at(b.start), endAt: at(b.end) })),
      // What Today reads: TASKS_THROUGH_TODAY_SQL leaves out a task whose start date is still ahead.
      tasks: open.filter((t) => !t.startDate || compareDates(t.startDate, today) <= 0).map((t) => ({ id: t.id, state: t.state, doDate: t.doDate, estimateMin: t.estimateMin, evening: t.evening, daySortKey: null })),
      now: at(480),
    });

  it("picks what Today lists: open, on today, already started, not a routine item", () => {
    const extra = [task("routine", { doDate: today, routineRunId: "r1" }), task("parked", { doDate: today, state: "someday" }), task("started", { doDate: today, startDate: today })];
    expect(onTodayTasks([...open, ...extra], today).map((t) => t.id)).toEqual(["draft", "call", "evening", "started"]);
  });

  it("subtracts the time an ad-hoc block holds, so step 2 opens on the hero's number", () => {
    const c = capacity();
    const picked = onTodayTasks(open, today);
    const fits = fitsToday(c, blocks, new Set(picked.filter((t) => !t.evening).map((t) => t.id)), 480);
    // 540 working − 60 meeting − 55 buffer − 60 ad-hoc focus block.
    expect(fits).toBe(365);
    expect(c.spareMin).toBe(290);
    expect(readout(picked, fits, 30).line).toBe("4h 50m to spare · 6h 05m fits today · 1h 15m picked · 2 tasks");
  });

  it("a block of a task that is not picked holds its time; a finished task's block only the part already spent", () => {
    const c = capacity();
    const held = [
      { taskId: "elsewhere", start: 840, end: 900 },
      { taskId: "finished", start: 600, end: 720, done: true },
    ];
    // The finished block runs 10:00–12:00 under the 10:00 meeting; at 11:30 only 11:00–11:30 of it is spent free time.
    expect(fitsToday(c, held, new Set(), 690)).toBe(540 - 60 - 55 - 60 - 30);
    expect(fitsToday(null, held, new Set(), 690)).toBe(0);
    expect(fitsToday({ ...c, state: "no_work_day" }, held, new Set(), 690)).toBe(0);
  });
});
