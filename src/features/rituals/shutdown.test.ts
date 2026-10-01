import { describe, expect, it } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { SHUTDOWN_STEPS, carriedLine, carriedToTomorrow, carryOutcome, closedLine, closingLedger, doneLine, isRating, nextStep, previousStep, tomorrowLine } from "./shutdown";

const task = (estimateMin: number | null): Task => ({
  id: "t" as TaskId,
  spaceId: "s" as SpaceId,
  projectId: null,
  headingId: null,
  title: "t",
  notes: null,
  state: "done",
  priority: 0,
  doDate: null,
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin,
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
});

describe("shutdown copy", () => {
  it("sums what got done, with the default estimate for guesses", () => {
    expect(doneLine([task(60), task(null), task(90)], 30)).toBe("You finished 3 things — about 3h.");
    expect(doneLine([task(25)], 30)).toBe("You finished 1 thing — about 25m.");
    expect(doneLine([], 30)).toMatch(/Some days are like that/);
  });

  it("is kind about what did not happen", () => {
    expect(carriedLine(5)).toBe("5 things didn’t happen. That’s normal.");
    expect(carriedLine(1)).toBe("1 thing didn’t happen. That’s normal.");
    expect(carriedLine(0)).toMatch(/Tomorrow starts clean/);
  });

  it("describes tomorrow honestly, including when it is already over", () => {
    expect(tomorrowLine(250, 3)).toBe("Tomorrow: 4h 10m spare, 3 things already on it.");
    expect(tomorrowLine(0, 0)).toBe("Tomorrow: 0m spare, nothing on it yet.");
    expect(tomorrowLine(-40, 6)).toBe("Tomorrow: 40m over already, 6 things already on it.");
    expect(tomorrowLine(null, 2)).toBe("Tomorrow: 2 things already on it.");
  });

  it("lays the closing moment out as facts, tomorrow in the spare colour", () => {
    const rows = closingLedger({ done: [task(60), task(null)], carried: 1, defaultEstimateMin: 30, rating: 4, highlight: " Shipped the thing ", tomorrow: { spareMin: 250, planned: 3 } });
    expect(rows).toEqual([
      { label: "Done", value: "2 things · 1h 30m" },
      { label: "Carried to tomorrow", value: "1 thing" },
      { label: "Day rating", value: "4 / 5" },
      { label: "Worth it", value: "Shipped the thing" },
      { label: "Tomorrow", value: "4h 10m spare", tone: "spare" },
    ]);
    expect(closingLedger({ done: [], carried: 0, defaultEstimateMin: 30, rating: null, highlight: "", tomorrow: { spareMin: -40, planned: 6 } })).toEqual([
      { label: "Done", value: "Nothing" },
      { label: "Carried to tomorrow", value: "Nothing" },
      { label: "Day rating", value: "Not rated", tone: "quiet" },
      { label: "Tomorrow", value: "40m over already", tone: "over" },
    ]);
    expect(closingLedger({ done: [], carried: 0, defaultEstimateMin: 30, rating: 2, highlight: "", tomorrow: { spareMin: null, planned: 0 } }).map((r) => r.label)).toEqual(["Done", "Carried to tomorrow", "Day rating"]);
  });

  it("reads each unfinished task's outcome from its live row, so an undo puts it back to waiting", () => {
    const today = localDate("2026-09-14");
    const open = (over: Partial<Task>): Task => ({ ...task(30), state: "active", doDate: today, ...over });
    expect(carryOutcome(open({}), today, false)).toBeNull();
    expect(carryOutcome(open({ doDate: localDate("2026-09-12") }), today, false)).toBeNull();
    expect(carryOutcome(open({}), today, true)).toBe("kept");
    expect(carryOutcome(open({ doDate: localDate("2026-09-15") }), today, true)).toBe("tomorrow");
    expect(carryOutcome(open({ state: "someday", doDate: null }), today, false)).toBe("someday");
    expect(carryOutcome(open({ state: "dropped" }), today, false)).toBe("dropped");
    expect(carryOutcome(open({ state: "archived" }), today, false)).toBe("dropped");
    expect(carryOutcome(open({ state: "done" }), today, false)).toBe("done");
    expect(carryOutcome(open({ doDate: localDate("2026-09-18") }), today, false)).toBe("moved");
    expect(carryOutcome(undefined, today, false)).toBeNull();
  });

  it("counts what goes on to tomorrow: moved there or left waiting, not parked, dropped or kept", () => {
    const rows = (["tomorrow", "tomorrow", null, "someday", "dropped", "kept", "done"] as const).map((outcome) => ({ task: task(30), outcome }));
    expect(carriedToTomorrow(rows)).toBe(3);
    // After "Move all to tomorrow" the ledger names what moved rather than "Nothing".
    expect(closingLedger({ done: [], carried: carriedToTomorrow(rows.slice(0, 2)), defaultEstimateMin: 30, rating: null, highlight: "", tomorrow: { spareMin: null, planned: 2 } })[1]).toEqual({ label: "Carried to tomorrow", value: "2 things" });
    expect(carriedToTomorrow(rows.slice(3))).toBe(0);
  });

  it("summarises a closed day", () => {
    expect(closedLine([task(60), task(120)], 30, "18:42", 4)).toBe("Closed at 18:42 · 2 done · 3h · rated 4/5");
    expect(closedLine([], 30, "19:05", null)).toBe("Closed at 19:05 · 0 done");
  });
});

describe("steps", () => {
  it("run in the settled order and stop at the ends", () => {
    expect(SHUTDOWN_STEPS).toEqual(["done", "carried", "rating", "highlight", "tomorrow", "close"]);
    expect(nextStep("done")).toBe("carried");
    expect(nextStep("close")).toBeNull();
    expect(previousStep("carried")).toBe("done");
    expect(previousStep("done")).toBeNull();
  });

  it("ratings are one to five", () => {
    expect([0, 1, 3, 5, 6, 2.5].map(isRating)).toEqual([false, true, true, true, false, false]);
  });
});
