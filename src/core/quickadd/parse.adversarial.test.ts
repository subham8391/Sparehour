// Adversarial tests for the quick-add parser: degenerate input, unicode,
// sigils on their own, glued tokens, calendar overflow, protection, and the
// documented rules in docs/product/PRODUCT_SPEC.md §5.2–5.4 and
// docs/engineering/SYSTEM_DESIGN.md §5.1. Where the two documents disagree
// the test asserts what the parser (and its corpus) actually implements and
// says so in its name.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { instant, localDate, localTime, type LocalDate } from "../time";
import { parse } from "./parse";
import { format } from "./format";
import type { ParseContext, ParseResult, TaskDraft } from "./types";

// Reference: Friday 2026-09-11 09:00 Europe/London (BST), week starts Monday.
const ctx: ParseContext = { now: instant("2026-09-11T08:00:00Z"), zone: "Europe/London" };
const at = (iso: string, zone = "Europe/London"): ParseContext => ({ now: instant(iso), zone });

const ok = (r: ParseResult): Extract<ParseResult, { ok: true }> => {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("rejected");
  return r;
};
const draftOf = (input: string, c: ParseContext = ctx): TaskDraft => ok(parse(input, c)).draft;
const iso = (d: LocalDate | null): string | null => d?.toString() ?? null;
const hhmm = (d: TaskDraft): string | null => d.doTime?.toString({ smallestUnit: "minute" }) ?? null;
const kinds = (r: ParseResult): string[] => r.spans.map((s) => `${s.kind}:${s.text}`);

describe("degenerate input", () => {
  it.each(["", " ", "   \t  ", "\n", "\n\n", " ", "   \t", "\r\n"])("rejects %j with empty_title and no spans other than notes", (input) => {
    const r = parse(input, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("empty_title");
      expect(r.spans.filter((s) => s.kind !== "notes")).toEqual([]);
    }
  });

  it("rejects a title made only of zero-width / invisible characters", () => {
    // U+200B ZERO WIDTH SPACE, U+200C/200D joiners, U+FEFF BOM: none render, none are \s in JS.
    for (const input of ["​", "‌‍", "﻿", "​ ​"]) {
      const r = parse(input, ctx);
      expect(r.ok, `${JSON.stringify(input)} should be rejected — nothing visible would be saved as the title`).toBe(false);
    }
  });

  it("only-tokens input is rejected but every token is still reported for highlighting", () => {
    const r = parse("tmr 3pm ~45m #acme @calls !1 {fri} after mon every 2 weeks evening // note", ctx);
    expect(r.ok).toBe(false);
    expect(r.spans.map((s) => s.kind)).toEqual(["datetime", "datetime", "estimate", "project", "tag", "priority", "deadline", "start", "recurrence", "evening", "notes"]);
  });
});

describe("very long input", () => {
  it("handles a 10 000-character title in well under 100 ms", () => {
    const title = "word ".repeat(2000).trim();
    const t0 = performance.now();
    const d = draftOf(`${title} tmr`);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(d.title).toBe(title);
    expect(iso(d.doDate)).toBe("2026-09-12");
  });

  it("handles thousands of tokens without quadratic blow-up", () => {
    const input = `Title ${"~1 ".repeat(3000)}#p`;
    const t0 = performance.now();
    const r = ok(parse(input, ctx));
    expect(performance.now() - t0).toBeLessThan(500);
    expect(r.draft.estimateMin).toBe(1);
    expect(r.spans.filter((s) => s.kind === "estimate")).toHaveLength(3000);
    expect(r.draft.title).toBe("Title");
  });

  it("a single 10 000-character word is a title, not a token", () => {
    const word = "x".repeat(10_000);
    expect(draftOf(word).title).toBe(word);
  });
});

describe("unicode", () => {
  it("accepts accented, CJK, emoji and RTL text in titles, projects and tags", () => {
    const d = draftOf("Ünïcode #café @日本語 tmr");
    expect(d.title).toBe("Ünïcode");
    expect(d.projectName).toBe("café");
    expect(d.tagNames).toEqual(["日本語"]);
    expect(iso(d.doDate)).toBe("2026-09-12");
    expect(draftOf("🎉 party tmr").title).toBe("🎉 party");
    expect(draftOf("مرحبا tmr").title).toBe("مرحبا");
    expect(draftOf("Task #🎉").title).toBe("Task #🎉"); // an emoji is not a letter: no project
  });

  it("span offsets are UTF-16 code units, so astral characters before a token do not shift it", () => {
    const input = "🎉🎉 party tmr 3pm";
    const r = ok(parse(input, ctx));
    for (const s of r.spans) expect(input.slice(s.start, s.end)).toBe(s.text);
    expect(r.spans.map((s) => s.text)).toEqual(["tmr", "3pm"]);
  });

  it("keeps a combining-mark title intact", () => {
    const title = "café résumé";
    expect(draftOf(`${title} tmr`).title).toBe(title);
  });
});

