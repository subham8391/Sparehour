// The Logbook's days: what a finished task took, where the person said, is on its row and in its day's total; a
// repeat's is its finished day's, never the rolling task's (DECISIONS.md, amendment 2026-11-15).
import { describe, expect, it } from "vitest";
import type { TaskRow } from "@/data/schema.client";
import { entryMinutes, logbookDays, type CompletionRow } from "./logbook-days";

const row = (over: Partial<TaskRow> & { id: string }): TaskRow => ({ title: over.id, state: "done", ...over }) as TaskRow;

describe("logbookDays and what tasks took", () => {
  const days = logbookDays({
    done: [
      row({ id: "a", completed_at: "2026-11-10T09:00:00Z", estimate_min: 30, actual_min: 50 }),
      row({ id: "b", completed_at: "2026-11-10T10:00:00Z", estimate_min: 45 }),
      row({ id: "c", completed_at: "2026-11-10T11:00:00Z" }),
      row({ id: "d", completed_at: "2026-11-10T12:00:00Z", actual_min: 0 }),
    ],
    completions: [
      { ...row({ id: "gym", state: "active", estimate_min: 60, actual_min: 999 }), completion_id: "c1", occurrence_completed_at: "2026-11-10T07:00:00Z", occurrence_actual_min: 75 } as CompletionRow,
      { ...row({ id: "gym", state: "active", estimate_min: 60 }), completion_id: "c2", occurrence_completed_at: "2026-11-09T07:00:00Z" } as CompletionRow,
    ],
    dropped: [row({ id: "x", state: "dropped", updated_at: "2026-11-10T13:00:00Z", estimate_min: 500, actual_min: 20 })],
    zone: "UTC",
    defaultEstimateMin: 30,
  });
  const entry = (key: string) => days.flatMap((d) => [...d.done, ...d.dropped]).find((e) => e.key === key)!;

  it("puts the recorded length on the entry", () => {
    expect(entry("a").tookMin).toBe(50);
    expect(entry("b").tookMin).toBeUndefined();
    // Nothing is not a length.
    expect(entry("d").tookMin).toBeUndefined();
  });

  it("reads a repeat's length from its finished day", () => {
    expect(entry("c1").tookMin).toBe(75);
    expect(entry("c2").tookMin).toBeUndefined();
  });

  it("counts a day by what was taken where known, else the estimate, else the default", () => {
    expect(entryMinutes(entry("a"), 30)).toBe(50);
    expect(entryMinutes(entry("b"), 30)).toBe(45);
    expect(entryMinutes(entry("c"), 30)).toBe(30);
    // 10 Nov: a 50, b 45, c 30, d 30 and the gym's 75; the dropped one counts for nothing.
    expect(days[0].minutes).toBe(230);
    // 9 Nov: the gym at its estimate.
    expect(days[1].minutes).toBe(60);
  });
});

describe("logbookDays and the day's own start", () => {
  // London in winter: UTC. The day starts at 04:00.
  const group = (rolloverHour?: number) =>
    logbookDays({
      done: [row({ id: "late", completed_at: "2026-11-16T01:00:00Z" }), row({ id: "evening", completed_at: "2026-11-15T21:00:00Z" }), row({ id: "morning", completed_at: "2026-11-16T04:00:00Z" })],
      completions: [],
      dropped: [],
      zone: "Europe/London",
      rolloverHour,
      defaultEstimateMin: 30,
    }).map((d) => `${d.day.toString()}: ${d.done.map((e) => `${e.key} ${e.at}`).join(", ")}`);

  it("puts what was ticked after midnight under the day that was ending, with its own clock time", () => {
    expect(group(4)).toEqual(["2026-11-16: morning 04:00", "2026-11-15: late 01:00, evening 21:00"]);
    // Left out, it is the app's default hour.
    expect(group()).toEqual(group(4));
  });

  it("follows the person's hour: at midnight the calendar day is the day", () => {
    expect(group(0)).toEqual(["2026-11-16: morning 04:00, late 01:00", "2026-11-15: evening 21:00"]);
  });
});
