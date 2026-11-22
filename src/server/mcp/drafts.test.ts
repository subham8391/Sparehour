// Adding a task, asked first (DECISIONS.md, amendment 2026-11-22): the draft's reading, what it says is not set, the
// real choices and the notices, with nothing written; and the fields an assistant lays over the line as it is added.
// Friday 23 October 2026, 09:00 UTC, working Monday to Friday 09:00–18:00, 15% buffer.
import { beforeEach, describe, expect, it } from "vitest";
import { Temporal } from "@/core/time";
import { formatAdded, formatDraft } from "./format";
import { Planner, Refusal } from "./planner";
import type { Row } from "./store";
import { FakeStore } from "./store.fake";

const NOW = Temporal.Instant.from("2026-10-23T09:00:00Z");
const ACME = "aaaaaaaa-0000-4000-8000-000000000001";
const GARDEN = "aaaaaaaa-0000-4000-8000-000000000002";
const HOME = "cccccccc-0000-4000-8000-000000000001";
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const task = (over: Row): Row => ({ id: uuid(), space_id: "s1", project_id: null, heading_id: null, area_id: null, title: "A task", notes_md: null, state: "active", priority: 0, do_date: null, do_time: null, deadline: null, start_date: null, evening: 0, estimate_min: null, carry_count: 0, miss_policy: "carry", recurrence_rule: null, recurrence_mode: null, sort_key: "a0", day_sort_key: null, deleted_at: null, ...over });

let store: FakeStore;
let planner: Planner;

function setup(tables: Record<string, Row[]> = {}) {
  store = new FakeStore(
    {
      areas: [{ id: HOME, name: "Home", sort_key: "a0", deleted_at: null }],
      projects: [
        { id: ACME, area_id: null, name: "Acme launch", state: "active", sort_key: "a0", deleted_at: null },
        { id: GARDEN, area_id: HOME, name: "Garden", state: "active", sort_key: "a1", deleted_at: null },
      ],
      tags: [{ id: "t-client", name: "client", deleted_at: null }],
      work_hours: [0, 1, 2, 3, 4].map((weekday) => ({ id: `w${weekday}`, weekday, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null })),
      ...tables,
    },
    { userId: "u1", spaceId: "s1" },
  );
  planner = new Planner(store, { device: "mcp:c1", now: () => NOW, newId: uuid });
}

const on = (table: string) => store.ops.filter((o) => o.table === table);
const refusal = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(Refusal);
  return (e as Refusal).message;
};

beforeEach(() => {
  seq = 0;
  setup();
});

