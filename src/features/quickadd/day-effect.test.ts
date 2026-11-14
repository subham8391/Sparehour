import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { dayCounted, dayEffect } from "./day-effect";

const today = localDate("2026-11-16"); // a Monday
const windows = [{ start: 9 * 60, end: 18 * 60 }];

describe("dayCounted: the working day a line takes time from", () => {
  it("is the line's do-date, today or later", () => {
    expect(dayCounted({ doDate: today, evening: false }, today)?.toString()).toBe("2026-11-16");
    expect(dayCounted({ doDate: localDate("2026-11-19"), evening: false }, today)?.toString()).toBe("2026-11-19");
  });

  it("is nothing for the Inbox, the evening or a day behind us", () => {
    expect(dayCounted({ doDate: null, evening: false }, today)).toBeNull();
    expect(dayCounted({ doDate: today, evening: true }, today)).toBeNull();
    expect(dayCounted({ doDate: localDate("2026-11-15"), evening: false }, today)).toBeNull();
  });
});

describe("dayEffect: the day with the line on it", () => {
  const on = (day: string, spareMin: number, countedMin: number | null = null, overflowMin = 0) => dayEffect({ day: localDate(day), today, after: { spareMin, overflowMin, windows }, countedMin });

  it("says what is left when it fits", () => {
    expect(on("2026-11-16", 170)).toEqual({ text: "Leaves 2h 50m spare today", over: false });
    expect(on("2026-11-17", 155)).toEqual({ text: "Leaves 2h 35m spare tomorrow", over: false });
    expect(on("2026-11-19", 30).text).toBe("Leaves 30m spare on Thu");
    expect(on("2026-12-03", 30).text).toBe("Leaves 30m spare on 3 Dec");
  });

  it("says by how much it is more than fits, in the ribbon's words", () => {
    expect(on("2026-11-16", -40)).toEqual({ text: "40m more than fits today", over: true });
    expect(on("2026-11-19", -70)).toEqual({ text: "1h 10m more than fits on Thu", over: true });
  });

  it("a line that takes the last of the day leaves none", () => {
    expect(on("2026-11-16", 0)).toEqual({ text: "Leaves no spare time today", over: false });
  });

  it("late in the day a plan that cannot finish is over, as the ribbon says it, whatever the budget", () => {
    expect(on("2026-11-16", 120, null, 40)).toEqual({ text: "~40m spills past 18:00", over: true });
  });

  it("no estimate counts as the default, and says so", () => {
    expect(on("2026-11-16", 170, 30).text).toBe("Leaves 2h 50m spare today · counted as 30m");
    expect(on("2026-11-16", -20, 30).text).toBe("20m more than fits today · counted as 30m");
    expect(on("2026-11-16", 60, 30, 15).text).toBe("~15m spills past 18:00 · counted as 30m");
  });
});
