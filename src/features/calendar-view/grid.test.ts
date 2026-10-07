// The Calendar's rules (SCREENS.md §4, DESIGN_SYSTEM.md §4a): the days each mode shows, how `[` / `]` step them,
// the width bands and what each one draws, the folded weekend, the day `B` answers for and the header's title.
import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { calendarBand, columnsInView, focusDay, gridColumns, rangeTitle, shownDays, shownMode, stepAnchor, stepShown, visibleDays } from "./grid";

const iso = (days: readonly { toString(): string }[]) => days.map((d) => d.toString());
// Thu 8 Oct 2026
const thu = localDate("2026-10-08");

describe("the days a mode shows", () => {
  it("Day is the day itself; Work week is Monday to Friday of its week", () => {
    expect(iso(visibleDays(thu, "day", 0))).toEqual(["2026-10-08"]);
    expect(iso(visibleDays(thu, "workweek", 0))).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    // A Sunday belongs to the week that ends with it.
    expect(iso(visibleDays(localDate("2026-10-11"), "workweek", 0))[0]).toBe("2026-10-05");
  });

  it("Week is seven days from the person's week start", () => {
    expect(iso(visibleDays(thu, "week", 0))).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    // week_start 6 = Sunday
    expect(iso(visibleDays(thu, "week", 6))).toEqual(["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
  });

  it("[ and ] step a day in the Day mode and a week in the week modes", () => {
    expect(stepAnchor(thu, "day", 1).toString()).toBe("2026-10-09");
    expect(stepAnchor(thu, "day", -1).toString()).toBe("2026-10-07");
    expect(stepAnchor(thu, "workweek", 1).toString()).toBe("2026-10-15");
    expect(stepAnchor(thu, "week", -1).toString()).toBe("2026-10-01");
    expect(iso(visibleDays(stepAnchor(thu, "week", 1), "week", 0))[0]).toBe("2026-10-12");
  });
});

describe("the width bands", () => {
  it("phone below 640, three columns to 899, five to 1179, seven from 1180", () => {
    expect(calendarBand(390, 350)).toBe("phone");
    expect(calendarBand(700, 640)).toBe("narrow");
    expect(calendarBand(1000, 700)).toBe("medium");
    expect(calendarBand(1400, 1100)).toBe("wide");
  });

  it("steps down when the grid itself has less room than its band assumes", () => {
    expect(calendarBand(1200, 600)).toBe("medium");
    expect(calendarBand(1000, 500)).toBe("narrow");
  });

  it("a phone held sideways is its own band, whatever its width", () => {
    expect(calendarBand(844, 800, true)).toBe("landscape");
  });

  it("the phone draws the Day mode only, and three days held sideways; the rest draw the chosen mode", () => {
    expect(shownMode("week", "phone")).toBe("day");
    expect(shownMode("workweek", "landscape")).toBe("three");
    expect(shownMode("workweek", "narrow")).toBe("workweek");
    expect(iso(shownDays(thu, "three", 0))).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(stepShown(thu, "three", 1).toString()).toBe("2026-10-09");
  });

  it("the narrow band and the sideways phone show three columns at a time; the others show them all", () => {
    expect(columnsInView("narrow", 7)).toBe(3);
    expect(columnsInView("landscape", 3)).toBe(3);
    expect(columnsInView("narrow", 1)).toBe(1);
    expect(columnsInView("medium", 6)).toBe(6);
  });
});

describe("columns", () => {
  const week = visibleDays(thu, "week", 0);

  it("the medium band folds Saturday and Sunday into one column until unfolded", () => {
    const folded = gridColumns(week, "medium", false);
    expect(folded.map((c) => (c.kind === "day" ? c.day.toString() : `fold:${iso(c.days).join("+")}`))).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "fold:2026-10-10+2026-10-11",
    ]);
    expect(gridColumns(week, "medium", true)).toHaveLength(7);
    expect(gridColumns(week, "wide", false)).toHaveLength(7);
    expect(gridColumns(week, "narrow", false)).toHaveLength(7);
  });

  it("a week that starts on Sunday folds its weekend days where they fall", () => {
    const fromSunday = visibleDays(thu, "week", 6);
    const kinds = gridColumns(fromSunday, "medium", false).map((c) => c.kind);
    expect(kinds).toEqual(["folded", "day", "day", "day", "day", "day", "folded"]);
  });
});

describe("the day B answers for", () => {
  it("today when it is on screen, else the first day still ahead, else none", () => {
    const week = visibleDays(thu, "week", 0);
    expect(focusDay(week, thu)?.toString()).toBe("2026-10-08");
    expect(focusDay(visibleDays(thu, "week", 0), localDate("2026-10-01"))?.toString()).toBe("2026-10-05");
    expect(focusDay([thu], localDate("2026-10-08"))?.toString()).toBe("2026-10-08");
    expect(focusDay(week, localDate("2026-10-20"))).toBeNull();
  });
});

describe("the title", () => {
  it("names the day, or the range within a month, or across months", () => {
    expect(rangeTitle([thu], thu)).toBe("Thursday 8 October");
    expect(rangeTitle(visibleDays(thu, "workweek", 0), thu)).toBe("Mon 5 – Fri 9 October");
    expect(rangeTitle(visibleDays(localDate("2026-09-30"), "week", 0), thu)).toBe("Mon 28 Sep – Sun 4 Oct");
  });
});
