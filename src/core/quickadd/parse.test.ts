import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { instant, localDate, localTime, type LocalDate, type LocalTime } from "../time";
import { emptyDraft, parse } from "./parse";
import { format } from "./format";
import { ruleToSpec, specToRule } from "./recurrence";
import type { ParseContext, TaskDraft } from "./types";
import corpus from "./__fixtures__/corpus.json";

// Reference: Friday 2026-09-11 09:00 Europe/London (BST), week starts Monday.
const ctx: ParseContext = { now: instant("2026-09-11T08:00:00Z"), zone: "Europe/London" };

type Plain = Record<string, unknown>;
const plain = (d: TaskDraft): Plain => ({
  ...d,
  doDate: d.doDate?.toString() ?? null,
  doTime: d.doTime?.toString({ smallestUnit: "minute" }) ?? null,
  deadline: d.deadline?.toString() ?? null,
  startDate: d.startDate?.toString() ?? null,
});

interface Case {
  input: string;
  reject?: string;
  title?: string;
  doDate?: string;
  doTime?: string;
  estimateMin?: number;
  priority?: number;
  deadline?: string;
  startDate?: string;
  recurrenceRule?: string;
  recurrenceMode?: string;
  evening?: boolean;
  notes?: string;
  projectName?: string;
  projectCreate?: boolean;
  tagNames?: string[];
  warnings?: string[];
}

describe("quick-add corpus", () => {
  for (const c of corpus as Case[]) {
    it(JSON.stringify(c.input), () => {
      const r = parse(c.input, ctx);
      if (c.reject) {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe(c.reject);
        return;
      }
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const expected = plain({
        ...emptyDraft(),
        title: c.title ?? "",
        doDate: c.doDate ? localDate(c.doDate) : null,
        doTime: c.doTime ? localTime(c.doTime) : null,
        estimateMin: c.estimateMin ?? null,
        priority: (c.priority ?? 0) as TaskDraft["priority"],
        deadline: c.deadline ? localDate(c.deadline) : null,
        startDate: c.startDate ? localDate(c.startDate) : null,
        recurrenceRule: c.recurrenceRule ?? null,
        recurrenceMode: (c.recurrenceMode as TaskDraft["recurrenceMode"]) ?? null,
        evening: c.evening ?? false,
        notes: c.notes ?? null,
        projectName: c.projectName ?? null,
        projectCreate: c.projectCreate ?? false,
        tagNames: c.tagNames ?? [],
      });
      expect(plain(r.draft)).toEqual(expected);
      expect(r.warnings.map((w) => w.code)).toEqual(c.warnings ?? []);
    });
  }
});

describe("spans", () => {
  it("reports every token with its position, for live highlighting", () => {
    const r = parse("Draft proposal fri 3pm ~45m #acme @calls !1", ctx);
    expect(r.ok).toBe(true);
    expect(r.spans.map((s) => [s.kind, s.text])).toEqual([
      ["datetime", "fri"],
      ["datetime", "3pm"],
      ["estimate", "~45m"],
      ["project", "#acme"],
      ["tag", "@calls"],
      ["priority", "!1"],
    ]);
  });

  it("includes the dangling 'at' in the datetime span so the title stays clean", () => {
    const r = parse("Call Dana at 3pm", ctx);
    expect(r.spans.map((s) => s.text)).toEqual(["at 3pm"]);
  });

  it("marks protected text so the editor can show it as literal", () => {
    const r = parse("Fix `#1` bug #platform", ctx);
    expect(r.spans.map((s) => [s.kind, s.text])).toEqual([
      ["protected", "`#1`"],
      ["project", "#platform"],
    ]);
  });
});