describe("sigils and keywords on their own", () => {
  it.each(["#", "@", "!", "~", "{", "}", "{}", "every", "after", "at", "on", "//"])("%j alone is a title (or rejected), never a token", (input) => {
    const r = parse(input, ctx);
    if (r.ok) {
      expect(r.spans.filter((s) => s.kind !== "notes")).toEqual([]);
      expect(r.draft.title).toBe(input);
    } else {
      expect(input).toBe("//"); // "//" is an empty note, hence an empty title
    }
  });

  it.each(["Task #", "Task @", "Task !", "Task ~", "Task {", "Task every", "Task after", "Task !0", "Task !4", "Task !12", "Task #123", "Task #-", "Task ~ 45m", "Task every 1000 days", "Task every -1 days"])(
    "%j leaves the dangling sigil or unparsable token in the title",
    (input) => {
      const r = ok(parse(input, ctx));
      expect(r.spans).toEqual([]);
      expect(r.draft.title).toBe(input);
    },
  );

  it("PRODUCT_SPEC §5.3 rule 1: `roughly~45m` does not parse — tokens are whole, space-delimited units", () => {
    const r = ok(parse("roughly~45m", ctx));
    expect(r.draft.estimateMin).toBeNull();
    expect(r.draft.title).toBe("roughly~45m");
  });

  it("PRODUCT_SPEC §5.3 rule 1: a deadline glued to a word (`Submit{fri}`) is not a token either", () => {
    const r = ok(parse("Submit{fri}", ctx));
    expect(r.draft.deadline).toBeNull();
    expect(r.draft.title).toBe("Submit{fri}");
  });

  it("project and priority sigils glued to a word are already refused (consistent with rule 1)", () => {
    expect(draftOf("meeting#acme").projectName).toBeNull();
    expect(draftOf("meeting#acme").title).toBe("meeting#acme");
    expect(draftOf("wow!1").priority).toBe(0);
    expect(draftOf("Email sam@acme.com").tagNames).toEqual([]);
  });
});

describe("estimates", () => {
  it("PRODUCT_SPEC §5.3 rule 7: a token that fails to parse is left in the title verbatim — `~0m` sets nothing, so it must stay", () => {
    for (const input of ["Task ~0m", "Task ~0", "Task ~0.4", "Task ~0h"]) {
      const r = ok(parse(input, ctx));
      expect(r.draft.estimateMin).toBeNull();
      expect(r.draft.title, `${input}: the estimate token was swallowed although it set nothing`).toBe(input);
    }
  });

  it.each([
    ["~10h", 600],
    ["~1h90", 150],
    ["~2h30m", 150],
    ["~1.4h", 84],
    ["~0.5h", 30],
    ["~120", 120],
    ["~1hr", 60],
    ["~3hrs", 180],
    ["~5mins", 5],
  ])("%s → %i minutes", (tok, min) => {
    expect(draftOf(`Task ${tok}`).estimateMin).toBe(min);
  });

  it.each(["~1d", "~-5m", "~1e3", "15h", "45m"])("%j is not an estimate", (tok) => {
    const d = draftOf(`Task ${tok}`);
    expect(d.estimateMin).toBeNull();
    expect(d.title).toBe(`Task ${tok}`);
  });

  it("two estimates glued together: the first is a token, the second is glued to a word (rule 1) and stays", () => {
    const r = ok(parse("Task ~45m~30m", ctx));
    expect(r.draft.estimateMin).toBe(45);
    expect(kinds(r)).toEqual(["estimate:~45m"]);
    expect(r.draft.title).toBe("Task ~30m");
  });

  it("documents: estimates above the 8h / 1440-minute ceiling are passed through unclamped (the DB check is 1..1440)", () => {
    // PRODUCT_SPEC §5.4 says >8h is "saved, flagged"; SYSTEM_DESIGN §3.2 has `estimate_min between 1 and 1440`.
    // ~25h = 1500 and ~99999999999999999999h = 6e21 both parse; the write layer must clamp or refuse them.
    expect(draftOf("Task ~25h").estimateMin).toBe(1500);
    expect(draftOf("Task ~99999999999999999999h").estimateMin).toBe(6e21);
  });

  it("`~2h 30` does not read the space-separated 30 as minutes", () => {
    const d = draftOf("Task ~2h 30");
    expect(d.estimateMin).toBe(120);
    expect(d.title).toBe("Task 30");
  });

  it("documents: a decimal comma splits the token — `~1,5h` is one minute plus `,5h` left in the title", () => {
    const d = draftOf("Task ~1,5h");
    expect(d.estimateMin).toBe(1);
    expect(d.title).toBe("Task ,5h");
  });
});

describe("priority", () => {
  it("maps !1/!2/!3 to 3/2/1 and the last one wins", () => {
    expect(draftOf("Task !3 !1").priority).toBe(3);
    expect(draftOf("Task !1 !3").priority).toBe(1);
  });

  it("a glued second priority (`!1!2`) is not a token", () => {
    const r = ok(parse("Task !1!2", ctx));
    expect(r.draft.priority).toBe(3);
    expect(r.draft.title).toBe("Task !2");
  });
});

