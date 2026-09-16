// Adversarial tests for the date/time recogniser on its own: calendar
// overflow, DST days, year boundaries, leap days, 12-hour edge cases, and
// the chrono wrapper's independence from the reference offset.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { localDate, type LocalDate } from "../time";
import { findAbsoluteDates, findDates, findTimes, nextWeekMonday, weekdayOnOrAfter } from "./datetime";

const today = localDate("2026-09-11"); // Friday
const iso = (ms: { date: LocalDate }[]) => ms.map((m) => m.date.toString());
const times = (text: string) => findTimes(text).map((t) => `${t.start}-${t.end}:${t.time.toString({ smallestUnit: "minute" })}`);

describe("findDates", () => {
  it("rejects impossible ISO dates instead of constraining them", () => {
    for (const text of ["2026-02-30", "2027-02-29", "2026-13-45", "2026-00-10", "2026-04-31", "2026-09-00"]) {
      expect(findDates(text, today), `${text} should not be a date`).toEqual([]);
    }
  });

  it("accepts the leap day and the last day of every month", () => {
    expect(iso(findDates("2028-02-29", today))).toEqual(["2028-02-29"]);
    expect(iso(findDates("2026-12-31 2026-04-30", today))).toEqual(["2026-12-31", "2026-04-30"]);
  });

  it("keeps the longest match when relative phrases overlap", () => {
    expect(findDates("day after tomorrow", today).map((m) => [m.start, m.end, m.date.toString()])).toEqual([[0, 18, "2026-09-13"]]);
    expect(findDates("next mon mon", today).map((m) => m.date.toString())).toEqual(["2026-09-14", "2026-09-14"]);
    expect(findDates("this weekend", today).map((m) => m.date.toString())).toEqual(["2026-09-12"]);
  });

  it("does not match inside words", () => {
    expect(findDates("Mondayish fridays tomorrowland eomx", today)).toEqual([]);
    expect(findDates("satisfy sunset monk", today)).toEqual([]);
  });

  it("year-end and month-end arithmetic", () => {
    const dec31 = localDate("2026-12-31");
    expect(iso(findDates("tomorrow", dec31))).toEqual(["2027-01-01"]);
    expect(iso(findDates("next week", dec31))).toEqual(["2027-01-04"]);
    expect(iso(findDates("next month", dec31))).toEqual(["2027-01-01"]);
    expect(iso(findDates("in 1 month", localDate("2026-01-31")))).toEqual(["2026-02-28"]);
    expect(iso(findDates("in 1 month", localDate("2028-01-31")))).toEqual(["2028-02-29"]);
    expect(iso(findDates("eom", localDate("2028-02-01")))).toEqual(["2028-02-29"]);
    expect(iso(findDates("in 52 weeks", dec31))).toEqual(["2027-12-30"]);
    expect(iso(findDates("in 999 days", dec31))).toEqual(["2029-09-25"]);
  });

  it("`tonight` sets the evening flag, nothing else does", () => {
    const m = findDates("tonight tomorrow today", today);
    expect(m.map((x) => x.evening)).toEqual([true, false, false]);
  });

  it("is fast on a 20 000-character text", () => {
    const text = `${"lorem ipsum ".repeat(1600)} tmr`;
    const t0 = performance.now();
    const m = findDates(text, today);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(iso(m)).toEqual(["2026-09-12"]);
  });
});

describe("weekday helpers", () => {
  it("weekdayOnOrAfter lands on the asked weekday 0–6 days ahead; nextWeekMonday is the Monday 1–7 days ahead", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 800 }), fc.integer({ min: 1, max: 7 }), (n, wd) => {
        const d = localDate("2026-01-01").add({ days: n });
        const r = weekdayOnOrAfter(d, wd);
        expect(r.dayOfWeek).toBe(wd);
        const diff = r.since(d).days;
        expect(diff).toBeGreaterThanOrEqual(0);
        expect(diff).toBeLessThan(7);
        const m = nextWeekMonday(d);
        expect(m.dayOfWeek).toBe(1);
        const md = m.since(d).days;
        expect(md).toBeGreaterThanOrEqual(1);
        expect(md).toBeLessThanOrEqual(7);
      }),
    );
  });
});

describe("findTimes", () => {
  it("12-hour edge cases", () => {
    expect(times("12am 12pm 12:00am 12:59pm 1am 11:59pm")).toEqual(["0-4:00:00", "5-9:12:00", "10-17:00:00", "18-25:12:59", "26-29:01:00", "30-37:23:59"]);
  });

  it("24-hour edge cases", () => {
    expect(times("0:00 00:00 23:59 09:05")).toEqual(["0-4:00:00", "5-10:00:00", "11-16:23:59", "17-22:09:05"]);
    expect(times("24:00 25:00 9:60 12:5 1:234")).toEqual([]);
  });

  it("does not read a bare hour, a 12h time above 12, or dotted minutes with one digit", () => {
    expect(times("at 9 13pm 0am 15h 3 o'clock")).toEqual([]);
  });

  it("documents: `9:5pm` and `3.3pm` yield a time from their tail", () => {
    expect(times("9:5pm")).toEqual(["2-5:17:00"]);
    expect(times("3.3pm")).toEqual(["2-5:15:00"]);
  });

  it("includes a leading `at` in the span, and keeps the longest of overlapping matches", () => {
    expect(times("at 3:30pm")).toEqual(["0-9:15:30"]);
    expect(times("at  noon")).toEqual(["0-8:12:00"]);
    expect(times("3:30pm")).toEqual(["0-6:15:30"]); // not "30pm"
  });

  it("never returns overlapping matches, and every match slices to the same text", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("3pm", "3:30pm", "15:30", "noon", "midnight", "at", "12am", "12:00", "9", "pm", "am", "x", ":", "."), { minLength: 1, maxLength: 8 }).map((p) => p.join(" ")),
        (text) => {
          const ms = findTimes(text);
          for (let i = 1; i < ms.length; i++) expect(ms[i].start).toBeGreaterThanOrEqual(ms[i - 1].end);
          for (const m of ms) expect(m.end).toBeLessThanOrEqual(text.length);
        },
      ),
    );
  });
});

