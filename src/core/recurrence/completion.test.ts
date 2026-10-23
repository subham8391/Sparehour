// Completing a repeat, as the app and the MCP server both do it: the occurrence closed is the scheduled one (a move
// "just this once" still counts from its own day), the row moves to the next one with the deadline at the same
// offset, and a series that has ended has no next day.
import { describe, expect, it } from "vitest";
import { localDate } from "../time";
import { planCompletion, toExceptions } from "./completion";

const weekly = { do_date: "2026-10-19", deadline: "2026-10-20", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", recurrence_paused_until: null };

describe("planCompletion", () => {
  it("closes the scheduled occurrence and moves on with the deadline's offset", () => {
    const plan = planCompletion(weekly, [], localDate("2026-10-23"));
    expect(plan.occurrence.toString()).toBe("2026-10-19");
    expect(plan.next?.dayOfWeek).toBe(1);
    expect(plan.next && plan.deadline && plan.deadline.since(plan.next).days).toBe(1);
  });

  it("counts a move just this once from the day it was scheduled", () => {
    const moved = { ...weekly, do_date: "2026-10-27", deadline: null };
    const plan = planCompletion(moved, toExceptions([{ occurrence_date: "2026-10-26", kind: "move", moved_to: "2026-10-27" }]), localDate("2026-10-27"));
    expect(plan.occurrence.toString()).toBe("2026-10-26");
    expect(plan.next?.toString()).toBe("2026-11-02");
    expect(plan.deadline).toBeNull();
  });

  it("has no next day when the series ends", () => {
    const plan = planCompletion({ ...weekly, recurrence_rule: "FREQ=WEEKLY;BYDAY=MO;COUNT=1", do_date: "2026-10-26", deadline: null }, [], localDate("2026-10-26"));
    expect(plan.next).toBeNull();
  });

  it("reads exception rows: a move needs its day, anything else is a skip", () => {
    expect(toExceptions([{ occurrence_date: "2026-10-26", kind: "move", moved_to: null }])[0]).toEqual({ occurrenceDate: localDate("2026-10-26"), kind: "skip" });
  });
});
