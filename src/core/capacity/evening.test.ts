import { describe, expect, it } from "vitest";
import { localTime } from "../time";
import { eveningBudget, eveningStartMin } from "./evening";
import { workWindowsFor } from "./index";
import { DAY, WORK_HOURS } from "./__fixtures__/reference-day";

describe("eveningBudget (PRODUCT_SPEC.md §9.1, M1 gap rulings 2026-10-06)", () => {
  const base = { windows: workWindowsFor(DAY, WORK_HOURS), eveningStartsAt: localTime("18:00"), eveningEndsAt: localTime("22:00") };

  it("runs from the end of the last work segment to the cut-off, with no buffer", () => {
    expect(eveningBudget({ ...base, plannedMin: 40 })).toEqual({ startMin: 1080, endMin: 1320, budgetMin: 240, plannedMin: 40, full: false });
  });

  it("starts where a split day's last segment ends, not at the evening start", () => {
    const split = workWindowsFor(DAY, [
      { weekday: 2, start: localTime("09:00"), end: localTime("12:30") },
      { weekday: 2, start: localTime("13:30"), end: localTime("19:30") },
    ]);
    const b = eveningBudget({ ...base, windows: split, plannedMin: 0 });
    expect(b.startMin).toBe(19 * 60 + 30);
    expect(b.budgetMin).toBe(150);
  });

  it("starts at the evening start on a day without working hours", () => {
    const saturday = workWindowsFor(DAY.add({ days: 4 }), WORK_HOURS);
    expect(saturday).toEqual([]);
    expect(eveningStartMin(saturday, localTime("17:00"))).toBe(17 * 60);
    expect(eveningBudget({ ...base, windows: saturday, eveningStartsAt: localTime("17:00"), plannedMin: 0 }).budgetMin).toBe(300);
  });

  it("is full only past its budget, and zero when the cut-off is earlier than the evening's start", () => {
    expect(eveningBudget({ ...base, plannedMin: 240 }).full).toBe(false);
    expect(eveningBudget({ ...base, plannedMin: 245 }).full).toBe(true);
    const early = eveningBudget({ ...base, eveningEndsAt: localTime("17:00"), plannedMin: 15 });
    expect(early.budgetMin).toBe(0);
    expect(early.full).toBe(true);
    expect(eveningBudget({ ...base, eveningEndsAt: localTime("17:00"), plannedMin: 0 }).full).toBe(false);
  });

  it("reads a 00:00 cut-off as midnight", () => {
    expect(eveningBudget({ ...base, eveningEndsAt: localTime("00:00"), plannedMin: 0 })).toMatchObject({ endMin: 1440, budgetMin: 360 });
  });
});
