import { describe, expect, it } from "vitest";
import { localDate } from "../time";
import type { RecurrenceException } from "../types";
import { exceptionId } from "./exception-id";
import { changeRule, nextOccurrence } from "./index";
import { currentOccurrence, exceptionsFrom, firstOnOrAfter, followingOccurrence, rebaseRule } from "./series";
import { ruleWords } from "./words";

const d = localDate;
const move = (from: string, to: string): RecurrenceException => ({ occurrenceDate: d(from), kind: "move", movedTo: d(to) });
const skip = (on: string): RecurrenceException => ({ occurrenceDate: d(on), kind: "skip" });
const MONDAYS = "FREQ=WEEKLY;BYDAY=MO";

describe("series edits: which occurrence a task stands for", () => {
  it("a task moved just this once is still the occurrence it was scheduled as", () => {
    expect(currentOccurrence(d("2026-10-14"), d("2026-10-06"), [move("2026-10-12", "2026-10-14")]).toString()).toBe("2026-10-12");
    expect(currentOccurrence(d("2026-10-12"), d("2026-10-06"), [move("2026-10-05", "2026-10-07")]).toString()).toBe("2026-10-12");
    expect(currentOccurrence(null, d("2026-10-06"), []).toString()).toBe("2026-10-06");
  });

  it("the series returns to its rule after a moved occurrence, even where the rule counts from its anchor", () => {
    // Every 2 weeks (no weekday in the rule): Mon 12 moved to Thu 15 just this once, completed there.
    const exceptions = [move("2026-10-12", "2026-10-15")];
    const occurrence = currentOccurrence(d("2026-10-15"), d("2026-10-15"), exceptions);
    const next = nextOccurrence({ rule: "FREQ=WEEKLY;INTERVAL=2", mode: "fixed", doDate: occurrence, completedOn: d("2026-10-15"), exceptions });
    expect(next?.toString()).toBe("2026-10-26");
  });
});

describe("followingOccurrence", () => {
  it("skips to the next one after a future occurrence, honouring skips and moves ahead", () => {
    const today = d("2026-10-06"); // Tuesday
    expect(followingOccurrence({ rule: MONDAYS, mode: "fixed", occurrence: d("2026-10-12"), today })?.toString()).toBe("2026-10-19");
    expect(followingOccurrence({ rule: MONDAYS, mode: "fixed", occurrence: d("2026-10-12"), today, exceptions: [skip("2026-10-19")] })?.toString()).toBe("2026-10-26");
    expect(followingOccurrence({ rule: MONDAYS, mode: "fixed", occurrence: d("2026-10-12"), today, exceptions: [move("2026-10-19", "2026-10-21")] })?.toString()).toBe("2026-10-21");
  });

  it("a missed occurrence skips to the first one still ahead, today included", () => {
    expect(followingOccurrence({ rule: "FREQ=DAILY", mode: "fixed", occurrence: d("2026-10-04"), today: d("2026-10-06") })?.toString()).toBe("2026-10-06");
  });

  it("an after-completion repeat counts from today or the occurrence, whichever is later", () => {
    expect(followingOccurrence({ rule: "FREQ=DAILY;INTERVAL=3", mode: "after_completion", occurrence: d("2026-10-04"), today: d("2026-10-06") })?.toString()).toBe("2026-10-09");
    expect(followingOccurrence({ rule: "FREQ=DAILY;INTERVAL=3", mode: "after_completion", occurrence: d("2026-10-10"), today: d("2026-10-06") })?.toString()).toBe("2026-10-13");
  });
});

describe("firstOnOrAfter", () => {
  it("lands on the schedule after a pause date", () => {
    expect(firstOnOrAfter(MONDAYS, d("2026-10-12"), d("2026-10-14"))?.toString()).toBe("2026-10-19");
    expect(firstOnOrAfter(MONDAYS, d("2026-10-12"), d("2026-10-19"))?.toString()).toBe("2026-10-19");
  });

  it("finds the schedule's first day before its anchor, in phase (resuming early)", () => {
    // Every 2 weeks from Mon 19 Oct: Mon 5 Oct is on it, Mon 12 Oct is not.
    expect(firstOnOrAfter("FREQ=WEEKLY;INTERVAL=2", d("2026-10-19"), d("2026-10-06"))?.toString()).toBe("2026-10-19");
    expect(firstOnOrAfter("FREQ=WEEKLY;INTERVAL=2", d("2026-10-19"), d("2026-10-05"))?.toString()).toBe("2026-10-05");
    expect(firstOnOrAfter("FREQ=DAILY;INTERVAL=3", d("2026-10-20"), d("2026-10-06"))?.toString()).toBe("2026-10-08");
    expect(firstOnOrAfter("FREQ=MONTHLY", d("2027-01-31"), d("2026-10-06"))?.toString()).toBe("2026-10-31");
    expect(firstOnOrAfter("FREQ=MONTHLY;BYMONTHDAY=15", d("2026-12-15"), d("2026-10-16"))?.toString()).toBe("2026-11-15");
    expect(firstOnOrAfter("FREQ=YEARLY", d("2028-03-01"), d("2026-10-06"))?.toString()).toBe("2027-03-01");
  });
});

