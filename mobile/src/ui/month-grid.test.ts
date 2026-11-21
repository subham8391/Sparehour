// The calendar's month: whole weeks from Monday, every day of the month once, nothing from the months beside it.
import { localDate } from "@/core/time";
import { monthWeeks } from "./month-grid";

const iso = (weeks: ReturnType<typeof monthWeeks>) => weeks.map((w) => w.map((d) => (d ? d.day : 0)));

describe("monthWeeks", () => {
  it("starts each week on Monday and leaves the days outside the month empty", () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const weeks = monthWeeks(localDate("2026-11-21"));
    expect(iso(weeks)[0]).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(iso(weeks)[1]).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(iso(weeks).at(-1)).toEqual([30, 0, 0, 0, 0, 0, 0]);
    expect(weeks).toHaveLength(6);
  });

  it("a month that fills its weeks exactly has no empty places", () => {
    // February 2027 starts on a Monday and has 28 days.
    const weeks = monthWeeks(localDate("2027-02-10"));
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every(Boolean)).toBe(true);
  });

  it("has every day of a leap February once", () => {
    const days = monthWeeks(localDate("2028-02-01")).flat().filter(Boolean);
    expect(days).toHaveLength(29);
    expect(days[28]?.toString()).toBe("2028-02-29");
  });
});
