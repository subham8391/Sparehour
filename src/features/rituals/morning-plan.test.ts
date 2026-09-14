import { describe, expect, it } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { candidates, easiestMove, pullInSuggestions, readout } from "./morning-plan";

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
