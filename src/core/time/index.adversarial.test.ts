// Adversarial tests for the time primitives: the rollover hour on DST days
// and in zones that change at midnight, out-of-range settings, wall times
// that do not exist or exist twice, and formatting of degenerate numbers.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { addDays, compareDates, dateOf, formatMinutes, formatTime, instant, localDate, localTime, minutesBetween, minutesOfDay, timeFromMinutes, timeOf, toInstant, todayFor } from "./index";
import { formatDay } from "./format-day";

describe("todayFor on awkward days", () => {
  const london = { timezone: "Europe/London", dayRolloverHour: 4 };

  it("spring forward (29 Mar 2026): the missing hour does not skip or repeat the day change", () => {
    expect(todayFor(london, instant("2026-03-29T00:59:00Z")).toString()).toBe("2026-03-28"); // 00:59 GMT
    expect(todayFor(london, instant("2026-03-29T01:00:00Z")).toString()).toBe("2026-03-28"); // 02:00 BST
    expect(todayFor(london, instant("2026-03-29T02:59:00Z")).toString()).toBe("2026-03-28"); // 03:59 BST
    expect(todayFor(london, instant("2026-03-29T03:00:00Z")).toString()).toBe("2026-03-29"); // 04:00 BST
  });

  it("fall back (25 Oct 2026): the repeated 01:xx hour is one day, and 04:00 GMT is the change", () => {
    expect(todayFor(london, instant("2026-10-25T00:30:00Z")).toString()).toBe("2026-10-24"); // 01:30 BST
    expect(todayFor(london, instant("2026-10-25T01:30:00Z")).toString()).toBe("2026-10-24"); // 01:30 GMT again
    expect(todayFor(london, instant("2026-10-25T03:59:00Z")).toString()).toBe("2026-10-24");
    expect(todayFor(london, instant("2026-10-25T04:00:00Z")).toString()).toBe("2026-10-25");
  });

  it("a zone whose DST change happens at midnight (America/Santiago) still changes day exactly once", () => {
    // 6 Sept 2026: 00:00 -04 jumps to 01:00 -03. With rollover hour 0 the day changes at 04:00Z.
    const santiago = { timezone: "America/Santiago", dayRolloverHour: 0 };
    expect(todayFor(santiago, instant("2026-09-06T03:59:00Z")).toString()).toBe("2026-09-05");
    expect(todayFor(santiago, instant("2026-09-06T04:00:00Z")).toString()).toBe("2026-09-06"); // 01:00 local
    // with rollover hour 1 there is no 00:xx that day, so the change is the same instant
    const santiago1 = { timezone: "America/Santiago", dayRolloverHour: 1 };
    expect(todayFor(santiago1, instant("2026-09-06T03:59:00Z")).toString()).toBe("2026-09-05");
    expect(todayFor(santiago1, instant("2026-09-06T04:00:00Z")).toString()).toBe("2026-09-06");
  });

  it("rollover hour 6 (the documented maximum) and 0 (the minimum) at the exact boundary", () => {
    const six = { timezone: "UTC", dayRolloverHour: 6 };
    expect(todayFor(six, instant("2026-09-15T05:59:59Z")).toString()).toBe("2026-09-14");
    expect(todayFor(six, instant("2026-09-15T06:00:00Z")).toString()).toBe("2026-09-15");
    const zero = { timezone: "UTC", dayRolloverHour: 0 };
    expect(todayFor(zero, instant("2026-09-15T00:00:00Z")).toString()).toBe("2026-09-15");
    expect(todayFor(zero, instant("2026-09-14T23:59:59Z")).toString()).toBe("2026-09-14");
  });

  it("documents: an out-of-range rollover hour is not clamped — 24 means 'always yesterday'", () => {
    expect(todayFor({ timezone: "UTC", dayRolloverHour: 24 }, instant("2026-09-15T12:00:00Z")).toString()).toBe("2026-09-14");
    expect(todayFor({ timezone: "UTC", dayRolloverHour: -1 }, instant("2026-09-15T00:00:00Z")).toString()).toBe("2026-09-15");
  });

  it("property: for a wall time that exists exactly once, todayFor(toInstant(d, t)) is d when t is at or after the rollover hour, else d − 1", () => {
    const zones = ["UTC", "Europe/London", "America/New_York", "America/Santiago", "Australia/Lord_Howe", "Pacific/Chatham", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Pago_Pago"];
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 365 * 6 }), fc.integer({ min: 0, max: 1439 }), fc.constantFrom(...zones), fc.integer({ min: 0, max: 6 }), (n, minute, zone, dayRolloverHour) => {
        const d = addDays(localDate("2024-01-01"), n);
        const t = timeFromMinutes(minute);
        const i = toInstant(d, t, zone);
        if (!timeOf(i, zone).equals(t) || !dateOf(i, zone).equals(d)) return; // a gap: the time was pushed
        const expected = t.hour >= dayRolloverHour ? d : d.subtract({ days: 1 });
        expect(todayFor({ timezone: zone, dayRolloverHour }, i).toString()).toBe(expected.toString());
      }),
      { numRuns: 500 },
    );
  });
});

