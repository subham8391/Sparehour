// Adversarial tests for the recurrence engine: month-end and leap-day rules,
// after-completion with exceptions, pauses, rule validation, and horizon limits.
// NOTE: "FREQ=DAILY;INTERVAL=-1" makes rrule loop forever inside
// occurrencesAfter (verified under a kill timer); it is deliberately only
// passed to isValidRule here, never expanded.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { localDate } from "../time";
import type { RecurrenceException } from "../types";
import { changeRule, isOccurrence, isValidRule, nextOccurrence, occurrencesAfter, occurrencesBetween } from "./index";

const d = localDate;
const iso = (xs: ReturnType<typeof localDate>[]) => xs.map(String);

describe("month ends and leap days", () => {
  it("monthly from the 31st skips months without a 31st (never clamps to the 30th)", () => {
    expect(iso(occurrencesAfter("FREQ=MONTHLY", d("2026-01-31"), d("2026-01-31"), 6))).toEqual(["2026-03-31", "2026-05-31", "2026-07-31", "2026-08-31", "2026-10-31", "2026-12-31"]);
    expect(iso(occurrencesAfter("FREQ=MONTHLY;BYMONTHDAY=31", d("2026-01-31"), d("2026-01-31"), 3))).toEqual(["2026-03-31", "2026-05-31", "2026-07-31"]);
    expect(iso(occurrencesAfter("FREQ=MONTHLY;BYMONTHDAY=-1", d("2026-01-31"), d("2026-01-31"), 3))).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(iso(occurrencesAfter("FREQ=MONTHLY;BYMONTHDAY=30", d("2026-01-30"), d("2026-01-30"), 3))).toEqual(["2026-03-30", "2026-04-30", "2026-05-30"]);
  });

  it("a monthly-on-the-31st task completed on 5 Feb goes to 31 Mar, in both modes", () => {
    expect(nextOccurrence({ rule: "FREQ=MONTHLY", mode: "fixed", doDate: d("2026-01-31"), completedOn: d("2026-02-05") })?.toString()).toBe("2026-03-31");
    // after-completion re-anchors on the completion day, so the 5th becomes the day of month
    expect(nextOccurrence({ rule: "FREQ=MONTHLY", mode: "after_completion", doDate: d("2026-01-31"), completedOn: d("2026-02-05") })?.toString()).toBe("2026-03-05");
  });

  it("documents: plain FREQ=YEARLY anchored on 29 Feb recurs every four years, in both modes", () => {
    expect(iso(occurrencesAfter("FREQ=YEARLY", d("2024-02-29"), d("2024-02-29"), 3))).toEqual(["2028-02-29", "2032-02-29", "2036-02-29"]);
    expect(nextOccurrence({ rule: "FREQ=YEARLY", mode: "after_completion", doDate: d("2028-02-29"), completedOn: d("2028-02-29") })?.toString()).toBe("2032-02-29");
    // the way to say "every 28 Feb or 29 Feb" is BYMONTHDAY=-1 in February
    expect(iso(occurrencesAfter("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", d("2024-02-29"), d("2024-02-29"), 4))).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("a rule that can never fire yields nothing, ends the series, and gives changeRule no date", () => {
    expect(occurrencesAfter("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", d("2026-01-01"), d("2026-01-01"), 3)).toEqual([]);
    expect(nextOccurrence({ rule: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", mode: "fixed", doDate: d("2026-01-01"), completedOn: d("2026-01-01") })).toBeNull();
    expect(changeRule({ newRule: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", today: d("2026-01-01"), exceptions: [] })).toEqual({ doDate: null, droppedExceptions: [] });
    // rrule searches its whole horizon before it gives up on a rule that never fires: nearly 4 s under CI's coverage run.
  }, 30_000);

  it("documents: the 20-year horizon ends a series whose next occurrence is further away", () => {
    expect(nextOccurrence({ rule: "FREQ=YEARLY;INTERVAL=25", mode: "fixed", doDate: d("2026-01-01"), completedOn: d("2026-01-01") })).toBeNull();
  });
});

describe("after-completion mode", () => {
  it("honours skip and move exceptions keyed by the computed date", () => {
    const base = { rule: "FREQ=DAILY;INTERVAL=3", mode: "after_completion" as const, doDate: d("2026-09-11"), completedOn: d("2026-09-15") };
    expect(nextOccurrence(base)?.toString()).toBe("2026-09-18");
    expect(nextOccurrence({ ...base, exceptions: [{ occurrenceDate: d("2026-09-18"), kind: "skip" }] })?.toString()).toBe("2026-09-21");
    expect(nextOccurrence({ ...base, exceptions: [{ occurrenceDate: d("2026-09-18"), kind: "move", movedTo: d("2026-09-19") }] })?.toString()).toBe("2026-09-19");
    // an exception on the old scheduled date is irrelevant once the anchor moved
    expect(nextOccurrence({ ...base, exceptions: [{ occurrenceDate: d("2026-09-14"), kind: "skip" }] })?.toString()).toBe("2026-09-18");
  });

  it("completing early lands interval days after the completion, even before the old do-date", () => {
    expect(nextOccurrence({ rule: "FREQ=DAILY;INTERVAL=3", mode: "after_completion", doDate: d("2026-09-20"), completedOn: d("2026-09-11") })?.toString()).toBe("2026-09-14");
  });

  it("documents: COUNT restarts on every completion in after-completion mode, so the series never ends", () => {
    expect(nextOccurrence({ rule: "FREQ=DAILY;COUNT=2", mode: "after_completion", doDate: d("2026-09-11"), completedOn: d("2026-12-31"), seriesStart: d("2026-09-11") })?.toString()).toBe("2027-01-01");
    // UNTIL is absolute and does end it
    expect(nextOccurrence({ rule: "FREQ=DAILY;UNTIL=20261231", mode: "after_completion", doDate: d("2026-09-11"), completedOn: d("2026-12-31") })).toBeNull();
  });
});

describe("pauses and exceptions", () => {
  it("a pause returns the pause date itself even when it is not on the rule (spec: 'reappears on X')", () => {
    expect(nextOccurrence({ rule: "FREQ=WEEKLY;BYDAY=MO", mode: "fixed", doDate: d("2026-09-14"), completedOn: d("2026-09-14"), pausedUntil: d("2026-09-16") })?.toString()).toBe("2026-09-16");
  });

  it("a pause in the past is ignored; a pause on the completion day is ignored", () => {
    expect(nextOccurrence({ rule: "FREQ=WEEKLY;BYDAY=MO", mode: "fixed", doDate: d("2026-09-14"), completedOn: d("2026-09-14"), pausedUntil: d("2026-09-01") })?.toString()).toBe("2026-09-21");
    expect(nextOccurrence({ rule: "FREQ=WEEKLY;BYDAY=MO", mode: "fixed", doDate: d("2026-09-14"), completedOn: d("2026-09-14"), pausedUntil: d("2026-09-14") })?.toString()).toBe("2026-09-21");
  });

  it("documents: a pause wins over a skip exception on the pause date", () => {
    expect(nextOccurrence({ rule: "FREQ=DAILY", mode: "fixed", doDate: d("2026-09-14"), completedOn: d("2026-09-14"), pausedUntil: d("2026-09-16"), exceptions: [{ occurrenceDate: d("2026-09-16"), kind: "skip" }] })?.toString()).toBe("2026-09-16");
  });

  it("documents: a move to the past is returned as-is, before the completion day", () => {
    const next = nextOccurrence({ rule: "FREQ=DAILY", mode: "fixed", doDate: d("2026-09-11"), completedOn: d("2026-09-11"), exceptions: [{ occurrenceDate: d("2026-09-12"), kind: "move", movedTo: d("2026-09-01") }] });
    expect(next?.toString()).toBe("2026-09-01");
  });

  it("property: with random skips, the result is never a skipped date and is always after the completion day", () => {
    const arbSkips = fc.uniqueArray(fc.integer({ min: 1, max: 40 }), { maxLength: 20 });
    fc.assert(
      fc.property(fc.constantFrom("FREQ=DAILY", "FREQ=DAILY;INTERVAL=2", "FREQ=WEEKLY;BYDAY=MO,WE,FR"), fc.integer({ min: 0, max: 400 }), fc.integer({ min: -5, max: 20 }), arbSkips, fc.constantFrom("fixed", "after_completion"), (rule, n, off, skips, mode) => {
        const doDate = d("2026-01-05").add({ days: n });
        const completedOn = doDate.add({ days: off });
        const exceptions: RecurrenceException[] = skips.map((k) => ({ occurrenceDate: completedOn.add({ days: k }), kind: "skip" as const }));
        const next = nextOccurrence({ rule, mode: mode as "fixed" | "after_completion", doDate, completedOn, exceptions });
        expect(next).not.toBeNull();
        expect(next!.toString() > completedOn.toString()).toBe(true);
        expect(exceptions.some((e) => e.occurrenceDate.equals(next!))).toBe(false);
        const anchor = mode === "after_completion" ? completedOn : doDate;
        expect(isOccurrence(rule, anchor, next!)).toBe(true);
      }),
    );
  });
});

describe("rule validation", () => {
  it("rejects an empty rule (it currently expands as FREQ=YEARLY)", () => {
    expect(isValidRule("")).toBe(false);
  });

  it("rejects sub-daily frequencies: the engine deals in calendar dates and would return duplicates", () => {
    for (const rule of ["FREQ=HOURLY", "FREQ=MINUTELY", "FREQ=SECONDLY"]) expect(isValidRule(rule), rule).toBe(false);
  });

  it("rejects INTERVAL below 1 (0 yields nothing; -1 hangs the expansion)", () => {
    expect(isValidRule("FREQ=DAILY;INTERVAL=0")).toBe(false);
    expect(isValidRule("FREQ=DAILY;INTERVAL=-1")).toBe(false);
  });

  it("occurrences strictly increase for any accepted rule", () => {
    // FREQ=HOURLY passes isValidRule today and produces the same date three times.
    for (const rule of ["FREQ=HOURLY", "FREQ=MINUTELY"]) {
      if (!isValidRule(rule)) continue;
      const dates = iso(occurrencesAfter(rule, d("2026-09-11"), d("2026-09-11"), 3));
      expect(new Set(dates).size, `${rule} → ${dates.join(",")}`).toBe(dates.length);
    }
  });

  it("rejects garbage, unknown weekdays and smuggled anchors; accepts lower case and an RRULE: prefix", () => {
    expect(isValidRule("garbage")).toBe(false);
    expect(isValidRule("FREQ=WEEKLY;BYDAY=XX")).toBe(false);
    expect(isValidRule("FREQ=DAILY;DTSTART=20260911T000000Z")).toBe(false);
    expect(isValidRule("DTSTART;TZID=Europe/London:20260911T000000\nRRULE:FREQ=DAILY")).toBe(false);
    expect(isValidRule("freq=daily")).toBe(true);
    expect(isValidRule("RRULE:FREQ=DAILY")).toBe(true);
    expect(iso(occurrencesAfter("RRULE:FREQ=DAILY", d("2026-09-11"), d("2026-09-11"), 1))).toEqual(["2026-09-12"]);
  });

  it("COUNT=0 is accepted and simply never fires; INTERVAL=0 is refused like any interval below one", () => {
    expect(occurrencesAfter("FREQ=DAILY;COUNT=0", d("2026-09-11"), d("2026-09-11"), 3)).toEqual([]);
    expect(isValidRule("FREQ=DAILY;INTERVAL=0")).toBe(false);
    expect(() => occurrencesAfter("FREQ=DAILY;INTERVAL=0", d("2026-09-11"), d("2026-09-11"), 3)).toThrow(/INTERVAL/);
  });
});

describe("ranges and limits", () => {
  it("limit ≤ 0 and inverted ranges give nothing; a one-day range is inclusive", () => {
    expect(occurrencesAfter("FREQ=DAILY", d("2026-09-11"), d("2026-09-11"), 0)).toEqual([]);
    expect(occurrencesAfter("FREQ=DAILY", d("2026-09-11"), d("2026-09-11"), -3)).toEqual([]);
    expect(occurrencesBetween("FREQ=DAILY", d("2026-09-11"), d("2026-09-12"), d("2026-09-11"))).toEqual([]);
    expect(iso(occurrencesBetween("FREQ=DAILY", d("2026-09-11"), d("2026-09-12"), d("2026-09-12")))).toEqual(["2026-09-12"]);
  });

  it("`after` before the anchor starts at the anchor; `after` on the anchor excludes it", () => {
    expect(iso(occurrencesAfter("FREQ=DAILY", d("2026-09-11"), d("2026-09-01"), 2))).toEqual(["2026-09-11", "2026-09-12"]);
    expect(iso(occurrencesAfter("FREQ=DAILY", d("2026-09-11"), d("2026-09-11"), 1))).toEqual(["2026-09-12"]);
  });

  it("an anchor that is not on the rule is not an occurrence, and the first occurrence follows it", () => {
    expect(isOccurrence("FREQ=WEEKLY;BYDAY=MO", d("2026-09-11"), d("2026-09-11"))).toBe(false);
    expect(iso(occurrencesAfter("FREQ=WEEKLY;BYDAY=MO", d("2026-09-11"), d("2026-09-01"), 1))).toEqual(["2026-09-14"]);
    expect(isOccurrence("FREQ=WEEKLY;BYDAY=MO", d("2026-09-11"), d("2026-09-07"))).toBe(false); // before the anchor
  });

  it("property: occurrencesAfter ⊆ occurrencesBetween, all after `after`, at most `limit`", () => {
    const rules = ["FREQ=DAILY;INTERVAL=3", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH", "FREQ=MONTHLY;BYMONTHDAY=31", "FREQ=MONTHLY;BYDAY=-1FR", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29"];
    fc.assert(
      fc.property(fc.constantFrom(...rules), fc.integer({ min: 0, max: 1500 }), fc.integer({ min: -30, max: 400 }), fc.integer({ min: 1, max: 10 }), (rule, n, off, limit) => {
        const start = d("2024-01-01").add({ days: n });
        const after = start.add({ days: off });
        const got = occurrencesAfter(rule, start, after, limit);
        expect(got.length).toBeLessThanOrEqual(limit);
        const all = iso(occurrencesBetween(rule, start, after.add({ days: 1 }), after.add({ days: 366 * 20 })));
        expect(all.slice(0, got.length)).toEqual(iso(got));
        for (const x of got) expect(x.toString() > after.toString()).toBe(true);
      }),
      { numRuns: 200 },
    );
    // 200 runs over twenty-year windows: about 4.5 s under CI's coverage run, close to the 5 s default.
  }, 30_000);

  it("changeRule drops an exception dated today even when today is on the new rule", () => {
    const r = changeRule({ newRule: "FREQ=DAILY", today: d("2026-09-11"), exceptions: [{ occurrenceDate: d("2026-09-11"), kind: "skip" }] });
    expect(r.doDate?.toString()).toBe("2026-09-11");
    expect(r.droppedExceptions).toHaveLength(1);
  });
});