describe("draft_task", () => {
  it("says what it read and what nobody has said, with the person's own choices, and writes nothing", async () => {
    setup({ tasks: [task({ title: "Order seeds", project_id: GARDEN }), task({ title: "Prune roses", project_id: GARDEN })], task_tags: [] });
    const v = await planner.drafts.draft([{ text: "Call the dentist" }]);
    expect(v.lines[0]).toMatchObject({ title: "Call the dentist", strip: "", destination: "Inbox", missing: ["when", "length", "project", "deadline", "priority", "tags", "repeat", "steps", "note"], notices: [], problem: null });
    // Friday, Saturday, then the next working days: Monday, Tuesday, Wednesday. Saturday has no hours, so no number.
    expect(v.choices.days.map((d) => d.label)).toEqual(["today", "tomorrow", "Mon 26 Oct", "Tue 27 Oct", "Wed 28 Oct"]);
    expect(v.choices.days.map((d) => d.spareMin !== null)).toEqual([true, false, true, true, true]);
    // The busiest project first, each with its area.
    expect(v.choices.projects).toEqual(["Garden (Home)", "Acme launch"]);
    expect(v.choices.tags).toEqual(["client"]);
    expect(store.ops).toHaveLength(0);

    const text = formatDraft(v);
    expect(text).toMatch(/^Not added yet\. This is how Sparehour reads it\./);
    expect(text).toContain("Not set: day, how long, project, deadline, priority, tags");
    expect(text).toMatch(/- When\? today \(.+ spare\) · tomorrow · Mon 26 Oct \(.+ spare\)/);
    expect(text).toContain("- Which project? Garden (Home) · Acme launch · none · a new one");
    expect(text).toContain("- Anything else? a repeat, steps, a note");
    expect(text).toContain("confirmed: true");
  });

  it("asks only for what is missing, and takes “none” as an answer", async () => {
    const v = await planner.drafts.draft([{ text: "Draft proposal mon 3pm ~45m #Acme @client !2", deadline: "none", repeat: "none" }]);
    expect(v.lines[0]).toMatchObject({ title: "Draft proposal", missing: ["steps", "note"], destination: "Upcoming" });
    expect(v.lines[0].strip).toBe("Mon 26 Oct 15:00 · 45m · Acme launch · @client · priority 2");
    const text = formatDraft(v);
    expect(text).not.toContain("Not set:");
    expect(text).not.toContain("When?");
  });

  it("points at a likely project by its words, and never files it there", async () => {
    setup({ tasks: [task({ title: "Order compost for the beds", project_id: GARDEN })] });
    const v = await planner.drafts.draft([{ text: "Spread the compost" }]);
    expect(v.lines[0].likelyProject).toBe("Garden");
    expect(v.lines[0].missing).toContain("project");
    expect(formatDraft(v)).toContain("Its words point at the project Garden (ask, don't assume).");
    expect((await planner.drafts.add({ text: "Spread the compost" })).task.project).toBeNull();
  });

  it("tells the person when the day is full, a time clashes, or the task is there already", async () => {
    setup({
      tasks: [task({ title: "Call Dana" }), task({ title: "Big one", do_date: "2026-10-26", estimate_min: 440 })],
      calendars: [{ id: "k1", read: 1, private: 0, deleted_at: null }],
      calendar_events: [{ id: "e1", calendar_id: "k1", summary: "Standup", start_at: "2026-10-26T15:00:00Z", end_at: "2026-10-26T15:30:00Z", all_day: 0, busy: 1, status: "confirmed", self_response: "accepted", is_ours: 0, deleted_at: null }],
    });
    const [line] = (await planner.drafts.draft([{ text: "Call Dana mon 3pm ~1h" }])).lines;
    expect(line.notices).toHaveLength(3);
    expect(line.notices[0]).toMatch(/^An open task is already called this: id /);
    expect(line.notices[1]).toMatch(/^Mon 26 Oct has (no spare time|.+ spare); this puts it .+ over\.$/);
    expect(line.notices[2]).toBe("It overlaps Standup 15:00–15:30.");
    expect((await planner.drafts.draft([{ text: "Rest sat" }])).lines[0].notices).toEqual(["Tomorrow has no working hours."]);
  });

  it("says how long such tasks usually take, once enough were finished", async () => {
    store.learnedIs = { estimated: {}, unestimated: { n: 8, minutes: 60 }, projects: {} };
    const v = await planner.drafts.draft([{ text: "Write a post" }]);
    expect(v.lines[0].usual).toEqual({ minutes: 60, n: 8 });
    expect(formatDraft(v)).toContain("Tasks like this usually take them 1h (from 8 finished).");
  });

  it("drafts several together, with the one that cannot be read said in words", async () => {
    const v = await planner.drafts.draft([{ text: "Buy milk today" }, { text: "Fix the tap", project: "Nowhere" }]);
    expect(v.lines[1].problem).toMatch(/No project is called “Nowhere”/);
    const text = formatDraft(v, "unconfirmed");
    expect(text).toMatch(/^Nothing has been added: ask the person first/);
    expect(text).toContain("1. “Buy milk”");
    expect(text).toContain("2. “Fix the tap”\n   Can't be added as it is: No project is called");
    expect(text).toContain("for all of them together");
    expect(store.ops).toHaveLength(0);
  });
});

describe("days as an assistant says them", () => {
  it.each([
    ["Mon 26 Oct", "2026-10-26", null, false],
    ["Mon 26 Oct 15:00", "2026-10-26", "15:00:00", false],
    ["Friday, 30 October", "2026-10-30", null, false],
    ["fri oct 30", "2026-10-30", null, false],
    ["monday", "2026-10-26", null, false],
    ["on monday", "2026-10-26", null, false],
    ["monday at 3pm", "2026-10-26", "15:00:00", false],
    ["tomorrow at 15:00", "2026-10-24", "15:00:00", false],
    ["tomorrow 9am", "2026-10-24", "09:00:00", false],
    ["2026-11-02", "2026-11-02", null, false],
    ["2026-11-02 15:00", "2026-11-02", "15:00:00", false],
    ["2026-11-02T19:30:00", "2026-11-02", "19:30:00", true],
    ["2026-11-02 evening", "2026-11-02", null, true],
    ["tonight", "2026-10-23", null, true],
    ["this evening", "2026-10-23", null, true],
    ["tomorrow evening", "2026-10-24", null, true],
    ["today", "2026-10-23", null, false],
    ["yesterday", "2026-10-22", null, false],
    ["next week", "2026-10-26", null, false],
    ["in 3 days", "2026-10-26", null, false],
    ["30 oct", "2026-10-30", null, false],
  ])("%s", async (words, date, time, evening) => {
    const d = planner.readDay(words, await planner.ctx());
    expect([d.date.toString(), d.time?.toString() ?? null, d.evening]).toEqual([date, time, evening]);
  });
});

