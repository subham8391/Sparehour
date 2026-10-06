import { describe, expect, it } from "vitest";
import { emptyDraft, parse } from "@/core/quickadd";
import { instant, localDate } from "@/core/time";
import {
  bestProjectMatch,
  carryRanges,
  dayLabel,
  factSpans,
  interpret,
  priorityLabel,
  projectMatches,
  projectOptionLabel,
  projectsNamed,
  projectToken,
  resolveProject,
  resolveTag,
  segments,
  splitPaste,
  tagMatches,
  tagToken,
} from "./interpret";

const today = localDate("2026-09-11"); // Friday, the corpus reference day
const ctx = { now: instant("2026-09-11T08:00:00Z"), zone: "Europe/London" };
const draftOf = (input: string) => {
  const r = parse(input, ctx);
  if (!r.ok) throw new Error(`parse failed: ${input}`);
  return r;
};

describe("interpret", () => {
  it("restates a full parse in plain English, in reading order", () => {
    const { draft } = draftOf("Draft the proposal tomorrow 3pm ~45m #acme !1");
    const i = interpret(draft, today, "Acme redesign");
    expect(i.strip).toBe("Tomorrow 15:00 · 45m · Acme redesign · priority 1");
    expect(i.destination).toBe("Upcoming");
  });

  it("knows where the task lands", () => {
    expect(interpret(draftOf("Email Sam").draft, today).destination).toBe("Inbox");
    expect(interpret(draftOf("Email Sam today").draft, today).destination).toBe("Today");
    expect(interpret(draftOf("Email Sam mon").draft, today).destination).toBe("Upcoming");
  });

  it("only a task with no project and no date goes to the Inbox (PRODUCT_SPEC.md §5.1 rule 5)", () => {
    // Seen in the walkthrough: "→ Inbox" under a line with a #project, and the task did land there.
    expect(interpret(draftOf("Email Sam #acme").draft, today, "Acme").destination).toBe("Acme");
    expect(interpret(draftOf("Write post #+Blog").draft, today, "new project Blog").destination).toBe("Blog");
    expect(interpret(draftOf("Email Sam #acme mon").draft, today, "Acme").destination).toBe("Upcoming");
    // A deadline or a start date is a date: the task is active, waiting in Upcoming's "Not yet planned".
    expect(interpret(draftOf("Pay invoice {mon}").draft, today).destination).toBe("Upcoming");
    expect(interpret(draftOf("Pay invoice after mon").draft, today).destination).toBe("Upcoming");
    // A name that is neither matched nor to be created files nothing: the task still lands in the Inbox.
    expect(interpret(draftOf("Email Sam #acm").draft, today, "acm?").destination).toBe("Inbox");
  });

  it("says nothing when there is nothing beyond the title", () => {
    expect(interpret(draftOf("Email Sam").draft, today).strip).toBe("");
  });

  it("covers deadlines, starts, repeats, tags, evenings and notes", () => {
    expect(interpret(draftOf("Pay invoice {mon} after today @admin // ref 42").draft, today).strip).toBe("due Mon 14 Sep · from Today · @admin · with a note");
    expect(interpret(draftOf("Standup every weekday 9:15").draft, today).strip).toBe("Today 09:15 · repeats every weekday");
    expect(interpret(draftOf("Water plants every! 3 days").draft, today).strip).toBe("Today · repeats every 3 days, after each completion");
    // `evening` alone is this evening: today's date with the flag (PRODUCT_SPEC.md §5.2), and it lands on Today.
    expect(interpret(draftOf("call mum evening").draft, today).strip).toBe("Today, evening");
    expect(interpret(draftOf("call mum evening").draft, today).destination).toBe("Today");
    expect(interpret(draftOf("Read chapter tmr evening").draft, today).strip).toBe("Tomorrow, evening");
  });

  it("labels a project that will be created when told to", () => {
    const { draft } = draftOf("Write post #+Blog");
    expect(interpret(draft, today, "new project Blog").parts).toContain("new project Blog");
  });
});

describe("dayLabel", () => {
  it("uses the words people use near today and a date further out", () => {
    expect(dayLabel(localDate("2026-09-11"), today)).toBe("Today");
    expect(dayLabel(localDate("2026-09-12"), today)).toBe("Tomorrow");
    expect(dayLabel(localDate("2026-09-10"), today)).toBe("Yesterday");
    expect(dayLabel(localDate("2026-09-17"), today)).toMatch(/^Thu 17 Sep/);
    expect(dayLabel(localDate("2027-01-05"), today)).toMatch(/^Tue 5 Jan 2027$/);
  });
});

