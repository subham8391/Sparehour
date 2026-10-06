import { describe, expect, it } from "vitest";
import { capacityFor } from "@/core/capacity";
import { DAY, REFERENCE_DAY, task } from "@/core/capacity/__fixtures__/reference-day";
import { formatMinutes, instant, localDate } from "@/core/time";
import { heroState } from "@/features/today/ribbon";
import { clampOffset, dayPrefill, dayReadout, neighbourColumn, shiftDay, startOfWeek, stepInColumn, weekBand, weekColumns, weekTotalLine, weekWindow, type DayReadout } from "./week";

const TUE = localDate("2026-10-06");
const iso = (days: { toString(): string }[]) => days.map((d) => d.toString());

describe("the seven days on screen", () => {
  it("rolling: today and the six days after it", () => {
    expect(iso(weekWindow(TUE, "rolling", 0, 0))).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
  });

  it("calendar week: Monday to Sunday on the default week start, the person's own start otherwise", () => {
    expect(iso(weekWindow(TUE, "calendar", 0, 0))).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    // week_start 6 = Sunday
    expect(weekWindow(TUE, "calendar", 6, 0)[0].toString()).toBe("2026-10-04");
    expect(startOfWeek(localDate("2026-10-11"), 0).toString()).toBe("2026-10-05"); // a Sunday belongs to the Monday before it
    expect(startOfWeek(localDate("2026-10-05"), 0).toString()).toBe("2026-10-05");
  });

  it("[ and ] shift the window by a whole week and never before this week (window offset)", () => {
    expect(weekWindow(TUE, "rolling", 0, 1)[0].toString()).toBe("2026-10-13");
    expect(weekWindow(TUE, "rolling", 0, 2)[6].toString()).toBe("2026-10-26");
    expect(weekWindow(TUE, "calendar", 0, 1)[0].toString()).toBe("2026-10-12");
    expect(weekWindow(TUE, "rolling", 0, -3)[0].toString()).toBe("2026-10-06");
    expect(clampOffset(-1)).toBe(0);
    expect(clampOffset(2.7)).toBe(2);
    expect(clampOffset(Number.NaN)).toBe(0);
  });
});

describe("the width bands (band layout selection)", () => {
  it("follows the viewport: stacked below 640, then 3, 5 and 7 columns", () => {
    expect(weekBand(360, 320)).toBe("phone");
    expect(weekBand(700, 596)).toBe("narrow");
    expect(weekBand(899, 795)).toBe("narrow");
    expect(weekBand(1000, 684)).toBe("medium");
    expect(weekBand(1280, 964)).toBe("wide");
    expect(weekBand(1180, 864)).toBe("wide");
  });

  it("steps down when the planner has less room than its band assumes (the detail pane is open beside it)", () => {
    expect(weekBand(1280, 580)).toBe("medium");
    expect(weekBand(1000, 500)).toBe("narrow");
    // never up: a narrow viewport with a roomy column stays narrow
    expect(weekBand(899, 900)).toBe("narrow");
  });
});

describe("weekend folding", () => {
  const days = (first: string) => weekWindow(localDate(first), "rolling", 0, 0);
  const shape = (cols: { days: { dayOfWeek: number }[] }[]) => cols.map((c) => c.days.map((d) => d.dayOfWeek).join("+"));

  it("the medium band folds Saturday and the Sunday after it into one column", () => {
    expect(shape(weekColumns(days("2026-10-06"), (d) => d, true))).toEqual(["2", "3", "4", "5", "6+7", "1"]);
    expect(shape(weekColumns(days("2026-10-05"), (d) => d, true))).toEqual(["1", "2", "3", "4", "5", "6+7"]);
  });

  it("a weekend split across the window's ends is not folded; nor is anything in the other bands", () => {
    expect(shape(weekColumns(days("2026-10-11"), (d) => d, true))).toEqual(["7", "1", "2", "3", "4", "5", "6"]);
    expect(weekColumns(days("2026-10-06"), (d) => d, false)).toHaveLength(7);
  });
});

