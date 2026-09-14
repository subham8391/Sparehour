import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { dateOf, localDate, localTime, toInstant } from "../time";
import { advanceOnCompletion, changeRule, isOccurrence, isValidRule, nextOccurrence, occurrencesAfter, occurrencesBetween } from "./index";

const d = localDate;
const iso = (dates: ReturnType<typeof localDate>[]) => dates.map((x) => x.toString());

describe("occurrencesAfter — golden table", () => {
  const cases: [rule: string, dtstart: string, after: string, expected: string[]][] = [
    ["FREQ=DAILY", "2026-09-11", "2026-09-11", ["2026-09-12", "2026-09-13", "2026-09-14"]],
    ["FREQ=DAILY;INTERVAL=3", "2026-09-11", "2026-09-11", ["2026-09-14", "2026-09-17", "2026-09-20"]],
    ["FREQ=WEEKLY", "2026-09-11", "2026-09-11", ["2026-09-18", "2026-09-25", "2026-10-02"]],
    ["FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-09-11", "2026-09-11", ["2026-09-14", "2026-09-16", "2026-09-18"]],
    ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-09-11", "2026-09-11", ["2026-09-14", "2026-09-15", "2026-09-16"]],
    ["FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", "2026-09-09", "2026-09-09", ["2026-09-23", "2026-10-07", "2026-10-21"]],
    ["FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", "2026-09-09", "2026-09-30", ["2026-10-07", "2026-10-21", "2026-11-04"]],
    ["FREQ=MONTHLY", "2026-01-31", "2026-01-31", ["2026-03-31", "2026-05-31", "2026-07-31"]],
    ["FREQ=MONTHLY;BYMONTHDAY=15", "2026-09-11", "2026-09-11", ["2026-09-15", "2026-10-15", "2026-11-15"]],
    ["FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1", "2026-09-11", "2026-09-11", ["2026-09-28", "2026-10-26", "2026-11-30"]],
    ["FREQ=MONTHLY;BYDAY=1FR", "2026-09-11", "2026-09-11", ["2026-10-02", "2026-11-06", "2026-12-04"]],
    ["FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1", "2026-09-01", "2026-09-01", ["2026-12-01", "2027-03-01", "2027-06-01"]],
    ["FREQ=YEARLY", "2026-02-28", "2026-02-28", ["2027-02-28", "2028-02-28", "2029-02-28"]],
    ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", "2024-02-29", "2024-02-29", ["2028-02-29", "2032-02-29", "2036-02-29"]],
    ["FREQ=DAILY;UNTIL=20260913", "2026-09-11", "2026-09-11", ["2026-09-12", "2026-09-13"]],
    ["FREQ=DAILY;COUNT=3", "2026-09-11", "2026-09-11", ["2026-09-12", "2026-09-13"]],
    ["FREQ=DAILY;COUNT=3", "2026-09-11", "2026-09-13", []],
    ["FREQ=WEEKLY;BYDAY=SA,SU", "2026-09-11", "2026-09-11", ["2026-09-12", "2026-09-13", "2026-09-19"]],
    ["FREQ=WEEKLY;BYDAY=MO", "2026-09-14", "2026-09-14", ["2026-09-21", "2026-09-28", "2026-10-05"]],
    ["FREQ=DAILY", "2026-10-24", "2026-10-24", ["2026-10-25", "2026-10-26", "2026-10-27"]], // across the UK DST change
    ["FREQ=DAILY", "2026-12-30", "2026-12-30", ["2026-12-31", "2027-01-01", "2027-01-02"]],
    ["FREQ=MONTHLY;BYDAY=-1FR", "2026-09-11", "2026-09-11", ["2026-09-25", "2026-10-30", "2026-11-27"]],
  ];
  for (const [rule, dtstart, after, expected] of cases) {
    it(`${rule} from ${dtstart} after ${after}`, () => {
      expect(iso(occurrencesAfter(rule, d(dtstart), d(after), 3))).toEqual(expected);
    });
  }

  it("refuses rules that smuggle in a DTSTART or TZID", () => {
    expect(() => occurrencesAfter("DTSTART:20260911T000000Z\nRRULE:FREQ=DAILY", d("2026-09-11"), d("2026-09-11"), 1)).toThrow();
    expect(isValidRule("FREQ=DAILY")).toBe(true);
    expect(isValidRule("FREQ=SOMETIMES")).toBe(false);
  });
});

