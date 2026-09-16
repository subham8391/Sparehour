// Adversarial tests for the quick-add recurrence spec ⇄ RRULE mapping.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { RECUR_SPEC_RE, ruleToSpec, ruleWeekdays, specToRule } from "./recurrence";

// Every spec shape the grammar documents (SYSTEM_DESIGN §5.1 recur-spec, PRODUCT_SPEC §5.2).
const SPECS = [
  "day", "week", "month", "year",
  "weekday", "weekdays", "workday", "workdays", "weekend", "weekends",
  "other day", "other week", "other month", "other year",
  "2 days", "3 weeks", "6 months", "2 years", "1 week",
  "2 weeks on mon", "3 weeks on mon,wed", "2 months on fri", "week on tue", "day on mon", "month on fri", "year on sat",
  "mon", "mon,wed,fri", "mon and wed", "mon & wed", "mon/wed", "tues,thurs", "monday,tuesday", "sat,sun", "mon,tue,wed,thu,fri", "sun",
  "Mon", "MON,WED", "Weekday", "2 WEEKS ON MON",
];

describe("specToRule ⇄ ruleToSpec", () => {
  it.each(SPECS)("spec %j survives spec → rule → spec → rule", (spec) => {
    const first = specToRule(spec);
    expect(first, `${spec} did not parse`).not.toBeNull();
    expect(first!.length).toBe(spec.length);
    const again = specToRule(ruleToSpec(first!.rule));
    expect(again?.rule).toBe(first!.rule);
  });

  it("consumes exactly the spec, leaving trailing words", () => {
    expect(specToRule("mon and wed then coffee")).toEqual({ rule: "FREQ=WEEKLY;BYDAY=MO,WE", length: "mon and wed".length });
    expect(specToRule("2 weeks on wed 3pm")).toEqual({ rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", length: "2 weeks on wed".length });
    expect(specToRule("weekday and then")?.length).toBe("weekday".length);
    expect(specToRule("day, please")?.length).toBe("day".length);
    expect(specToRule("mon wed")).toEqual({ rule: "FREQ=WEEKLY;BYDAY=MO", length: 3 }); // no separator: only the first day
  });

  it.each(["", "days", "monday-ish", "1000 days", "-1 days", "1.5 weeks", "fortnight", "hour", "2 hours", "minute", "now and then", "on mon", "2", "weekday_", "monthly"])(
    "rejects %j",
    (spec) => {
      expect(specToRule(spec)).toBeNull();
    },
  );

  it("documents: `0 days` and `1 days` both become plain daily", () => {
    expect(specToRule("0 days")?.rule).toBe("FREQ=DAILY");
    expect(specToRule("1 days")?.rule).toBe("FREQ=DAILY");
    expect(specToRule("2 week")?.rule).toBe("FREQ=WEEKLY;INTERVAL=2");
  });

  it("de-duplicates weekdays and keeps the typed order", () => {
    expect(specToRule("mon,mon,monday")?.rule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(specToRule("fri,mon")?.rule).toBe("FREQ=WEEKLY;BYDAY=FR,MO");
    expect(specToRule("sun,sat")?.rule).toBe("FREQ=WEEKLY;BYDAY=SU,SA");
    expect(ruleToSpec("FREQ=WEEKLY;BYDAY=SU,SA")).toBe("sun,sat"); // not "weekend": order differs
  });

  it("documents: ruleToSpec drops everything quick-add cannot express", () => {
    // format(draft) on a rule set elsewhere in the app silently loses these parts.
    expect(ruleToSpec("FREQ=MONTHLY;BYMONTHDAY=15")).toBe("month");
    expect(ruleToSpec("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1")).toBe("month on mon");
    expect(ruleToSpec("FREQ=DAILY;COUNT=3")).toBe("day");
    expect(ruleToSpec("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231")).toBe("mon");
    expect(ruleToSpec("FREQ=MONTHLY;BYDAY=1FR")).toBe("month on 1fr"); // and "on 1fr" does not parse back: it would be stranded in the title
    expect(specToRule("month on 1fr")).toEqual({ rule: "FREQ=MONTHLY", length: 5 });
    expect(ruleToSpec("")).toBe("day");
    expect(ruleToSpec("FREQ=HOURLY")).toBe("day");
  });

  it("ruleWeekdays: ordinal or lower-case BYDAY codes are dropped rather than mis-read", () => {
    expect(ruleWeekdays("FREQ=MONTHLY;BYDAY=1MO")).toEqual([]);
    expect(ruleWeekdays("FREQ=WEEKLY;BYDAY=mo")).toEqual([]);
    expect(ruleWeekdays("FREQ=WEEKLY;BYDAY=MO,XX,FR")).toEqual([1, 5]);
    expect(ruleWeekdays("FREQ=DAILY")).toBeNull();
    expect(ruleWeekdays("BYDAY=MO")).toEqual([1]);
    expect(ruleWeekdays("FREQ=WEEKLY;XBYDAY=MO")).toBeNull();
  });

  it("the spec regex is anchored and cannot run away on long input", () => {
    const long = `mon${",mon".repeat(5000)} x`;
    const t0 = performance.now();
    const m = RECUR_SPEC_RE.exec(long);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(m?.[0].length).toBe(long.length - 2);
    expect(specToRule(long)?.rule).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("property: any rule quick-add produces round-trips exactly", () => {
    const arbDays = fc.uniqueArray(fc.constantFrom("mon", "tue", "wed", "thu", "fri", "sat", "sun"), { minLength: 1, maxLength: 7 }).map((d) => d.join(","));
    const arbSpec = fc.oneof(
      fc.constantFrom("day", "week", "month", "year", "weekday", "weekend"),
      fc.tuple(fc.integer({ min: 2, max: 999 }), fc.constantFrom("days", "weeks", "months", "years")).map(([n, u]) => `${n} ${u}`),
      fc.tuple(fc.integer({ min: 2, max: 99 }), fc.constantFrom("weeks", "months"), arbDays).map(([n, u, d]) => `${n} ${u} on ${d}`),
      arbDays,
    );
    fc.assert(
      fc.property(arbSpec, (spec) => {
        const rule = specToRule(spec)!.rule;
        expect(specToRule(ruleToSpec(rule))?.rule).toBe(rule);
      }),
      { numRuns: 300 },
    );
  });
});