describe("rebaseRule (Change the rule from a moved day)", () => {
  it("swaps the weekday", () => {
    expect(rebaseRule(MONDAYS, d("2026-10-12"), d("2026-10-14"))).toBe("FREQ=WEEKLY;BYDAY=WE");
    expect(rebaseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH", d("2026-10-12"), d("2026-10-13"))).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH");
    // Already on the rule: unchanged.
    expect(rebaseRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", d("2026-10-12"), d("2026-10-14"))).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
  });

  it("moves a day of the month, and a weekday's place in it", () => {
    expect(rebaseRule("FREQ=MONTHLY;BYMONTHDAY=16", d("2026-10-16"), d("2026-10-20"))).toBe("FREQ=MONTHLY;BYMONTHDAY=20");
    expect(rebaseRule("FREQ=MONTHLY;BYDAY=2TU", d("2026-10-13"), d("2026-10-22"))).toBe("FREQ=MONTHLY;BYDAY=4TH");
    expect(rebaseRule("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1", d("2026-10-26"), d("2026-10-30"))).toBe("FREQ=MONTHLY;BYDAY=-1FR");
  });

  it("leaves a rule that counts from its anchor as it is", () => {
    expect(rebaseRule("FREQ=DAILY;INTERVAL=3", d("2026-10-12"), d("2026-10-13"))).toBe("FREQ=DAILY;INTERVAL=3");
    expect(rebaseRule("FREQ=WEEKLY", d("2026-10-12"), d("2026-10-13"))).toBe("FREQ=WEEKLY");
  });
});

describe("changing the rule", () => {
  it("restarts from today and drops the exceptions on today or later", () => {
    const today = d("2026-10-06");
    const exceptions = [skip("2026-09-28"), move("2026-10-12", "2026-10-13"), skip("2026-10-19")];
    const out = changeRule({ newRule: "FREQ=WEEKLY;BYDAY=FR", today, exceptions });
    expect(out.doDate?.toString()).toBe("2026-10-09");
    expect(out.droppedExceptions).toHaveLength(2);
    expect(exceptionsFrom(exceptions, today).map((e) => e.occurrenceDate.toString())).toEqual(["2026-10-12", "2026-10-19"]);
  });
});

describe("ruleWords", () => {
  it("reads a rule the way the header says it", () => {
    expect(ruleWords(MONDAYS)).toBe("every Monday");
    expect(ruleWords("FREQ=WEEKLY;BYDAY=MO,TH")).toBe("every Monday and Thursday");
    expect(ruleWords("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe("every Monday, Wednesday and Friday");
    expect(ruleWords("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("every weekday");
    expect(ruleWords("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE")).toBe("every 2 weeks on Wednesday");
    expect(ruleWords("FREQ=DAILY")).toBe("every day");
    expect(ruleWords("FREQ=DAILY;INTERVAL=3", "after_completion")).toBe("every 3 days after completion");
    expect(ruleWords("FREQ=MONTHLY;BYMONTHDAY=15")).toBe("every month on the 15th");
    expect(ruleWords("FREQ=MONTHLY;BYDAY=-1FR")).toBe("every month on the last Friday");
    expect(ruleWords("FREQ=YEARLY")).toBe("every year");
    expect(ruleWords("garbage")).toBe("on a schedule");
  });
});

describe("exceptionId", () => {
  it("is one stable UUID per series and occurrence", () => {
    const a = exceptionId("4f1c2d3e-0000-4000-8000-000000000001", "2026-10-12");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(exceptionId("4F1C2D3E-0000-4000-8000-000000000001", "2026-10-12")).toBe(a);
    expect(exceptionId("4f1c2d3e-0000-4000-8000-000000000001", "2026-10-19")).not.toBe(a);
    expect(exceptionId("4f1c2d3e-0000-4000-8000-000000000002", "2026-10-12")).not.toBe(a);
  });
});
