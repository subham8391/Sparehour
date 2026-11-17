import { describe, expect, it } from "vitest";
import { instant, localDate } from "@/core/time";
import { minuteFromDay, minuteOnDay } from "./day-minute";

const day = localDate("2026-11-16");
const at = (iso: string) => instant(iso);

describe("where now falls on a day", () => {
  it("minuteOnDay stops at the day's own ends: 0 before it, 1440 once the clock is past its midnight", () => {
    expect(minuteOnDay(at("2026-11-15T23:00:00Z"), "Europe/London", day)).toEqual({ minute: 0, onDay: false });
    expect(minuteOnDay(at("2026-11-16T14:30:00Z"), "Europe/London", day)).toEqual({ minute: 870, onDay: true });
    expect(minuteOnDay(at("2026-11-17T01:30:00Z"), "Europe/London", day)).toEqual({ minute: 1440, onDay: false });
  });

  it("minuteFromDay runs on past midnight, for a day that lasts until its rollover hour", () => {
    expect(minuteFromDay(at("2026-11-15T23:00:00Z"), "Europe/London", day)).toBe(0);
    expect(minuteFromDay(at("2026-11-16T14:30:00Z"), "Europe/London", day)).toBe(870);
    expect(minuteFromDay(at("2026-11-16T23:59:00Z"), "Europe/London", day)).toBe(1439);
    expect(minuteFromDay(at("2026-11-17T00:00:00Z"), "Europe/London", day)).toBe(1440);
    expect(minuteFromDay(at("2026-11-17T01:30:00Z"), "Europe/London", day)).toBe(1530);
  });

  it("reads the wall clock of the account's zone, not UTC", () => {
    // 20:30 UTC on the 16th is 02:00 on the 17th in Kolkata.
    expect(minuteFromDay(at("2026-11-16T20:30:00Z"), "Asia/Kolkata", day)).toBe(1440 + 120);
    expect(minuteOnDay(at("2026-11-16T20:30:00Z"), "Asia/Kolkata", day).minute).toBe(1440);
  });
});
