import { describe, expect, it } from "vitest";
import { instant, localDate } from "@/core/time";
import type { Heading, ProjectId, SpaceId, Task, TaskId } from "@/core/types";
import { groupByHeading, summarise } from "./organise";

const base: Task = {
  id: "t" as TaskId,
  spaceId: "s" as SpaceId,
  projectId: "p" as ProjectId,
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
  lastTouchedAt: instant("2026-09-14T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};
const task = (over: Partial<Task>): Task => ({ ...base, ...over });
const heading = (id: string, sortKey: string): Heading => ({ id, projectId: "p" as ProjectId, title: id, sortKey });

describe("groupByHeading", () => {
  it("puts unheaded tasks first, then each heading in order, tasks in their own order", () => {
    const tasks = [
      task({ id: "b" as TaskId, headingId: "h2", sortKey: "a1" }),
      task({ id: "a" as TaskId, headingId: "h2", sortKey: "a0" }),
      task({ id: "loose" as TaskId, sortKey: "a5" }),
      task({ id: "c" as TaskId, headingId: "h1", sortKey: "a0" }),
    ];
    const groups = groupByHeading(tasks, [heading("h2", "b1"), heading("h1", "b0")]);
    expect(groups.map((g) => g.heading?.id ?? null)).toEqual([null, "h1", "h2"]);
    expect(groups.map((g) => g.tasks.map((t) => t.id))).toEqual([["loose"], ["c"], ["a", "b"]]);
  });

  it("never loses a task whose heading is gone", () => {
    const groups = groupByHeading([task({ id: "x" as TaskId, headingId: "deleted" })], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["x"]);
  });
});

describe("summarise", () => {
  it("counts open tasks, sums estimates with the default for guesses, and finds the earliest deadline", () => {
    const s = summarise(
      [
        task({ estimateMin: 45, deadline: localDate("2026-10-03") }),
        task({ estimateMin: null, deadline: localDate("2026-09-20") }),
        task({ state: "someday", estimateMin: 120 }),
        task({ state: "done", estimateMin: 60, deadline: localDate("2026-09-01") }),
      ],
      30,
    );
    expect(s).toEqual({ open: 2, minutes: 75, nextDeadline: localDate("2026-09-20") });
  });

  it("is empty for nothing", () => {
    expect(summarise([], 30)).toEqual({ open: 0, minutes: 0, nextDeadline: null });
  });
});
