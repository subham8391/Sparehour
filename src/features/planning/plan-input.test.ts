import { describe, expect, it } from "vitest";
import { localDate, localTime } from "@/core/time";
import type { TaskId } from "@/core/types";
import { NOW, TODAY, capacityFixture, taskFixture } from "@/test/fixtures";
import { AHEAD_DAYS, aheadDays, aheadThrough, isoAt, planInputFrom } from "./plan-input";

const settings = { timezone: "Europe/London", dayRolloverHour: 4, bufferPct: 15, defaultEstimateMin: 30, maxBlockMin: 90, minBlockMin: 25, carryAskAfter: 3, autoSomedayDays: 30, eveningStartsAt: localTime("18:00"), eveningEndsAt: localTime("22:00"), carryReview: true, todaySort: "manual" as const, showCompleted: false };

describe("plan input", () => {
  it("takes every open task Today shows, the day's blocks with their source, and the person's block lengths", () => {
    const carried = { ...taskFixture("c1", "Book dentist", { doDate: TODAY.subtract({ days: 1 }), carryCount: 2 }), ask: false };
    const input = planInputFrom(
      {
        today: TODAY,
        settings,
        capacity: capacityFixture,
        carried: [carried],
        todayTasks: [taskFixture("t1", "Draft the proposal")],
        eveningTasks: [taskFixture("e1", "Call Mum", { evening: true })],
        blocks: [{ id: "b1", taskId: null, title: "Deep work", start: 780, end: 870, locked: true, source: "manual" }, { id: "b2", taskId: null, title: "Old", start: 900, end: 930, locked: false }],
      },
      { now: NOW, ages: new Map([["t1", localDate("2026-09-01")]]) },
    )!;
    expect(input.candidates.map((t) => t.id)).toEqual(["c1", "t1", "e1"]);
    expect(input.candidates[1].createdAt?.toString()).toBe("2026-09-01");
    expect(input.candidates[0].createdAt).toBeNull();
    expect(input.blocks).toEqual([
      { id: "b1", taskId: null, start: 780, end: 870, locked: true, source: "manual" },
      { id: "b2", taskId: null, start: 900, end: 930, locked: false, source: null },
    ]);
    expect(input.capacity).toEqual({ windows: capacityFixture.windows, busy: capacityFixture.busy });
    expect(input.settings).toMatchObject({ maxBlockMin: 90, minBlockMin: 25, bufferPct: 15, timezone: "Europe/London" });
  });

  it("a done task's block keeps only the part that has passed; the rest is free to plan (PRODUCT_SPEC.md §10.2)", () => {
    const nowMin = NOW.toZonedDateTimeISO("Europe/London").hour * 60 + NOW.toZonedDateTimeISO("Europe/London").minute;
    const input = planInputFrom(
      {
        today: TODAY,
        settings,
        capacity: capacityFixture,
        carried: [],
        todayTasks: [],
        eveningTasks: [],
        blocks: [
          { id: "under-way", taskId: "t1" as TaskId, title: "Done early", start: nowMin - 30, end: nowMin + 30, locked: false, source: "plan", done: true },
          { id: "later", taskId: "t2" as TaskId, title: "Done ahead", start: nowMin + 60, end: nowMin + 120, locked: false, source: "plan", done: true },
          { id: "open", taskId: "t3" as TaskId, title: "Still to do", start: nowMin + 60, end: nowMin + 90, locked: false, source: "plan" },
        ],
      },
      { now: NOW },
    )!;
    expect(input.blocks.map((b) => [b.id, b.start - nowMin, b.end - nowMin])).toEqual([
      ["under-way", -30, 0],
      ["open", 60, 90],
    ]);
  });

  it("waits for settings and capacity", () => {
    expect(planInputFrom({ today: TODAY, settings: null, capacity: null, carried: [], todayTasks: [], eveningTasks: [], blocks: [] }, { now: NOW })).toBeNull();
  });

  it("looks ahead to the furthest deadline, two weeks at most", () => {
    expect(aheadThrough(TODAY, [{ deadline: null }, { deadline: TODAY }])).toBeNull();
    expect(aheadThrough(TODAY, [{ deadline: TODAY.add({ days: 3 }) }, { deadline: TODAY.add({ days: 1 }) }])?.toString()).toBe("2026-09-17");
    expect(aheadThrough(TODAY, [{ deadline: TODAY.add({ days: 90 }) }])?.toString()).toBe(TODAY.add({ days: AHEAD_DAYS }).toString());
  });

  it("counts each later day's free time from the capacity engine", () => {
    const days = aheadDays({
      today: TODAY,
      through: TODAY.add({ days: 6 }),
      settings,
      workHours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: localTime("09:00"), end: localTime("17:00") })),
      events: [],
      blocks: [],
    });
    expect(days.map((d) => [d.day.toString(), d.workMin, d.freeMin])).toEqual([
      ["2026-09-15", 480, 410],
      ["2026-09-16", 480, 410],
      ["2026-09-17", 480, 410],
      ["2026-09-18", 480, 410],
      ["2026-09-19", 0, 0],
      ["2026-09-20", 0, 0],
    ]);
  });

  it("writes a minute of the day as the instant a block stores, midnight included", () => {
    expect(isoAt(TODAY, 540, "Europe/London")).toBe("2026-09-14T08:00:00Z");
    expect(isoAt(TODAY, 1440, "UTC")).toBe("2026-09-15T00:00:00Z");
  });
});