describe("priorityLabel", () => {
  it("reads the stored value back the way it was typed", () => {
    expect(priorityLabel(3)).toBe("priority 1");
    expect(priorityLabel(1)).toBe("priority 3");
    expect(priorityLabel(0)).toBeNull();
  });
});

describe("project resolution", () => {
  const projects = [
    { id: "p1", name: "Acme" },
    { id: "p2", name: "Acme redesign" },
    { id: "p3", name: "Website" },
  ];

  it("resolves an exact name regardless of case, and nothing else", () => {
    expect(resolveProject("acme", projects)?.id).toBe("p1");
    expect(resolveProject("ACME REDESIGN", projects)?.id).toBe("p2");
    expect(resolveProject("acm", projects)).toBeNull();
    expect(resolveProject(null, projects)).toBeNull();
  });

  it("suggests prefix matches before matches elsewhere in the name", () => {
    expect(projectMatches("re", projects).map((p) => p.id)).toEqual(["p2"]);
    expect(projectMatches("site", projects).map((p) => p.id)).toEqual(["p3"]);
    expect(projectMatches("a", projects).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(projectMatches("  ", projects)).toEqual([]);
  });

  it("finds the one project a partial name stands for, and none when two are as good", () => {
    const more = [...projects, { id: "p4", name: "Q4 planning" }];
    expect(bestProjectMatch("Q4", more)?.id).toBe("p4");
    expect(bestProjectMatch("web", more)?.id).toBe("p3");
    expect(bestProjectMatch("plan", more)?.id).toBe("p4"); // only inside a name, but only one
    expect(bestProjectMatch("ac", more)).toBeNull(); // "Acme" and "Acme redesign" both start with it
    expect(bestProjectMatch("e", more)).toBeNull(); // in four names, at the start of none
    expect(bestProjectMatch("zzz", more)).toBeNull();
    expect(bestProjectMatch(null, more)).toBeNull();
    // Two projects with one name (different areas): nothing is filed by guess (§5.4).
    expect(bestProjectMatch("Q4", [...more, { id: "p5", name: "Q4 planning" }])).toBeNull();
  });

  it("two projects of one name are a collision: neither resolves, both are named, and pickers show the area", () => {
    const twins = [
      { id: "w1", name: "Website", area: "Work" },
      { id: "w2", name: "Website", area: "Personal" },
      { id: "p1", name: "Acme", area: "Work" },
    ];
    expect(resolveProject("website", twins)).toBeNull();
    expect(projectsNamed("WEBSITE", twins).map((p) => p.id)).toEqual(["w1", "w2"]);
    expect(projectOptionLabel(twins[0], twins)).toBe("Website · Work");
    expect(projectOptionLabel(twins[1], twins)).toBe("Website · Personal");
    expect(projectOptionLabel(twins[2], twins)).toBe("Acme");
    expect(resolveProject("acme", twins)?.id).toBe("p1");
  });

  it("writes a token that parses back to the same name", () => {
    expect(projectToken("Acme")).toBe("#Acme");
    expect(projectToken("Q4 launch")).toBe('#"Q4 launch"');
    for (const name of ["Acme", "Q4 launch", "side-project"]) {
      const r = parse(`Do it ${projectToken(name)}`, ctx);
      expect(r.ok && r.draft.projectName).toBe(name);
    }
  });
});

describe("tags", () => {
  const tags = [
    { id: "t1", name: "calls" },
    { id: "t2", name: "Calendar" },
    { id: "t3", name: "focus" },
    { id: "t4", name: "local" },
  ];

  it("matches without regard to case, prefix first, and never offers the exact one", () => {
    expect(resolveTag("CALLS", tags)?.id).toBe("t1");
    expect(resolveTag("errand", tags)).toBeNull();
    expect(tagMatches("ca", tags).map((t) => t.id)).toEqual(["t1", "t2", "t4"]);
    expect(tagMatches("calls", tags)).toEqual([]);
    expect(tagMatches("", tags)).toEqual([]);
    expect(tagToken("calls")).toBe("@calls");
    expect(tagToken("deep work")).toBe('@"deep work"');
  });

  it("gives each tag its own fact and marks the new ones", () => {
    const i = interpret(draftOf("Prep @calls @errand").draft, today, null, ["errand"]);
    expect(i.facts.filter((f) => f.kind === "tag").map((f) => [f.label, f.tag])).toEqual([
      ["@calls", "calls"],
      ["new tag @errand", "errand"],
    ]);
    expect(i.strip).toBe("@calls · new tag @errand");
  });
});

describe("removing a chip", () => {
  it("finds every part of the line a fact came from", () => {
    const r = draftOf("Call tonight 8pm @calls @Deep ~30m");
    const facts = interpret(r.draft, today).facts;
    const of = (kind: string, tag?: string) => factSpans(facts.find((f) => f.kind === kind && (!tag || f.tag === tag))!, r.spans).map((s) => s.text);
    expect(of("time")).toEqual(["tonight", "8pm"]);
    expect(of("tag", "Deep")).toEqual(["@Deep"]);
    expect(of("estimate")).toEqual(["~30m"]);
  });

  it("carries literal runs through edits: typing keeps them, deleting into them frees the words", () => {
    const before = "Meeting about fri";
    const fri = [{ start: 14, end: 17 }];
    expect(carryRanges(fri, before, `${before} notes`)).toEqual(fri); // typing after the run
    expect(carryRanges(fri, before, `New ${before}`)).toEqual([{ start: 18, end: 21 }]); // typing before it shifts it
    expect(carryRanges(fri, before, "Meeting about frXi")).toEqual([{ start: 14, end: 18 }]); // typing inside grows it
    expect(carryRanges(fri, before, "Meeting about fr")).toEqual([]); // a Backspace into it frees it
    expect(carryRanges(fri, before, "Meeting fri")).toEqual([{ start: 8, end: 11 }]); // deleting before it shifts it
    expect(carryRanges(fri, before, "")).toEqual([]);
  });
});

describe("segments", () => {
  it("cuts the input into plain runs and token runs, in order", () => {
    const value = "Draft proposal fri 3pm ~45m #acme";
    const { spans } = draftOf(value);
    const segs = segments(value, spans);
    expect(segs.map((s) => s.text).join("")).toBe(value);
    expect(segs.filter((s) => s.kind).map((s) => [s.kind, s.text])).toEqual([
      ["datetime", "fri"],
      ["datetime", "3pm"],
      ["estimate", "~45m"],
      ["project", "#acme"],
    ]);
  });

  it("does not paint protected text as a token", () => {
    const value = 'Tidy "the #1 room"';
    const { spans } = draftOf(value);
    expect(segments(value, spans).every((s) => s.kind === null)).toBe(true);
  });

  it("is the identity with no spans", () => {
    expect(segments("Email Sam", [])).toEqual([{ text: "Email Sam", kind: null }]);
    expect(segments("", [])).toEqual([]);
  });
});

describe("splitPaste", () => {
  it("treats two or more lines as many tasks and one line as none", () => {
    expect(splitPaste("Buy milk\nCall Dana\n\n  Pay rent  \n")).toEqual(["Buy milk", "Call Dana", "Pay rent"]);
    expect(splitPaste("Buy milk\n")).toEqual([]);
    expect(splitPaste("")).toEqual([]);
  });

  it("strips a list marker at the start of each line (PRODUCT_SPEC.md §5.1 rule 6)", () => {
    // Seen in the walkthrough: a pasted list became tasks titled "- Buy milk" and "[ ] Call Dana".
    const pasted = ["- Buy milk", "* Call Dana tmr", "• Pay rent", "[ ] Book the dentist", "[x] Renew passport", "1. Draft the agenda", "12) Send the invite", "- [ ] Water plants", "  2.   Tidy desk"].join("\n");
    expect(splitPaste(pasted)).toEqual(["Buy milk", "Call Dana tmr", "Pay rent", "Book the dentist", "Renew passport", "Draft the agenda", "Send the invite", "Water plants", "Tidy desk"]);
  });

  it("leaves a marker-like start that is part of the words, and drops a line that was only a marker", () => {
    expect(splitPaste("-5 degrees, bring a coat\n*urgent* call the bank\n2024 taxes\nPlan 1. draft\n- \n[ ]")).toEqual(["-5 degrees, bring a coat", "*urgent* call the bank", "2024 taxes", "Plan 1. draft"]);
  });
});

describe("emptyDraft", () => {
  it("is what an unparsed title becomes", () => {
    expect(emptyDraft().priority).toBe(0);
  });
});
