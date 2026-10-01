import { describe, expect, it } from "vitest";
import { emptyDraft, parse } from "@/core/quickadd";
import { instant, localDate } from "@/core/time";
import { dayLabel, interpret, priorityLabel, projectMatches, projectToken, resolveProject, segments, splitPaste } from "./interpret";

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
    expect(interpret(draftOf("Read chapter evening").draft, today).strip).toBe("This evening");
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

  it("writes a token that parses back to the same name", () => {
    expect(projectToken("Acme")).toBe("#Acme");
    expect(projectToken("Q4 launch")).toBe('#"Q4 launch"');
    for (const name of ["Acme", "Q4 launch", "side-project"]) {
      const r = parse(`Do it ${projectToken(name)}`, ctx);
      expect(r.ok && r.draft.projectName).toBe(name);
    }
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
});

describe("emptyDraft", () => {
  it("is what an unparsed title becomes", () => {
    expect(emptyDraft().priority).toBe(0);
  });
});