describe("the fields laid over the line", () => {
  it("writes every answer: day and time, length, project and heading, tags, priority, dates, steps, note and what happens if missed", async () => {
    setup({ headings: [{ id: "h1", project_id: ACME, title: "Copy", sort_key: "a0", deleted_at: null }] });
    const a = await planner.drafts.add({
      title: "Write the Friday post",
      do: "mon 10am",
      estimate: "1h 30m",
      project: "acme launch",
      heading: "copy",
      tags: ["client", "Writing"],
      priority: 1,
      deadline: "fri 30 oct",
      start: "2026-10-25",
      if_missed: "expire",
      steps: ["Outline", " ", "Draft"],
      notes: "For Dana.",
    });
    expect(on("tasks")[0].data).toMatchObject({ title: "Write the Friday post", do_date: "2026-10-26", do_time: "10:00", estimate_min: 90, project_id: ACME, area_id: null, heading_id: "h1", priority: 3, deadline: "2026-10-30", start_date: "2026-10-25", miss_policy: "expire", notes_md: "For Dana.", state: "active", source: "mcp" });
    expect(on("checklist_items").map((o) => o.data?.title)).toEqual(["Outline", "Draft"]);
    expect(String(on("checklist_items")[0].data?.sort_key) < String(on("checklist_items")[1].data?.sort_key)).toBe(true);
    expect(on("tags").map((o) => o.data?.name)).toEqual(["Writing"]);
    expect(on("task_tags")).toHaveLength(2);
    expect(on("time_blocks")[0].data).toMatchObject({ start_at: "2026-10-26T10:00:00Z", end_at: "2026-10-26T11:30:00Z" });
    expect(formatAdded(a, Temporal.PlainDate.from("2026-10-23"))).toContain("steps: Outline / Draft");
  });

  it("makes a new project in its area with a new heading, or joins one of that name", async () => {
    await planner.drafts.add({ text: "Paint the fence", new_project: "Repairs", area: "home", heading: "Outside" });
    const project = on("projects")[0];
    expect(project.data).toMatchObject({ name: "Repairs", area_id: HOME, state: "active" });
    expect(on("headings")[0].data).toMatchObject({ project_id: project.id, title: "Outside" });
    expect(on("tasks")[0].data).toMatchObject({ project_id: project.id, area_id: null, heading_id: on("headings")[0].id });
    store.ops.length = 0;
    await planner.drafts.add({ text: "Rake leaves", new_project: "garden" });
    expect(on("projects")).toHaveLength(0);
    expect(on("tasks")[0].data).toMatchObject({ project_id: GARDEN });
  });

  it("files straight in an area, parks in Someday, and repeats from its first day", async () => {
    expect((await planner.drafts.add({ text: "Tidy the shed", area: "Home" })).destination).toBe("Home");
    expect(on("tasks")[0].data).toMatchObject({ area_id: HOME, project_id: null, state: "active" });
    expect((await planner.drafts.add({ text: "Learn the cello tomorrow", do: "someday" })).destination).toBe("Someday");
    expect(on("tasks")[1].data).toMatchObject({ state: "someday", do_date: null });
    await planner.drafts.add({ text: "Water plants", repeat: "every monday" });
    expect(on("tasks")[2].data).toMatchObject({ recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", do_date: "2026-10-26", miss_policy: "skip", recurrence_series_id: on("tasks")[2].id });
  });

  it("an answer of none takes off what the words set", async () => {
    await planner.drafts.add({ text: "Plan party fri 3pm ~1h #Garden", do: "none", estimate: null, project: "none" });
    expect(on("tasks")[0].data).toMatchObject({ title: "Plan party", do_date: null, do_time: null, estimate_min: null, project_id: null, state: "inbox" });
    expect(on("time_blocks")).toHaveLength(0);
  });

  it("refuses, in words, what it cannot read, and writes nothing", async () => {
    expect(await refusal(planner.drafts.add({}))).toMatch(/empty/);
    expect(await refusal(planner.drafts.add({ text: "A", do: "the day after the party" }))).toMatch(/as a day/);
    expect(await refusal(planner.drafts.add({ text: "A", estimate: "a while" }))).toMatch(/as an estimate/);
    expect(await refusal(planner.drafts.add({ text: "A", repeat: "now and then" }))).toMatch(/as a repeat/);
    expect(await refusal(planner.drafts.add({ text: "A", area: "Attic" }))).toBe("No area is called “Attic”. There is: “Home”. add_area makes a new one.");
    expect(await refusal(planner.drafts.add({ text: "A", heading: "Copy" }))).toMatch(/say which project/);
    expect(await refusal(planner.drafts.add({ text: "A", do: "someday", repeat: "every day" }))).toMatch(/cannot wait in Someday/);
    expect(store.ops).toHaveLength(0);
  });
});