describe("findAbsoluteDates (chrono, strict)", () => {
  const abs = (text: string, t = today, off = 60) => findAbsoluteDates(text, t, off).map((m) => [m.start, m.end, m.date.toString(), m.time?.toString({ smallestUnit: "minute" }) ?? null]);

  it("refuses to guess the day", () => {
    expect(abs("sept")).toEqual([]);
    expect(abs("next year")).toEqual([]);
    expect(abs("5pm")).toEqual([]);
    expect(abs("2026")).toEqual([]);
    expect(abs("last monday")).toEqual([]);
    expect(abs("yesterday")).toEqual([]);
  });

  it("refuses the 31st of a 30-day month and Feb 29 in a common year", () => {
    expect(abs("nov 31")).toEqual([]);
    expect(abs("31 nov")).toEqual([]);
    expect(abs("feb 30")).toEqual([]);
    expect(abs("29 feb 2027")).toEqual([]);
    expect(abs("29 feb 2028")).toEqual([[0, 11, "2028-02-29", null]]);
  });

  it("resolves forward across the year end but keeps today as today", () => {
    const dec31 = localDate("2026-12-31");
    expect(abs("jan 5", dec31)).toEqual([[0, 5, "2027-01-05", null]]);
    expect(abs("dec 31", dec31)).toEqual([[0, 6, "2026-12-31", null]]);
    expect(abs("30 dec", dec31)).toEqual([[0, 6, "2027-12-30", null]]);
    expect(abs("29 feb", localDate("2027-03-01"))).toEqual([]); // documents: chrono only tries the nearest year, so "29 feb" typed in a common year is refused
  });

  it("gives the same calendar fields whatever the reference offset, including on DST days", () => {
    const offsets = [-720, -600, -300, -210, 0, 60, 330, 345, 630, 780, 840];
    for (const [text, t] of [
      ["oct 12 at 2pm", today],
      ["15 sept", today],
      ["mar 8 at 2:30am", localDate("2026-03-07")], // nonexistent wall time in New York on the 8th
      ["nov 1 at 1:30am", localDate("2026-10-31")], // repeated wall time in New York on the 1st
      ["29 mar 01:30", localDate("2026-03-28")], // nonexistent in London on the 29th
    ] as const) {
      const results = offsets.map((off) => JSON.stringify(abs(text, t, off)));
      expect(new Set(results).size, `${text}: ${results.join(" | ")}`).toBe(1);
    }
  });

  it("today's date stays this year whatever the reference offset (it flips to next year from +03:00 eastwards)", () => {
    // The reference handed to chrono is UTC noon *plus* `offsetMinutes` (12:00Z with timezone +330 is 17:30 local),
    // so on today's date a date-only match (implied 12:00) or an early time is "past" and forwardDate adds a year.
    for (const off of [-840, -300, 0, 60, 180, 330, 540, 780, 840]) {
      expect(abs("11 sept", today, off), `offset ${off}`).toEqual([[0, 7, "2026-09-11", null]]);
      expect(abs("11 sept at 9am", today, off), `offset ${off} with a time`).toEqual([[0, 14, "2026-09-11", "09:00"]]);
      expect(abs("mar 8 at 2:30am", localDate("2026-03-08"), off), `offset ${off} on a DST day`).toEqual([[0, 15, "2026-03-08", "02:30"]]);
    }
  });

  it("does not depend on the host process time zone", () => {
    // The parser is documented as pure and zone-safe; chrono builds comparison dates with `new Date(y, m, d, …)`
    // in the process's zone, so the same input gives different years on a UTC server and on a developer laptop.
    const saved = process.env.TZ;
    const probe = () =>
      JSON.stringify(
        (
          [
            ["dec 31", "2026-12-31"],
            ["11 sept", "2026-09-11"],
            ["sept 11 at 9am", "2026-09-11"],
            ["jan 5", "2026-12-31"],
          ] as const
        ).flatMap(([text, day]) => [0, 60, 330].map((off) => findAbsoluteDates(text, localDate(day), off).map((m) => [m.date.toString(), m.time?.toString({ smallestUnit: "minute" }) ?? null]))),
      );
    try {
      const results = new Map<string, string>();
      for (const tz of ["UTC", "Asia/Kolkata", "Pacific/Kiritimati", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        results.set(tz, probe());
      }
      expect(new Set(results.values()).size, [...results].map(([tz, r]) => `${tz}: ${r}`).join("\n")).toBe(1);
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it("keeps the span tight and never lets it swallow trailing blanks", () => {
    expect(abs("15 sept   ")).toEqual([[0, 7, "2026-09-15", null]]);
    expect(abs("oct 12 at 2pm ")).toEqual([[0, 13, "2026-10-12", "14:00"]]);
  });

  it("handles a 20 000-character text quickly", () => {
    const text = `${"lorem ipsum ".repeat(1600)} 15 sept`;
    const t0 = performance.now();
    expect(abs(text).map((m) => m[2])).toEqual(["2026-09-15"]);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
