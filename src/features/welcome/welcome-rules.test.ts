import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/core/quickadd";
import { localDate } from "@/core/time";
import {
  BRAIN_DUMP_TODAY_LIMIT,
  brainDumpDraft,
  hoursError,
  hoursNote,
  keptForThen,
  nextLabel,
  settledWeek,
  startingHours,
  stripWeek,
  type Segment,
} from "./welcome-rules";

const nine: Segment = { start: "09:00", end: "18:00" };
const weekdays = (seg: Segment): Segment[][] => [0, 1, 2, 3, 4, 5, 6].map((d) => (d < 5 ? [{ ...seg }] : []));

describe("working hours (ONBOARDING.md 1b)", () => {
  it("a new account's Mon–Fri 09:00–18:00 is the strip, ready for one tap", () => {
    const { strip, perDay } = startingHours(weekdays(nine));
    expect(perDay).toBe(false);
    expect(strip.days).toEqual([true, true, true, true, true, false, false]);
    expect(strip.hours).toEqual(nine);
    expect(stripWeek(strip)).toEqual(weekdays(nine));
  });

  it("starts from the default when no day is a working day yet", () => {
    const { strip, perDay } = startingHours([[], [], [], [], [], [], []]);
    expect(perDay).toBe(false);
    expect(strip.days.filter(Boolean)).toHaveLength(5);
    expect(strip.hours).toEqual(nine);
  });

  it("opens the per-day rows when the saved days differ or are split", () => {
    const split = weekdays(nine);
    split[2] = [
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
    ];
    expect(startingHours(split).perDay).toBe(true);
    const short = weekdays(nine);
    short[4] = [{ start: "09:00", end: "13:00" }];
    expect(startingHours(short).perDay).toBe(true);
  });

  it("blocks the save with the spec's words", () => {
    expect(hoursError([[], [], [], [], [], [], []])).toBe("Pick at least one working day.");
    expect(hoursError(weekdays({ start: "18:00", end: "09:00" }))).toBe("End time is before the start.");
    expect(hoursError(weekdays({ start: "09:00", end: "09:00" }))).toBe("End time is before the start.");
    expect(hoursError(weekdays({ start: "", end: "18:00" }))).toBe("Use a time like 09:00.");
    expect(hoursError(weekdays(nine))).toBeNull();
  });

  it("notes a day over 16 hours without refusing it", () => {
    const long = weekdays({ start: "06:00", end: "23:00" });
    expect(hoursError(long)).toBeNull();
    expect(hoursNote(long)).toBe("That's a long day.");
    expect(hoursNote(weekdays(nine))).toBeNull();
  });

  it("joins overlapping stretches on save", () => {
    const week = weekdays(nine);
    week[0] = [
      { start: "12:00", end: "18:00" },
      { start: "09:00", end: "13:00" },
    ];
    expect(settledWeek(week)[0]).toEqual([nine]);
  });
});

describe("the brain dump (ONBOARDING.md step 3)", () => {
  const today = localDate("2026-10-07"); // a Wednesday
  const line = (patch: Partial<ReturnType<typeof emptyDraft>>) => ({ ...emptyDraft(), title: "Call the plumber", ...patch });

  it("puts a line with no day of its own on today", () => {
    expect(brainDumpDraft(line({}), today, 0).doDate?.toString()).toBe("2026-10-07");
    expect(brainDumpDraft(line({ estimateMin: 45 }), today, 5).doDate?.toString()).toBe("2026-10-07");
  });

  it("keeps a day the line names, and says so", () => {
    const friday = line({ doDate: localDate("2026-10-09") });
    expect(brainDumpDraft(friday, today, 0)).toBe(friday);
    expect(keptForThen(friday, today)).toBe("Friday — I'll keep it for then.");
    expect(keptForThen(line({ doDate: localDate("2026-10-08") }), today)).toBe("Tomorrow — I'll keep it for then.");
    expect(keptForThen(line({ doDate: localDate("2026-10-20") }), today)).toBe("Tue 20 Oct — I'll keep it for then.");
    expect(keptForThen(line({ doDate: today }), today)).toBeNull();
    expect(keptForThen(brainDumpDraft(line({}), today, 0), today)).toBeNull();
  });

  it("lets a start date follow the parser", () => {
    const later = line({ startDate: localDate("2026-10-12") });
    expect(brainDumpDraft(later, today, 0)).toBe(later);
    expect(brainDumpDraft(later, today, 0).doDate).toBeNull();
  });

  it("sends the 21st line and on to the Inbox", () => {
    expect(BRAIN_DUMP_TODAY_LIMIT).toBe(20);
    expect(brainDumpDraft(line({}), today, 19).doDate?.toString()).toBe("2026-10-07");
    expect(brainDumpDraft(line({}), today, 20).doDate).toBeNull();
    expect(brainDumpDraft(line({}), today, 31).doDate).toBeNull();
    // A line that names its own day still keeps it.
    expect(brainDumpDraft(line({ doDate: today }), today, 25).doDate?.toString()).toBe("2026-10-07");
  });

  it("counts what is on the plate in the primary", () => {
    expect(nextLabel(0)).toBe("Next");
    expect(nextLabel(1)).toBe("Next — 1 thing");
    expect(nextLabel(5)).toBe("Next — 5 things");
  });
});