describe("a day's readout", () => {
  it("names the spare time, or what is over, or that there are no working hours", () => {
    expect(dayReadout(capacityFor(REFERENCE_DAY), false)).toEqual({ kind: "spare", min: 200, text: "3h 20m spare" });
    const heavy = capacityFor({ ...REFERENCE_DAY, now: undefined, tasks: [...REFERENCE_DAY.tasks, task("deck", 240)] });
    expect(dayReadout(heavy, false)).toEqual({ kind: "over", min: 40, text: "40m over" });
    const saturday = capacityFor({ ...REFERENCE_DAY, day: localDate("2026-09-19") });
    expect(dayReadout(saturday, false)).toEqual({ kind: "off", min: 0, text: "no working hours" });
    const away = capacityFor({
      ...REFERENCE_DAY,
      events: [{ ...REFERENCE_DAY.events[0], allDay: true, startAt: null, endAt: null, startDate: DAY, endDate: DAY.add({ days: 1 }), eventType: "outOfOffice" }],
    });
    expect(dayReadout(away, false).text).toBe("out of office");
  });

  it("today's is the hero's own figure, spill included, so the week and Today never disagree", () => {
    // Late in the day with a lot left: it spills past 18:00 while the day's budget alone says less.
    const late = capacityFor({ ...REFERENCE_DAY, now: instant("2026-09-15T17:00:00+01:00"), tasks: [...REFERENCE_DAY.tasks, task("deck", 120)] });
    const h = heroState(late);
    expect(h.over).toBe(true);
    expect(h.spill).not.toBeNull();
    expect(dayReadout(late, true)).toEqual({ kind: "over", min: h.min, text: `${formatMinutes(h.min)} over` });
    // The same capacity read as any other day would print the budget's figure instead.
    expect(dayReadout(late, false).min).toBe(Math.abs(late.spareMin));
    expect(dayReadout(late, false).min).not.toBe(h.min);
  });
});

describe("the week total", () => {
  const r = (kind: DayReadout["kind"], min: number): DayReadout => ({ kind, min, text: "" });

  it("adds the spare days and leaves an over day out rather than taking it away (SCREENS.md §3: 11h 15m)", () => {
    // The mockup's week: 3h20 · 1h05 · 20m over · 2h40 · no hours · no hours · 4h10
    expect(weekTotalLine([r("spare", 200), r("spare", 65), r("over", 20), r("spare", 160), r("off", 0), r("off", 0), r("spare", 250)], true)).toBe("11h 15m spare this week");
    expect(weekTotalLine([r("spare", 60)], false)).toBe("1h spare that week");
    expect(weekTotalLine([r("off", 0), null], true)).toBe("No working hours this week");
  });
});

describe("the words quick add opens with for a day", () => {
  it("reads back as that day", () => {
    expect(dayPrefill(TUE, TUE)).toBe("today ");
    expect(dayPrefill(TUE.add({ days: 1 }), TUE)).toBe("tomorrow ");
    expect(dayPrefill(localDate("2026-10-14"), TUE)).toBe("14 Oct ");
  });
});

describe("keyboard between and within columns", () => {
  const columns = [["a1", "a2", "a3"], [], ["c1"], ["d1", "d2"]];

  it("← / → move a day, never onto a day already gone", () => {
    expect(shiftDay(localDate("2026-10-08"), -1, TUE)?.toString()).toBe("2026-10-07");
    expect(shiftDay(TUE, -1, TUE)).toBeNull();
    expect(shiftDay(TUE, 1, TUE)?.toString()).toBe("2026-10-07");
  });

  it("J / K stay inside the column and hold at its ends", () => {
    expect(stepInColumn(columns, "a1", 1)).toBe("a2");
    expect(stepInColumn(columns, "a3", 1)).toBe("a3");
    expect(stepInColumn(columns, "a1", -1)).toBe("a1");
    expect(stepInColumn(columns, "rail", 1)).toBeNull();
    expect(stepInColumn(columns, null, 1)).toBeNull();
  });

  it("Tab crosses to the nearest column with rows, at the same height or its last row, and lets go at the ends", () => {
    expect(neighbourColumn(columns, "a3", 1)).toBe("c1");
    expect(neighbourColumn(columns, "a2", 1)).toBe("c1");
    expect(neighbourColumn(columns, "c1", 1)).toBe("d1");
    expect(neighbourColumn(columns, "d2", -1)).toBe("c1");
    expect(neighbourColumn(columns, "d1", 1)).toBeNull();
    expect(neighbourColumn(columns, "a1", -1)).toBeNull();
    expect(neighbourColumn(columns, null, 1)).toBeNull();
  });
});