describe("literal ranges (a removed chip, PRODUCT_SPEC §5.1 rule 3)", () => {
  const lit = (input: string, word: string) => {
    const start = input.indexOf(word);
    return parse(input, ctx, { literal: [{ start, end: start + word.length }] });
  };

  it("keeps an un-parsed date in the title and drops the fact", () => {
    const r = lit("Meeting about fri", "fri");
    expect(r.ok && r.draft.title).toBe("Meeting about fri");
    expect(r.ok && r.draft.doDate).toBeNull();
    expect(r.spans.map((s) => [s.kind, s.text])).toEqual([["literal", "fri"]]);
  });

  it("works for every token kind, leaving the others parsed", () => {
    const cases: [string, string, (d: TaskDraft) => unknown][] = [
      ["Call 3pm ~45m", "3pm", (d) => d.doTime],
      ["Read evening ~45m", "evening", (d) => d.evening || d.doDate],
      ["Plan ~45m today", "~45m", (d) => d.estimateMin],
      ["Plan !1 today", "!1", (d) => d.priority || null],
      ["Plan #acme today", "#acme", (d) => d.projectName],
      ["Plan @calls today", "@calls", (d) => d.tagNames.length || null],
      ["Plan {fri} today", "{fri}", (d) => d.deadline],
      ["Plan after mon today", "after mon", (d) => d.startDate],
      ["Plan every mon today", "every mon", (d) => d.recurrenceRule],
    ];
    for (const [input, word, fact] of cases) {
      const r = lit(input, word);
      expect(r.ok, input).toBe(true);
      if (!r.ok) continue;
      expect(fact(r.draft), input).toBeFalsy();
      expect(r.draft.title, input).toContain(word);
    }
  });

  it("keeps the literal text exactly, and ignores ranges that are out of bounds or overlap", () => {
    const r = parse("Fix \\#1 today", ctx, { literal: [{ start: 4, end: 7 }, { start: 5, end: 9 }, { start: 40, end: 50 }] });
    expect(r.ok && r.draft.title).toBe("Fix \\#1");
    expect(r.ok && r.draft.doDate?.toString()).toBe("2026-09-11");
  });
});

describe("a bare time that has passed (A10)", () => {
  const at = (iso: string): ParseContext => ({ now: instant(iso), zone: "Europe/London" });
  it("is tomorrow; one still ahead, or the current minute, is today", () => {
    const morning = at("2026-09-11T08:00:30Z"); // 09:00:30 BST
    const date = (s: string, c: ParseContext) => {
      const r = parse(s, c);
      return r.ok ? r.draft.doDate?.toString() : null;
    };
    expect(date("Stretch 7am", morning)).toBe("2026-09-12");
    expect(date("Stretch 9am", morning)).toBe("2026-09-11");
    expect(date("Stretch 3pm", morning)).toBe("2026-09-11");
    expect(date("Stretch 7am today", morning)).toBe("2026-09-11");
    expect(date("Stretch 11pm", at("2026-09-11T22:30:00Z"))).toBe("2026-09-12"); // 23:30 BST
  });
});

describe("deadline before the do-date (PRODUCT_SPEC §5.4)", () => {
  it("keeps both as typed and warns, unless the do-date is a repeat's first occurrence", () => {
    const r = parse("Prep {today} mon", ctx);
    expect(r.ok && [r.draft.doDate?.toString(), r.draft.deadline?.toString(), r.warnings.map((w) => w.code)]).toEqual(["2026-09-14", "2026-09-11", ["deadline_before_do_date"]]);
    const repeat = parse("Write {today} every 2 weeks on wed", ctx);
    expect(repeat.ok && repeat.warnings.map((w) => w.code)).toEqual(["deadline_moved_to_first_occurrence"]);
  });
});

describe("evening cut-off", () => {
  it("respects a custom evening start", () => {
    const r = parse("Call at 5pm", { ...ctx, eveningStartsAt: localTime("17:00") });
    expect(r.ok && r.draft.evening).toBe(true);
    const s = parse("Call at 5pm", ctx);
    expect(s.ok && s.draft.evening).toBe(false);
  });
});

describe("recurrence spec ⇄ rule", () => {
  const rules = [
    "FREQ=DAILY",
    "FREQ=DAILY;INTERVAL=3",
    "FREQ=WEEKLY",
    "FREQ=WEEKLY;INTERVAL=2",
    "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=WE",
    "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    "FREQ=WEEKLY;BYDAY=SA,SU",
    "FREQ=MONTHLY",
    "FREQ=MONTHLY;INTERVAL=3",
    "FREQ=YEARLY",
  ];
  for (const rule of rules) {
    it(`${rule} survives a round trip through its spec`, () => {
      expect(specToRule(ruleToSpec(rule))?.rule).toBe(rule);
    });
  }
  it("rejects nonsense", () => {
    expect(specToRule("now and then")).toBeNull();
    expect(specToRule("")).toBeNull();
  });
});

// ---------- property tests ----------

