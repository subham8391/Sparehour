import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  addDays,
  compareDates,
  dateOf,
  formatMinutes,
  formatTime,
  instant,
  localDate,
  localTime,
  minutesBetween,
  timeFromMinutes,
  toInstant,
  todayFor,
  weekdayOf,
} from "./index";

const ZONES = [
  "UTC",
  "Europe/London",
  "Asia/Kolkata",
  "America/Santiago",
  "Australia/Lord_Howe",
  "Pacific/Chatham",
];

describe("todayFor", () => {
  const london = { timezone: "Europe/London", dayRolloverHour: 4 };

  it("counts 01:30 as still yesterday when the day rolls over at 04:00", () => {
    // 01:30 BST on Tue 15 Sept = 00:30Z
    expect(todayFor(london, instant("2026-09-15T00:30:00Z")).toString()).toBe("2026-09-14");
  });

  it("switches to the new day exactly at the rollover hour", () => {
    expect(todayFor(london, instant("2026-09-15T02:59:59Z")).toString()).toBe("2026-09-14");
    expect(todayFor(london, instant("2026-09-15T03:00:00Z")).toString()).toBe("2026-09-15");
  });

  it("uses plain midnight when the rollover hour is 0", () => {
    const s = { timezone: "Europe/London", dayRolloverHour: 0 };
    expect(todayFor(s, instant("2026-09-14T23:30:00Z")).toString()).toBe("2026-09-15");
  });

  it("follows the user's zone, not the server's", () => {
    // 22:00Z on the 14th is already 03:30 on the 15th in Kolkata — still the 14th before 04:00
    const kolkata = { timezone: "Asia/Kolkata", dayRolloverHour: 4 };
    expect(todayFor(kolkata, instant("2026-09-14T22:00:00Z")).toString()).toBe("2026-09-14");
    expect(todayFor(kolkata, instant("2026-09-14T23:00:00Z")).toString()).toBe("2026-09-15");
  });

  it("never returns a day other than the local date or the one before it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 11, 31) }),
        fc.constantFrom(...ZONES),
        fc.integer({ min: 0, max: 6 }),
        (ms, timezone, dayRolloverHour) => {
          const now = instant(new Date(ms).toISOString());
          const today = todayFor({ timezone, dayRolloverHour }, now);
          const wall = dateOf(now, timezone);
          const diff = wall.since(today).days;
          expect(diff === 0 || diff === 1).toBe(true);
        },
      ),
    );
  });

  it("is monotonic: a later instant never gives an earlier day", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 11, 31) }),
        fc.integer({ min: 1, max: 48 * 3600 * 1000 }),
        fc.constantFrom(...ZONES),
        fc.integer({ min: 0, max: 6 }),
        (ms, delta, timezone, dayRolloverHour) => {
          const settings = { timezone, dayRolloverHour };
          const a = todayFor(settings, instant(new Date(ms).toISOString()));
          const b = todayFor(settings, instant(new Date(ms + delta).toISOString()));
          expect(compareDates(a, b)).not.toBe(1);
        },
      ),
    );
  });
});

describe("toInstant / dateOf", () => {
  it("round-trips a wall time in every zone, including 30-minute DST zones", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 * 15 }),
        fc.integer({ min: 0, max: 1439 }),
        fc.constantFrom(...ZONES),
        (dayOffset, minute, zone) => {
          const d = addDays(localDate("2020-01-01"), dayOffset);
          const t = timeFromMinutes(minute);
          const i = toInstant(d, t, zone);
          // Times inside a spring-forward gap are pushed later, but never onto another day.
          expect(dateOf(i, zone).toString()).toBe(d.toString());
        },
      ),
    );
  });

  it("does not use millisecond arithmetic for tomorrow", () => {
    // Australia/Lord_Howe shifts by 30 minutes; a 24 h addition would be wrong here.
    const d = localDate("2026-10-04"); // DST starts this day in Lord Howe
    expect(addDays(d, 1).toString()).toBe("2026-10-05");
    expect(weekdayOf(localDate("2026-09-14"))).toBe(1); // Monday
    expect(weekdayOf(localDate("2026-09-13"))).toBe(7); // Sunday
  });
});

describe("durations and formatting", () => {
  it("formats minutes the way the design system specifies", () => {
    expect(formatMinutes(200)).toBe("3h 20m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(120, { padMinutes: true })).toBe("2h 00m");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(5)).toBe("5m");
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(-15)).toBe("0m");
    expect(formatMinutes(65.4)).toBe("1h 05m");
  });

  it("formats times as zero-padded 24-hour clock", () => {
    expect(formatTime(localTime("09:45"))).toBe("09:45");
    expect(formatTime(localTime("16:30"))).toBe("16:30");
    expect(formatTime(localTime("00:05"))).toBe("00:05");
  });

  it("measures minutes between wall times, signed", () => {
    expect(minutesBetween(localTime("09:00"), localTime("18:00"))).toBe(540);
    expect(minutesBetween(localTime("18:00"), localTime("09:00"))).toBe(-540);
    expect(minutesBetween(localTime("09:41"), localTime("09:41"))).toBe(0);
  });

  it("timeFromMinutes wraps around the day", () => {
    expect(formatTime(timeFromMinutes(585))).toBe("09:45");
    expect(formatTime(timeFromMinutes(1440))).toBe("00:00");
    expect(formatTime(timeFromMinutes(-30))).toBe("23:30");
  });
});