describe("toInstant with wall times that do not exist or exist twice", () => {
  it("a time in the spring-forward gap is pushed later on the same day; an ambiguous time takes the earlier offset", () => {
    const gap = toInstant(localDate("2026-03-29"), localTime("01:30"), "Europe/London");
    expect(gap.toString()).toBe("2026-03-29T01:30:00Z"); // 02:30 BST
    expect(formatTime(timeOf(gap, "Europe/London"))).toBe("02:30");
    const twice = toInstant(localDate("2026-10-25"), localTime("01:30"), "Europe/London");
    expect(twice.toString()).toBe("2026-10-25T00:30:00Z"); // the BST one
  });

  it("Lord Howe's 30-minute shift: a wall time round-trips and the day is 23.5 or 24.5 hours long", () => {
    const zone = "Australia/Lord_Howe";
    const start = toInstant(localDate("2026-10-04"), localTime("00:00"), zone);
    const next = toInstant(localDate("2026-10-05"), localTime("00:00"), zone);
    expect(next.since(start).total({ unit: "minutes" })).toBe(1410); // DST starts 4 Oct: a 23.5-hour day
    const back = toInstant(localDate("2026-04-05"), localTime("00:00"), zone);
    const after = toInstant(localDate("2026-04-06"), localTime("00:00"), zone);
    expect(after.since(back).total({ unit: "minutes" })).toBe(1470);
  });
});

describe("minutes and formatting", () => {
  it("timeFromMinutes wraps, truncates fractions, and survives huge values", () => {
    expect(formatTime(timeFromMinutes(2880))).toBe("00:00");
    expect(formatTime(timeFromMinutes(-1))).toBe("23:59");
    expect(formatTime(timeFromMinutes(-1441))).toBe("23:59");
    expect(formatTime(timeFromMinutes(90.5))).toBe("01:30");
    expect(formatTime(timeFromMinutes(1e9))).toBe("10:40"); // 1e9 mod 1440 = 640
  });

  it("minutesOfDay and minutesBetween ignore seconds", () => {
    expect(minutesOfDay(localTime("23:59:59"))).toBe(1439);
    expect(minutesBetween(localTime("09:00:30"), localTime("09:01:00"))).toBe(1);
  });

  it("formatMinutes on fractions, huge numbers and non-numbers", () => {
    expect(formatMinutes(59.5)).toBe("1h");
    expect(formatMinutes(59.4)).toBe("59m");
    expect(formatMinutes(1439)).toBe("23h 59m");
    expect(formatMinutes(1e6)).toBe("16666h 40m");
    expect(formatMinutes(-0)).toBe("0m");
    expect(formatMinutes(Infinity)).toMatch(/^Infinity/); // documents: no guard
    expect(formatMinutes(NaN)).toBe("NaNh NaNm"); // documents: no guard
  });

  it("formatDay across the year boundary and for single-digit days", () => {
    expect(formatDay(localDate("2027-01-01"), { today: localDate("2026-12-31") })).toBe("Fri 1 Jan 2027");
    expect(formatDay(localDate("2026-12-31"), { today: localDate("2027-01-01") })).toBe("Thu 31 Dec 2026");
    expect(formatDay(localDate("2028-02-29"), { weekday: "long", month: "long", year: true })).toBe("Tuesday 29 February 2028");
    expect(formatDay(localDate("2026-09-05"), { weekday: "none" })).toBe("5 Sep");
  });

  it("addDays and compareDates across month ends and leap days", () => {
    expect(addDays(localDate("2026-01-31"), 1).toString()).toBe("2026-02-01");
    expect(addDays(localDate("2028-02-28"), 1).toString()).toBe("2028-02-29");
    expect(addDays(localDate("2027-02-28"), 1).toString()).toBe("2027-03-01");
    expect(addDays(localDate("2026-03-01"), -1).toString()).toBe("2026-02-28");
    expect(addDays(localDate("2026-09-15"), 0).toString()).toBe("2026-09-15");
    expect(compareDates(localDate("2026-09-15"), localDate("2026-09-15"))).toBe(0);
    expect(compareDates(localDate("2026-12-31"), localDate("2027-01-01"))).toBe(-1);
  });
});
