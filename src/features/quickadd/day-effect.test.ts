import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { dayCounted, dayEffect } from "./day-effect";

const today = localDate("2026-11-16"); // a Monday

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

describe("dayEffect: what the line does to the day", () => {
  const on = (day: string, spareMin: number, estimateMin: number | null) => dayEffect({ day: localDate(day), today, spareMin, estimateMin, defaultEstimateMin: 30 });

  it("says what is left when it fits", () => {
    expect(on("2026-11-16", 200, 30)).toEqual({ text: "Leaves 2h 50m spare today", over: false });
    expect(on("2026-11-17", 200, 45)).toEqual({ text: "Leaves 2h 35m spare tomorrow", over: false });
    expect(on("2026-11-19", 90, 60).text).toBe("Leaves 30m spare on Thu");
    expect(on("2026-12-03", 90, 60).text).toBe("Leaves 30m spare on 3 Dec");
  });

  it("says by how much it is more than fits, in the ribbon's words", () => {
    expect(on("2026-11-16", 20, 60)).toEqual({ text: "40m more than fits today", over: true });
    // A day already over grows by the whole estimate.
    expect(on("2026-11-19", -40, 30)).toEqual({ text: "1h 10m more than fits on Thu", over: true });
  });

  it("a line that takes the last of the day leaves none", () => {
    expect(on("2026-11-16", 45, 45)).toEqual({ text: "Leaves no spare time today", over: false });
  });

  it("no estimate counts as the default, and says so", () => {
    expect(on("2026-11-16", 200, null).text).toBe("Leaves 2h 50m spare today · counted as 30m");
    expect(on("2026-11-16", 10, null).text).toBe("20m more than fits today · counted as 30m");
  });
});