describe("nextOccurrence", () => {
  it("fixed: the next scheduled date after the later of do-date and completion day", () => {
    // Friday's standup completed on Monday: next is Tuesday, not Saturday's rollover
    expect(nextOccurrence({ rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", mode: "fixed", doDate: d("2026-09-11"), completedOn: d("2026-09-14") })?.toString()).toBe("2026-09-15");
    // completed on time
    expect(nextOccurrence({ rule: "FREQ=DAILY;INTERVAL=3", mode: "fixed", doDate: d("2026-09-11"), completedOn: d("2026-09-11") })?.toString()).toBe("2026-09-14");
    // completed early: still advances from the scheduled occurrence
    expect(nextOccurrence({ rule: "FREQ=WEEKLY;BYDAY=FR", mode: "fixed", doDate: d("2026-09-11"), completedOn: d("2026-09-09") })?.toString()).toBe("2026-09-18");
  });

  it("after_completion: counts from the completion day", () => {
    // every! 3 days, done four days late: three days from today
    expect(nextOccurrence({ rule: "FREQ=DAILY;INTERVAL=3", mode: "after_completion", doDate: d("2026-09-11"), completedOn: d("2026-09-15") })?.toString()).toBe("2026-09-18");
  });

  it("fixed schedules stay on the original fortnight when a series start is known", () => {
    // series started Wed 9 Sept every 2 weeks; the user dragged this one to Thu 24 Sept and completed it
    expect(nextOccurrence({ rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", mode: "fixed", doDate: d("2026-09-24"), completedOn: d("2026-09-24"), seriesStart: d("2026-09-09") })?.toString()).toBe("2026-10-07");
  });

  it("honours a pause", () => {
    expect(nextOccurrence({ rule: "FREQ=DAILY", mode: "fixed", doDate: d("2026-09-11"), completedOn: d("2026-09-11"), pausedUntil: d("2026-10-01") })?.toString()).toBe("2026-10-01");
  });

  it("skips and moves exceptions", () => {
    const base = { rule: "FREQ=DAILY", mode: "fixed" as const, doDate: d("2026-09-11"), completedOn: d("2026-09-11") };
    expect(nextOccurrence({ ...base, exceptions: [{ occurrenceDate: d("2026-09-12"), kind: "skip" }] })?.toString()).toBe("2026-09-13");
    expect(nextOccurrence({ ...base, exceptions: [{ occurrenceDate: d("2026-09-12"), kind: "move", movedTo: d("2026-09-20") }] })?.toString()).toBe("2026-09-20");
  });

  it("walks past a long run of skips", () => {
    const exceptions = Array.from({ length: 30 }, (_, i) => ({ occurrenceDate: d("2026-09-11").add({ days: i + 1 }), kind: "skip" as const }));
    expect(nextOccurrence({ rule: "FREQ=DAILY", mode: "fixed", doDate: d("2026-09-11"), completedOn: d("2026-09-11"), exceptions })?.toString()).toBe("2026-10-12");
  });

  it("ends the series when UNTIL or COUNT is exhausted", () => {
    expect(nextOccurrence({ rule: "FREQ=DAILY;UNTIL=20260911", mode: "fixed", doDate: d("2026-09-11"), completedOn: d("2026-09-11") })).toBeNull();
    expect(nextOccurrence({ rule: "FREQ=DAILY;COUNT=3", mode: "fixed", doDate: d("2026-09-13"), completedOn: d("2026-09-13"), seriesStart: d("2026-09-11") })).toBeNull();
  });

  it("advanceOnCompletion records against the scheduled occurrence", () => {
    const r = advanceOnCompletion({ rule: "FREQ=WEEKLY;BYDAY=FR", mode: "fixed", doDate: d("2026-09-11"), completedOn: d("2026-09-09") });
    expect(r.occurrenceDate.toString()).toBe("2026-09-11");
    expect(r.nextDoDate?.toString()).toBe("2026-09-18");
  });

  it("changeRule restarts from today and reports dropped future exceptions", () => {
    const r = changeRule({
      newRule: "FREQ=WEEKLY;BYDAY=MO",
      today: d("2026-09-11"),
      exceptions: [
        { occurrenceDate: d("2026-09-01"), kind: "skip" },
        { occurrenceDate: d("2026-09-20"), kind: "skip" },
      ],
    });
    expect(r.doDate?.toString()).toBe("2026-09-14");
    expect(r.droppedExceptions.map((e) => e.occurrenceDate.toString())).toEqual(["2026-09-20"]);
  });
});

// ---------- properties ----------

const RULES = [
  "FREQ=DAILY",
  "FREQ=DAILY;INTERVAL=2",
  "FREQ=DAILY;INTERVAL=7",
  "FREQ=WEEKLY;BYDAY=MO",
  "FREQ=WEEKLY;BYDAY=MO,WE,FR",
  "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
  "FREQ=WEEKLY;BYDAY=SA,SU",
  "FREQ=MONTHLY;BYMONTHDAY=1",
  "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1",
  "FREQ=YEARLY",
];
const BYDAY_WEEKDAYS: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const arbDate = fc.integer({ min: 0, max: 365 * 4 }).map((n) => d("2025-01-01").add({ days: n }));
const arbRule = fc.constantFrom(...RULES);
const ZONES = ["UTC", "Europe/London", "America/Santiago", "Australia/Lord_Howe", "Pacific/Chatham", "Asia/Kolkata"];

describe("properties", () => {
  it("segment composition: [t0,t1] ++ (t1,t2] == [t0,t2]", () => {
    fc.assert(
      fc.property(arbRule, arbDate, fc.integer({ min: 0, max: 120 }), fc.integer({ min: 0, max: 120 }), (rule, start, a, b) => {
        const t1 = start.add({ days: a });
        const t2 = t1.add({ days: b });
        const whole = iso(occurrencesBetween(rule, start, start, t2));
        const left = iso(occurrencesBetween(rule, start, start, t1));
        const right = iso(occurrencesBetween(rule, start, t1.add({ days: 1 }), t2));
        expect([...left, ...right]).toEqual(whole);
      }),
    );
  });

  it("every produced date satisfies the rule's BYDAY, and dates strictly increase", () => {
    fc.assert(
      fc.property(arbRule, arbDate, (rule, start) => {
        const dates = occurrencesAfter(rule, start, start, 20);
        const byday = /BYDAY=([^;]+)/.exec(rule)?.[1].split(",").map((c) => BYDAY_WEEKDAYS[c.replace(/^[-+]?\d+/, "")]);
        for (let i = 0; i < dates.length; i++) {
          if (byday) expect(byday).toContain(dates[i].dayOfWeek);
          if (i > 0) expect(dates[i].toString() > dates[i - 1].toString()).toBe(true);
          expect(isOccurrence(rule, start, dates[i])).toBe(true);
        }
      }),
    );
  });

  it("DST invariance: the calendar sequence is identical whatever zone the dates are projected through", () => {
    fc.assert(
      fc.property(arbRule, arbDate, fc.constantFrom(...ZONES), (rule, start, zone) => {
        const dates = occurrencesAfter(rule, start, start, 15);
        const projected = dates.map((x) => dateOf(toInstant(x, localTime("00:00"), zone), zone));
        expect(iso(projected)).toEqual(iso(dates));
      }),
    );
  });

  it("nextOccurrence is never on or before the completion day, in either mode", () => {
    fc.assert(
      fc.property(arbRule, arbDate, fc.integer({ min: -10, max: 30 }), fc.constantFrom("fixed", "after_completion"), (rule, doDate, offset, mode) => {
        const completedOn = doDate.add({ days: offset });
        const next = nextOccurrence({ rule, mode: mode as "fixed" | "after_completion", doDate, completedOn });
        if (next) expect(next.toString() > completedOn.toString()).toBe(true);
      }),
    );
  });
});