describe("dates", () => {
  it("has no past vocabulary: `yesterday` stays in the title", () => {
    const r = ok(parse("Task yesterday", ctx));
    expect(r.draft.doDate).toBeNull();
    expect(r.draft.title).toBe("Task yesterday");
  });

  it("`last mon` is not turned into next Monday", () => {
    // "last" is not vocabulary, so by rule 7 the whole phrase should stay in the title.
    // Today the weekday is grabbed and the task is silently planned for a future Monday.
    const r = ok(parse("Task last mon", ctx));
    expect(r.draft.doDate, "a past reference became a future date").toBeNull();
    expect(r.draft.title).toBe("Task last mon");
  });

  it("a stray two-digit number after a month-day is not a year: `3 oct 12` must not land in 2012", () => {
    // chrono reads "3 oct 12" as 3 Oct 2012 and forwardDate leaves explicit years alone, so the task is planned 14 years ago.
    for (const input of ["Task 3 oct 12", "Task 1 jan 12", "Task 1 jan 99"]) {
      const r = ok(parse(input, ctx));
      expect(r.draft.doDate && r.draft.doDate.toString() >= "2026-09-11", `${input} → ${iso(r.draft.doDate)}`).toBe(true);
    }
  });

  it("documents: an explicit four-digit year in the past is accepted as a do-date", () => {
    expect(iso(draftOf("Task jan 1 2020").doDate)).toBe("2020-01-01");
    expect(iso(draftOf("Task 2020-01-01").doDate)).toBe("2020-01-01");
  });

  it("documents: numeric `3/4` is read as US month/day and pushed forward a year", () => {
    expect(iso(draftOf("Task 3/4").doDate)).toBe("2027-03-04");
    expect(iso(draftOf("Task 1/10").doDate)).toBe("2027-01-10");
  });

  it.each(["31 nov", "nov 31", "feb 29", "sept 31", "apr 31", "31st nov"])("%j is not a date in a 30-day month or a non-leap year", (tok) => {
    const r = ok(parse(`Task ${tok}`, ctx));
    expect(r.draft.doDate).toBeNull();
    expect(r.draft.title).toBe(`Task ${tok}`);
  });

  it("an impossible ISO date is not silently clamped to a neighbouring day", () => {
    // Temporal.PlainDate.from({...}) constrains by default; the try/catch in datetime.ts expects a throw.
    for (const [input, wrong] of [
      ["Task 2026-02-30", "2026-02-28"],
      ["Task 2027-02-29", "2027-02-28"],
      ["Task 2026-13-45", "2026-12-31"],
      ["Task 2026-00-10", "2026-01-10"],
      ["Task 2026-04-31", "2026-04-30"],
    ]) {
      const r = ok(parse(input, ctx));
      expect(iso(r.draft.doDate), `${input} became ${wrong}`).not.toBe(wrong);
      expect(r.draft.doDate).toBeNull();
      expect(r.draft.title).toBe(input);
    }
  });

  it("an impossible ISO deadline is not silently clamped either", () => {
    const r = ok(parse("Task {2026-02-30}", ctx));
    expect(iso(r.draft.deadline)).not.toBe("2026-02-28");
    expect(r.draft.deadline).toBeNull();
    expect(r.draft.title).toBe("Task {2026-02-30}");
  });

  it("accepts the real leap day", () => {
    expect(iso(draftOf("Task 2028-02-29").doDate)).toBe("2028-02-29");
    expect(iso(draftOf("Task 29 feb", at("2028-01-10T12:00:00Z")).doDate)).toBe("2028-02-29");
  });

  it("rolls month-day expressions into next year at the year end", () => {
    const dec31 = at("2026-12-31T12:00:00Z"); // a Thursday
    expect(iso(draftOf("Task jan 5", dec31).doDate)).toBe("2027-01-05");
    expect(iso(draftOf("Task 1 jan", dec31).doDate)).toBe("2027-01-01");
    expect(iso(draftOf("Task tomorrow", dec31).doDate)).toBe("2027-01-01");
    expect(iso(draftOf("Task next week", dec31).doDate)).toBe("2027-01-04");
    expect(iso(draftOf("Task next month", dec31).doDate)).toBe("2027-01-01");
    expect(iso(draftOf("Task in 1 month", dec31).doDate)).toBe("2027-01-31");
    expect(iso(draftOf("Task eom", dec31).doDate)).toBe("2026-12-31");
    expect(iso(draftOf("Task fri", dec31).doDate)).toBe("2027-01-01");
    expect(iso(draftOf("Task next fri", dec31).doDate)).toBe("2027-01-08");
    expect(iso(draftOf("Task dec 31", dec31).doDate)).toBe("2026-12-31"); // rule 5: today means today
  });

  it("clamps `in 1 month` from the 31st to the end of the shorter month", () => {
    const jan31 = at("2026-01-31T12:00:00Z", "UTC");
    expect(iso(draftOf("Task in 1 month", jan31).doDate)).toBe("2026-02-28");
    expect(iso(draftOf("Task next month", jan31).doDate)).toBe("2026-02-01");
    expect(iso(draftOf("Task eom", at("2028-02-10T12:00:00Z", "UTC")).doDate)).toBe("2028-02-29");
  });

  it("a bare weekday is the next such day, never today (PRODUCT_SPEC §5.2; its example 'fri 3pm' is next Friday)", () => {
    // Friday 2026-09-11.
    expect(iso(draftOf("Task fri").doDate)).toBe("2026-09-18");
    expect(iso(draftOf("Task sat").doDate)).toBe("2026-09-12");
    expect(iso(draftOf("Task thu").doDate)).toBe("2026-09-17");
    expect(iso(draftOf("Task next fri").doDate)).toBe("2026-09-18");
  });

  it("`next sun` on a Friday is the Sunday of next ISO week, skipping the coming one", () => {
    expect(iso(draftOf("Task next sun").doDate)).toBe("2026-09-20");
    expect(iso(draftOf("Task sun").doDate)).toBe("2026-09-13");
    // and on a Sunday, "next mon" is tomorrow
    expect(iso(draftOf("Task next mon", at("2026-09-13T12:00:00Z")).doDate)).toBe("2026-09-14");
  });

  it("duplicate dates: the last one wins and both are consumed (SYSTEM_DESIGN §5.1; PRODUCT_SPEC §5.3 rule 2 says leftmost)", () => {
    const r = parse("today tomorrow", ctx);
    expect(r.ok).toBe(false); // nothing left for a title
    const d = ok(parse("Task today tomorrow", ctx));
    expect(iso(d.draft.doDate)).toBe("2026-09-12");
    expect(d.draft.title).toBe("Task");
    expect(kinds(d)).toEqual(["datetime:today", "datetime:tomorrow"]);
  });

  it("`in 0 days` is today; `after 3 days` is not a start (needs `after in 3 days`)", () => {
    expect(iso(draftOf("Task in 0 days").doDate)).toBe("2026-09-11");
    expect(iso(draftOf("Task in 1000 days").doDate)).toBe("2029-06-07"); // beyond the 3-digit relative pattern, chrono takes over
    const r = ok(parse("Task after 3 days", ctx));
    expect(r.draft.startDate).toBeNull();
    expect(r.draft.title).toBe("Task after 3 days");
    expect(iso(draftOf("Task after in 3 days").startDate)).toBe("2026-09-14");
  });

  it("`after tomorrow` is a start date, `day after tomorrow` is a do-date, `after day after tomorrow` is a start", () => {
    expect(iso(draftOf("Task after tomorrow").startDate)).toBe("2026-09-12");
    expect(draftOf("Task after tomorrow").doDate).toBeNull();
    expect(iso(draftOf("Task day after tomorrow").doDate)).toBe("2026-09-13");
    expect(iso(draftOf("Task after day after tomorrow").startDate)).toBe("2026-09-13");
  });

  it("a deadline on `every mon` must not drag the do-date off the rule", () => {
    // "every mon" gives next Monday as the do-date; "{fri}" is this Friday. The deadline-before-do-date
    // swap then makes the do-date Friday for a Mondays-only series.
    const r = ok(parse("Task every mon {fri}", ctx));
    expect(r.draft.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(r.draft.doDate?.dayOfWeek, `do-date ${iso(r.draft.doDate)} is not a Monday`).toBe(1);
  });

  it("a deadline before the rule's first occurrence moves onto it (the rule wins), with a warning", () => {
    const r = ok(parse("Write {today} every 2 weeks on wed", ctx));
    expect(r.draft.recurrenceRule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE");
    expect(iso(r.draft.doDate)).toBe("2026-09-16");
    expect(iso(r.draft.deadline)).toBe("2026-09-16");
    expect(r.warnings.map((w) => w.code)).toContain("deadline_moved_to_first_occurrence");
  });

  it("start after do-date moves the do-date, and a start after the deadline is left to the user", () => {
    const r = ok(parse("Task after mon today", ctx));
    expect(iso(r.draft.doDate)).toBe("2026-09-14");
    expect(r.warnings.map((w) => w.code)).toEqual(["do_date_moved_to_start_date"]);
    const s = ok(parse("Task after mon {today}", ctx));
    expect(iso(s.draft.startDate)).toBe("2026-09-14");
    expect(iso(s.draft.deadline)).toBe("2026-09-11"); // start after deadline: no correction, no warning
    expect(s.warnings).toEqual([]);
  });
});

describe("times", () => {
  it.each([
    ["12am", "00:00"],
    ["12pm", "12:00"],
    ["12:30am", "00:30"],
    ["12:30pm", "12:30"],
    ["0:00", "00:00"],
    ["00:00", "00:00"],
    ["23:59", "23:59"],
    ["3.30pm", "15:30"],
    ["3:30 pm", "15:30"],
    ["5 pm", "17:00"],
    ["noon", "12:00"],
    ["midday", "12:00"],
    ["midnight", "00:00"],
  ])("%s → %s", (tok, expected) => {
    const d = draftOf(`Task ${tok}`);
    expect(hhmm(d)).toBe(expected);
    // Now is 09:00: a time already gone today means tomorrow (A10).
    expect(iso(d.doDate)).toBe(expected < "09:00" ? "2026-09-12" : "2026-09-11");
  });

  it.each(["24:00", "13pm", "0am", "9:60", "25:00", "15h", "3 o'clock"])("%j is not a time", (tok) => {
    const d = draftOf(`Task ${tok}`);
    expect(d.doTime).toBeNull();
    expect(d.title).toBe(`Task ${tok}`);
  });

  it("documents: `9:5pm` is read as 5pm with `9:` left over, and `3.3pm` as 3pm with `3.` left over", () => {
    const d = draftOf("Task 9:5pm");
    expect(hhmm(d)).toBe("17:00");
    expect(d.title).toBe("Task 9:");
    const e = draftOf("Task 3.3pm");
    expect(hhmm(e)).toBe("15:00");
    expect(e.title).toBe("Task 3.");
  });

  it("duplicate times: last wins, both consumed", () => {
    const r = ok(parse("Task 3pm 4pm", ctx));
    expect(hhmm(r.draft)).toBe("16:00");
    expect(kinds(r)).toEqual(["datetime:3pm", "datetime:4pm"]);
  });

  it("a time that has already passed today means tomorrow (PRODUCT_SPEC §5.2, A10); with a date it is kept", () => {
    expect(iso(draftOf("Task 8am").doDate)).toBe("2026-09-12"); // now is 09:00
    expect(iso(draftOf("Task today 8am").doDate)).toBe("2026-09-11");
  });

  it("evening follows the clock at exactly the cut-off, and `tonight` forces evening whatever the time", () => {
    expect(draftOf("Task 6pm").evening).toBe(true);
    expect(draftOf("Task 5:59pm").evening).toBe(false);
    expect(draftOf("Task 18:00", { ...ctx, eveningStartsAt: localTime("18:01") }).evening).toBe(false);
    const d = draftOf("Task at noon tonight");
    expect(d.evening).toBe(true);
    expect(hhmm(d)).toBe("12:00");
  });

  it("documents: `evening` with a morning time keeps both (PRODUCT_SPEC §5.2 says evening clears do_time)", () => {
    const d = draftOf("Task 7am evening");
    expect(d.evening).toBe(true);
    expect(hhmm(d)).toBe("07:00");
  });
});

describe("recurrence", () => {
  it.each([
    ["every mon and wed", "FREQ=WEEKLY;BYDAY=MO,WE", "2026-09-14"],
    ["every mon & wed", "FREQ=WEEKLY;BYDAY=MO,WE", "2026-09-14"],
    ["every mon/wed", "FREQ=WEEKLY;BYDAY=MO,WE", "2026-09-14"],
    ["every 2 weeks", "FREQ=WEEKLY;INTERVAL=2", "2026-09-11"],
    ["every 2 weeks on mon,wed and fri", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR", "2026-09-11"],
    ["every weekday", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-09-11"],
    ["every weekend", "FREQ=WEEKLY;BYDAY=SA,SU", "2026-09-12"],
    ["every year", "FREQ=YEARLY", "2026-09-11"],
    ["every 1 year", "FREQ=YEARLY", "2026-09-11"],
    ["every other month", "FREQ=MONTHLY;INTERVAL=2", "2026-09-11"],
    ["every mon,mon", "FREQ=WEEKLY;BYDAY=MO", "2026-09-14"],
    ["every 999 days", "FREQ=DAILY;INTERVAL=999", "2026-09-11"],
    ["EVERY Mon", "FREQ=WEEKLY;BYDAY=MO", "2026-09-14"],
  ])("%s → %s starting %s", (spec, rule, start) => {
    const d = draftOf(`Task ${spec}`);
    expect(d.recurrenceRule).toBe(rule);
    expect(d.recurrenceMode).toBe("fixed");
    expect(iso(d.doDate)).toBe(start);
    expect(d.title).toBe("Task");
  });

  it("`every!` is after-completion; `every !day` and `everyday` are not recurrences", () => {
    expect(draftOf("Task every! 2 weeks").recurrenceMode).toBe("after_completion");
    expect(draftOf("Task every !day").recurrenceRule).toBeNull();
    expect(draftOf("Task everyday").recurrenceRule).toBeNull();
  });

  it("`every 15th` repeats monthly on the 15th and starts on the next 15th; `every 31st` skips short months", () => {
    // Friday 2026-09-11.
    const r = ok(parse("Pay electricity bill every 15th", ctx));
    expect(r.draft.title).toBe("Pay electricity bill");
    expect(r.draft.recurrenceRule).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
    expect(iso(r.draft.doDate)).toBe("2026-09-15");
    expect(iso(ok(parse("Rent every 1st", ctx)).draft.doDate)).toBe("2026-10-01");
    expect(iso(ok(parse("Report every 11th", ctx)).draft.doDate)).toBe("2026-09-11");
    expect(iso(ok(parse("Close books every 31st", ctx)).draft.doDate)).toBe("2026-10-31");
  });

  it.each(["every 15th", "every month on the 31st", "every 0 days", "every mon, tue,", "every weekday and", "every day!"])(
    "documents the partial consumption of %j",
    (spec) => {
      // These are all things a person might type. What the parser does with them today:
      const r = ok(parse(`Task ${spec}`, ctx));
      const expected: Record<string, [string | null, string]> = {
        "every 15th": ["FREQ=MONTHLY;BYMONTHDAY=15", "Task"], // PRODUCT_SPEC §5.2 lists it (found missing by the walkthrough)
        "every month on the 31st": ["FREQ=MONTHLY", "Task on the 31st"], // "every month" eaten, the rest stranded
        "every 0 days": ["FREQ=DAILY", "Task"], // interval 0 is accepted as "daily"
        "every mon, tue,": ["FREQ=WEEKLY;BYDAY=MO,TU", "Task ,"],
        "every weekday and": ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Task and"],
        "every day!": ["FREQ=DAILY", "Task !"],
      };
      expect([r.draft.recurrenceRule, r.draft.title]).toEqual(expected[spec]);
    },
  );

  it("a repeat with weekdays starts on the first listed weekday on or after today, whatever the order", () => {
    expect(iso(draftOf("Task every fri,mon").doDate)).toBe("2026-09-11");
    expect(iso(draftOf("Task every sun,sat").doDate)).toBe("2026-09-12");
    expect(iso(draftOf("Task every thu").doDate)).toBe("2026-09-17");
  });

  it("a repeat with an explicit date keeps that date even when it is not on the rule", () => {
    const d = draftOf("Task every mon tmr");
    expect(iso(d.doDate)).toBe("2026-09-12"); // Saturday, not a Monday — the user typed it
  });
});

describe("protection, escapes and notes", () => {
  it("protected text is never scanned for notes: `//` inside backticks or quotes stays in the title", () => {
    // Grammar (SYSTEM_DESIGN §5.1): protected = '`' … '`' | '"' … '"' (* never parsed *)
    const r = ok(parse("Read `http://x` tomorrow", ctx));
    expect(r.draft.notes).toBeNull();
    expect(r.draft.title).toBe("Read `http://x`");
    expect(iso(r.draft.doDate)).toBe("2026-09-12");
    const q = ok(parse('Read "http://x" tomorrow', ctx));
    expect(q.draft.notes).toBeNull();
    expect(q.draft.title).toBe("Read http://x");
    expect(iso(q.draft.doDate)).toBe("2026-09-12");
  });

  it("never reports overlapping spans, even when a note marker sits inside protected text", () => {
    const input = "a `//` b";
    const r = parse(input, ctx);
    const spans = [...r.spans].sort((x, y) => x.start - y.start);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].start, `${JSON.stringify(spans[i - 1])} overlaps ${JSON.stringify(spans[i])}`).toBeGreaterThanOrEqual(spans[i - 1].end);
    }
  });

  it("a dangling `at`/`on` is absorbed into the date span only across plain text, never across protected text", () => {
    // absorbPreposition looks back through the residual, where protected characters are blanked, so
    // "at `#1` tmr" reads as "at      tmr" and the whole stretch — protected text included — is taken as the date.
    const r = ok(parse("Call at `#1` tmr", ctx));
    expect(r.draft.title, "the protected `#1` was swallowed by the date span").toBe("Call at `#1`");
    expect(iso(r.draft.doDate)).toBe("2026-09-12");
    const spans = [...r.spans].sort((x, y) => x.start - y.start);
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
    expect(parse("at `code #x` tmr", ctx).ok).toBe(true);
  });

  it("documents: a bare URL is cut at `//` and the rest becomes the note, date included", () => {
    const r = ok(parse("Read https://example.com/post tomorrow", ctx));
    expect(r.draft.title).toBe("Read https:");
    expect(r.draft.notes).toBe("example.com/post tomorrow");
    expect(r.draft.doDate).toBeNull();
  });

  it("everything inside backticks is literal", () => {
    const r = ok(parse("Keep `~45m #x @y !1 {fri} every mon tmr 3pm after tue evening`", ctx));
    expect(r.spans.map((s) => s.kind)).toEqual(["protected"]);
    expect(r.draft.title).toBe("Keep `~45m #x @y !1 {fri} every mon tmr 3pm after tue evening`");
    expect(r.draft.doDate).toBeNull();
    expect(r.draft.estimateMin).toBeNull();
  });

  it("an unbalanced quote or backtick protects nothing and is kept in the title", () => {
    const r = ok(parse('Task "unclosed #acme', ctx));
    expect(r.draft.projectName).toBe("acme");
    expect(r.draft.title).toBe('Task "unclosed');
    const b = ok(parse("Task `unclosed ~30m", ctx));
    expect(b.draft.estimateMin).toBe(30);
    expect(b.draft.title).toBe("Task `unclosed");
  });

  it("quoted names may contain spaces, sigils and unicode; an empty quoted name is not a token", () => {
    expect(draftOf('Task #"a b" #"c d"').projectName).toBe("c d");
    // documents: a sigil inside a quoted name is still scanned first, so `@"#not a project"` yields project "not" and no tag
    expect(draftOf('Task @"#not a project"').projectName).toBe("not");
    expect(draftOf('Task @"#not a project"').tagNames).toEqual([]);
    expect(draftOf('Task #"日本 語"').projectName).toBe("日本 語");
    const r = ok(parse('Task #""', ctx));
    expect(r.draft.projectName).toBeNull();
    expect(r.draft.title).toBe('Task #""');
    expect(draftOf('Task #"unclosed').projectName).toBeNull();
  });

  it("escapes drop the backslash and keep the sigil; a double backslash keeps one", () => {
    expect(draftOf("Task \\#acme").title).toBe("Task #acme");
    expect(draftOf("Task \\@x \\~45m \\!1").title).toBe("Task @x ~45m !1");
    expect(draftOf("Task \\\\#acme").title).toBe("Task \\#acme");
    expect(draftOf("Task \\\\#acme").projectName).toBeNull(); // the backslash before # still escapes it
  });

  it("documents: escaping `{` does not protect the date word inside, and `}` has no escape", () => {
    const r = ok(parse("Task \\{fri\\}", ctx));
    expect(r.draft.deadline).toBeNull();
    expect(iso(r.draft.doDate)).toBe("2026-09-18");
    expect(r.draft.title).toBe("Task { \\}");
  });

  it("notes: only the first line is parsed; everything after the first newline is notes verbatim", () => {
    const r = ok(parse("Title tmr\nline two ~45m #x\n\nline four", ctx));
    expect(r.draft.title).toBe("Title");
    expect(r.draft.notes).toBe("line two ~45m #x\n\nline four");
    expect(r.draft.estimateMin).toBeNull();
    expect(r.draft.projectName).toBeNull();
    expect(iso(r.draft.doDate)).toBe("2026-09-12");
  });

  it("notes: `//` with nothing after it yields no note; the marker is still consumed", () => {
    const r = ok(parse("Title //", ctx));
    expect(r.draft.notes).toBeNull();
    expect(r.draft.title).toBe("Title");
    expect(r.spans.map((s) => s.kind)).toEqual(["notes"]);
  });

  it("CRLF input: the carriage return does not leak into the title", () => {
    const r = ok(parse("Title tmr\r\nnotes here", ctx));
    expect(r.draft.title).toBe("Title");
    expect(r.draft.notes).toBe("notes here");
  });
});

describe("day boundary", () => {
  it("documents: at 01:30 local the parser's 'today' is the calendar date, not the app's 04:00-rolled-over day", () => {
    // parse() calls todayFor with dayRolloverHour: 0; ParseContext carries no rollover hour.
    // With the default 04:00 rollover the Today view at 01:30 on the 15th still shows the 14th.
    const c = at("2026-09-15T00:30:00Z"); // 01:30 BST on the 15th
    expect(iso(draftOf("Task today", c).doDate)).toBe("2026-09-15");
    expect(iso(draftOf("Task tonight", c).doDate)).toBe("2026-09-15");
    expect(iso(draftOf("Task 3pm", c).doDate)).toBe("2026-09-15");
  });

  it("today's own date typed as a month-day stays this year in every zone", () => {
    // findAbsoluteDates hands chrono a reference of UTC noon *plus* the zone offset, and chrono compares it with
    // dates built in the host process's zone, so "11 sept" typed on 11 Sept becomes 2027 for many (zone, host TZ)
    // pairs — e.g. Asia/Kolkata on this host, Europe/London on a UTC server.
    for (const zone of ["Europe/London", "Europe/Athens", "Asia/Kolkata", "Asia/Tokyo", "Pacific/Auckland", "Pacific/Kiritimati"]) {
      const c = at("2026-09-11T02:00:00Z", zone); // between 03:00 and 16:00 local on the 11th everywhere
      expect(iso(draftOf("Task 11 sept", c).doDate), zone).toBe("2026-09-11");
      expect(iso(draftOf("Task {11 sept}", c).deadline), `${zone} deadline`).toBe("2026-09-11");
      expect(iso(draftOf("Task sept 11 at 3pm", c).doDate), `${zone} with a time`).toBe("2026-09-11");
    }
  });

  it("uses the zone, not UTC, for 'today' near midnight", () => {
    // 23:30Z on the 11th is already the 12th in Kolkata and still the 11th in New York
    expect(iso(draftOf("Task today", at("2026-09-11T23:30:00Z", "Asia/Kolkata")).doDate)).toBe("2026-09-12");
    expect(iso(draftOf("Task today", at("2026-09-11T23:30:00Z", "America/New_York")).doDate)).toBe("2026-09-11");
    expect(iso(draftOf("Task 15 sept", at("2026-09-11T23:30:00Z", "Pacific/Kiritimati")).doDate)).toBe("2026-09-15");
  });
});

describe("format ⇄ parse", () => {
  it.each([
    "Fix #1 bug",
    "Email sam@acme.com",
    "Review PR #214",
    "call at 3pm?",
    "50% off ~ish",
    "every day is a good day",
    "after the meeting",
    "tomorrow's problem",
    "{braces} and [brackets]",
    "trailing evening",
    "Ünïcode 🎉 日本語",
  ])("a title that looks like tokens survives format→parse: %j", (title) => {
    const draft: TaskDraft = { ...draftOf("placeholder"), title };
    const r = ok(parse(format(draft), ctx));
    expect(r.draft.title).toBe(title);
    expect(r.spans.filter((s) => s.kind !== "protected")).toEqual([]);
  });

  it("documents: a title containing both a backtick and a double quote comes back wrapped in backticks", () => {
    const draft: TaskDraft = { ...draftOf("placeholder"), title: 'run `ls "x"`' };
    expect(ok(parse(format(draft), ctx)).draft.title).toBe('`run ls "x"`');
  });

  it("documents: a project or tag name containing a double quote cannot be expressed by format()", () => {
    const draft: TaskDraft = { ...draftOf("placeholder"), projectName: 'Q4 "launch"' };
    const r = ok(parse(format(draft), ctx));
    expect(r.draft.projectName).not.toBe('Q4 "launch"');
  });

  it("round-trips a draft whose tag names are reserved words", () => {
    const draft: TaskDraft = { ...draftOf("placeholder"), title: "Task", tagNames: ["every", "after", "tomorrow", "evening"] };
    expect(ok(parse(format(draft), ctx)).draft.tagNames).toEqual(["every", "after", "tomorrow", "evening"]);
  });
});

// ---------- properties ----------

const TOKENS = [
  "tmr", "today", "tonight", "fri", "next mon", "next week", "eom", "eow", "in 3 days", "day after tomorrow", "2026-09-20", "15 sept", "oct 12 at 2pm",
  "3pm", "12am", "09:30", "noon", "at 5pm", "~45m", "~1h30", "~0m", "#acme", '#"Q4 launch"', "#+new", "@calls", '@"deep work"', "!1", "!3",
  "{fri}", "{2026-10-01}", "{in 2 weeks}", "after mon", "after 2026-10-01", "every mon", "every! 3 days", "every 2 weeks on wed", "every weekday",
  "evening", "this evening", "\\#12", "`code #x`", '"quoted @y"', "#", "@", "!", "~", "{", "}", "every", "after", "the", "and", "​", "🎉", "Ünï",
];
// Deliberately absent: the "//" note marker and bare "at"/"on" — their interaction with protected text has explicit tests above.
const arbParts = fc.array(fc.oneof(fc.constantFrom(...TOKENS), fc.constantFrom("write", "draft", "call", "plan", "review", "x", "y-z", "a_b")), { minLength: 1, maxLength: 8 });
const joined = (parts: string[], seps: string[]) => parts.map((p, i) => p + (seps[i] ?? "")).join("");
/** Tokens glued together as well as spaced: `tmr#acme`, `3pm~45m`. */
const arbInput = arbParts.chain((parts) => fc.array(fc.constantFrom(" ", "  ", "\t", ""), { minLength: parts.length - 1, maxLength: parts.length - 1 }).map((seps) => joined(parts, seps)));
/** Tokens always separated by whitespace, the scope of the documented idempotence property. */
const arbSpacedInput = arbParts.chain((parts) => fc.array(fc.constantFrom(" ", "  ", "\t"), { minLength: parts.length - 1, maxLength: parts.length - 1 }).map((seps) => joined(parts, seps)));

describe("properties", () => {
  it("spans are sorted, disjoint, in bounds and literal, for adversarial token soup", () => {
    fc.assert(
      fc.property(arbInput, (s) => {
        const r = parse(s, ctx);
        let last = 0;
        for (const span of r.spans) {
          expect(span.start).toBeGreaterThanOrEqual(last);
          expect(span.end).toBeGreaterThan(span.start);
          expect(span.end).toBeLessThanOrEqual(s.length);
          expect(span.text).toBe(s.slice(span.start, span.end));
          last = span.end;
        }
      }),
      { numRuns: 500 },
    );
  });

  it("is deterministic on adversarial token soup", () => {
    const ser = (r: ParseResult) => JSON.stringify(r, (_k, v) => (v && typeof v === "object" && typeof v.toString === "function" && v.constructor?.name?.startsWith("Plain") ? String(v) : v));
    fc.assert(
      fc.property(arbInput, (s) => {
        expect(ser(parse(s, ctx))).toBe(ser(parse(s, ctx)));
      }),
      { numRuns: 300 },
    );
  });

  it("the draft is internally consistent: a time, a repeat or the evening implies a date, start ≤ do-date, a deadline before it is flagged, evening at 18:00+", () => {
    fc.assert(
      fc.property(arbInput, (s) => {
        const r = parse(s, ctx);
        if (!r.ok) return;
        const d = r.draft;
        if (d.doTime || d.evening) expect(d.doDate).not.toBeNull();
        if (d.recurrenceRule) {
          expect(d.doDate).not.toBeNull();
          expect(d.recurrenceMode).not.toBeNull();
        } else expect(d.recurrenceMode).toBeNull();
        // Both dates are kept as typed (PRODUCT_SPEC §5.4), and the strip is told.
        if (d.doDate && d.deadline && d.deadline.toString() < d.doDate.toString()) expect(r.warnings.map((w) => w.code)).toContain("deadline_before_do_date");
        if (d.doDate && d.startDate) expect(d.startDate.toString() <= d.doDate.toString()).toBe(true);
        if (d.doTime && d.doTime.hour >= 18) expect(d.evening).toBe(true);
        expect(d.title).toBe(d.title.trim());
        expect(d.title).not.toMatch(/\s{2,}/);
        expect(new Set(d.tagNames).size).toBe(d.tagNames.length);
        if (d.estimateMin != null) expect(d.estimateMin).toBeGreaterThan(0);
        expect([0, 1, 2, 3]).toContain(d.priority);
      }),
      { numRuns: 500 },
    );
  });

  it("documents: a token glued to a date word is stranded as a bare token, so the title is not idempotent", () => {
    const r = ok(parse("Task tmr#acme", ctx));
    expect(r.draft.title).toBe("Task #acme");
    expect(draftOf(r.draft.title).projectName).toBe("acme"); // SYSTEM_DESIGN §5.1's idempotence property does not hold for glued input
  });

  it("documents: when a relative date wins, an absolute date stays in the title (PRODUCT_SPEC §5.3 rule 2), so the title is not idempotent", () => {
    const r = ok(parse("Write tmr oct 12", ctx));
    expect(iso(r.draft.doDate)).toBe("2026-09-12");
    expect(r.draft.title).toBe("Write oct 12");
    expect(iso(draftOf(r.draft.title).doDate)).toBe("2026-10-12"); // SYSTEM_DESIGN §5.1's idempotence property does not hold here
  });

  it("the title never contains a residual, unprotected token (idempotence on space-separated token soup)", () => {
    fc.assert(
      fc.property(arbSpacedInput, (s) => {
        if (s.includes('"')) return; // double quotes are dropped from the title by design, so quoted tokens re-parse
        if (/15 sept|oct 12 at 2pm/.test(s)) return; // an absolute date beside a relative one stays in the title (see above)
        const r = parse(s, ctx);
        if (!r.ok) return;
        const again = parse(r.draft.title, ctx);
        expect(again.ok).toBe(true);
        if (again.ok) {
          expect(again.spans.filter((x) => x.kind !== "protected")).toEqual([]);
          expect(again.draft.title).toBe(r.draft.title);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("parsing is the same whatever the zone's offset when the input has no relative words", () => {
    const zones = ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Kathmandu", "America/St_Johns", "Australia/Lord_Howe"];
    fc.assert(
      fc.property(fc.constantFrom("Task 15 sept", "Task oct 12 at 2pm", "Task 2026-11-01 09:30", "Task {2026-10-01} ~45m", "Task 3 dec 11:15pm"), fc.constantFrom(...zones), (s, zone) => {
        const a = draftOf(s, { now: instant("2026-09-11T12:00:00Z"), zone });
        const b = draftOf(s, { now: instant("2026-09-11T12:00:00Z"), zone: "UTC" });
        expect([iso(a.doDate), hhmm(a), iso(a.deadline)]).toEqual([iso(b.doDate), hhmm(b), iso(b.deadline)]);
      }),
    );
  });

  it("dates never resolve into the past", () => {
    const today = localDate("2026-09-11");
    fc.assert(
      fc.property(arbInput, (s) => {
        if (/\d(oct 12|15 sept)/.test(s)) return; // a digit glued before a month-day reads as "3 oct 12" — see the explicit test above
        const r = parse(s, ctx);
        if (!r.ok) return;
        for (const d of [r.draft.doDate, r.draft.deadline, r.draft.startDate]) if (d) expect(d.toString() >= today.toString()).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