const WORDS = ["write", "draft", "call", "review", "plan", "the", "proposal", "notes", "deck", "bike", "invoice", "renew", "fix", "sync", "email"];
const arbTitle = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 4 }).map((w) => w.join(" "));
const arbDate = fc.integer({ min: 0, max: 400 }).map((n) => localDate("2026-01-01").add({ days: n }));
const arbTime = fc.integer({ min: 0, max: 1439 }).map((m) => localTime(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`));
const arbRule = fc.constantFrom(
  "FREQ=DAILY", "FREQ=DAILY;INTERVAL=3", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;INTERVAL=2;BYDAY=WE",
  "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "FREQ=MONTHLY", "FREQ=YEARLY",
);
const arbName = fc.constantFrom("acme", "Q4 launch", "website", "deep-work", "personal", "Big Idea");

const arbDraft: fc.Arbitrary<TaskDraft> = fc
  .record({
    title: arbTitle,
    doDate: fc.option(arbDate, { nil: null }),
    doTime: fc.option(arbTime, { nil: null }),
    estimateMin: fc.option(fc.integer({ min: 1, max: 600 }), { nil: null }),
    priority: fc.constantFrom(0, 1, 2, 3) as fc.Arbitrary<TaskDraft["priority"]>,
    deadlineOffset: fc.option(fc.integer({ min: 0, max: 60 }), { nil: null }),
    startOffset: fc.option(fc.integer({ min: 0, max: 60 }), { nil: null }),
    recurrenceRule: fc.option(arbRule, { nil: null }),
    afterCompletion: fc.boolean(),
    evening: fc.boolean(),
    notes: fc.option(arbTitle, { nil: null }),
    projectName: fc.option(arbName, { nil: null }),
    projectCreate: fc.boolean(),
    tagNames: fc.uniqueArray(arbName, { maxLength: 3 }),
  })
  .map((r) => {
    // Keep the draft inside what parse() would itself produce: a time, a repeat or the evening implies a date,
    // a start is never after it, and 18:00+ is the evening. (A deadline before the do-date is kept as typed,
    // with a warning, so the generator leaves it out: the round trip compares drafts, not warnings.)
    const doDate: LocalDate | null = r.doTime || r.recurrenceRule || r.evening ? (r.doDate ?? localDate("2026-09-11")) : r.doDate;
    const doTime: LocalTime | null = r.doTime;
    const anchor = doDate ?? localDate("2026-09-11");
    return {
      title: r.title,
      doDate,
      doTime,
      estimateMin: r.estimateMin,
      priority: r.priority,
      deadline: r.deadlineOffset == null ? null : anchor.add({ days: r.deadlineOffset }),
      startDate: r.startOffset == null ? null : anchor.subtract({ days: r.startOffset }),
      recurrenceRule: r.recurrenceRule,
      recurrenceMode: r.recurrenceRule ? (r.afterCompletion ? "after_completion" : "fixed") : null,
      evening: r.evening || (doTime != null && doTime.hour >= 18),
      notes: r.notes,
      projectName: r.projectName,
      projectCreate: r.projectName ? r.projectCreate : false,
      tagNames: r.tagNames,
    };
  });

describe("properties", () => {
  it("round-trips: parse(format(draft)) === draft", () => {
    fc.assert(
      fc.property(arbDraft, (draft) => {
        const r = parse(format(draft), ctx);
        expect(r.ok).toBe(true);
        if (r.ok) expect(plain(r.draft)).toEqual(plain(draft));
      }),
      { numRuns: 300 },
    );
  });

  it("is pure: parsing twice is byte-identical", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        expect(JSON.stringify(parse(s, ctx), (_k, v) => (typeof v === "object" && v && "toString" in v && v.constructor?.name?.startsWith("Plain") ? String(v) : v)))
          .toBe(JSON.stringify(parse(s, ctx), (_k, v) => (typeof v === "object" && v && "toString" in v && v.constructor?.name?.startsWith("Plain") ? String(v) : v)));
      }),
    );
  });

  it("never reports overlapping or out-of-bounds spans", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (s) => {
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
    );
  });

  it("is idempotent: a parsed title has no tokens left in it", () => {
    const arbInput = fc
      .array(
        fc.oneof(
          arbTitle,
          fc.constantFrom("fri 3pm", "~45m", "#acme", "@calls", "!1", "{mon}", "after tue", "every 2 weeks", "evening", "tmr", "at 9am", "next fri", "eom"),
        ),
        { minLength: 1, maxLength: 6 },
      )
      .map((p) => p.join(" "));
    fc.assert(
      fc.property(arbInput, (s) => {
        const r = parse(s, ctx);
        if (!r.ok) return;
        const again = parse(r.draft.title, ctx);
        expect(again.ok).toBe(true);
        if (again.ok) {
          expect(again.spans.filter((x) => x.kind !== "protected")).toEqual([]);
          expect(again.draft.title).toBe(r.draft.title);
        }
      }),
    );
  });
});
