// The rest of the app over MCP (DECISIONS.md, amendment 2026-11-22): days and time blocks, repeats, projects, areas,
// headings, steps, copies, planning settings and closing the day, each the ops the app's own repositories write, and
// the refusals in words. Friday 23 October 2026, 09:00 UTC, working Monday to Friday 09:00–18:00.
import { beforeEach, describe, expect, it } from "vitest";
import { exceptionId } from "@/core/recurrence/exception-id";
import { Temporal } from "@/core/time";
import { formatDayView, formatLog, formatPlace, formatSettings, formatSomeday, formatTags, formatToday } from "./format";
import { Planner, Refusal } from "./planner";
import type { Row } from "./store";
import { FakeStore } from "./store.fake";

const NOW = Temporal.Instant.from("2026-10-23T09:00:00Z");
const TODAY = Temporal.PlainDate.from("2026-10-23");
const ACME = "aaaaaaaa-0000-4000-8000-000000000001";
const HOME = "cccccccc-0000-4000-8000-000000000001";
const T1 = "11111111-0000-4000-8000-000000000001";
const B1 = "22222222-0000-4000-8000-000000000001";
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const task = (over: Row): Row => ({ id: uuid(), space_id: "s1", project_id: null, heading_id: null, area_id: null, title: "A task", notes_md: null, state: "active", priority: 0, do_date: null, do_time: null, deadline: null, start_date: null, evening: 0, estimate_min: null, carry_count: 0, miss_policy: "carry", recurrence_rule: null, recurrence_mode: null, recurrence_series_id: null, recurrence_paused_until: null, sort_key: "a0", day_sort_key: null, completed_at: null, deleted_at: null, ...over });
const block = (over: Row): Row => ({ id: B1, space_id: "s1", task_id: null, title: "Focus", start_at: "2026-10-23T14:00:00+00:00", end_at: "2026-10-23T15:00:00+00:00", locked: 0, source: "manual", deleted_at: null, ...over });
const weekly = (over: Row = {}) => task({ id: T1, title: "Gym", do_date: "2026-10-26", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", recurrence_series_id: T1, miss_policy: "skip", ...over });

let store: FakeStore;
let planner: Planner;

function setup(tables: Record<string, Row[]> = {}) {
  store = new FakeStore(
    {
      areas: [{ id: HOME, name: "Home", sort_key: "a0", deleted_at: null }],
      projects: [{ id: ACME, area_id: null, name: "Acme", notes_md: null, state: "active", deadline: null, sort_key: "a0", deleted_at: null }],
      work_hours: [0, 1, 2, 3, 4].map((weekday) => ({ id: `w${weekday}`, weekday, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null })),
      user_settings: [{ id: "set1", deleted_at: null }],
      ...tables,
    },
    { userId: "u1", spaceId: "s1", settings: { id: "set1", timezone: "UTC", day_rollover_hour: 4, buffer_pct: 15, default_estimate_min: 30, evening_starts_at: "18:00:00", evening_ends_at: "22:00:00", notify_block_start: 1, notify_deadline: 1, notify_morning: 0, notify_shutdown: 1 } },
  );
  planner = new Planner(store, { device: "mcp:c1", now: () => NOW, newId: uuid });
}

const on = (table: string) => store.ops.filter((o) => o.table === table).map((o) => [o.op, o.id, o.data] as const);
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

describe("days and time blocks", () => {
  it("shows any day with its blocks' ids, and what was finished on it by the day's own hours", async () => {
    setup({
      tasks: [task({ title: "Plan", do_date: "2026-10-23" }), task({ title: "Done late", state: "done", completed_at: "2026-10-24T01:30:00Z" }), weekly()],
      task_completions: [{ id: "c1", task_id: T1, occurrence_date: "2026-10-23", completed_at: "2026-10-23T08:00:00Z", deleted_at: null }],
      time_blocks: [block({ locked: 1 })],
    });
    const text = formatDayView(await planner.blocks.day("today"));
    expect(text).toContain(`Time blocks (1)\n- 14:00–15:00 Focus · locked [block ${B1}]`);
    expect(text).toContain("Finished (2)\n- Gym (08:00)\n- Done late (01:30)");
    expect(text).toContain("- Plan");
    expect(formatToday(await planner.todayView())).toContain(`[block ${B1}]`);
    expect(formatLog(await planner.blocks.log(7))).toBe("Fri 23 Oct (2 finished)\n- Gym\n- Done late");
  });

  it("blocks a task in the next free gap, for its estimate", async () => {
    setup({ tasks: [task({ id: T1, title: "Write", do_date: "2026-10-23", estimate_min: 60 })], time_blocks: [block({ start_at: "2026-10-23T09:30:00+00:00", end_at: "2026-10-23T11:00:00+00:00" })] });
    const r = await planner.blocks.add({ task: "Write" });
    expect(r.said).toMatch(/^Blocked “Write” on today 11:00–12:00 \[block /);
    expect(on("time_blocks")[0][2]).toMatchObject({ task_id: T1, title: "Write", start_at: "2026-10-23T11:00:00Z", end_at: "2026-10-23T12:00:00Z", source: "manual", locked: false, user_id: "u1" });
    expect(on("tasks")).toHaveLength(0);
  });

  it("blocking on another day moves the task there, and says what it overlaps", async () => {
    setup({ tasks: [task({ id: T1, title: "Write", state: "inbox" })], time_blocks: [block({ start_at: "2026-10-26T10:00:00+00:00", end_at: "2026-10-26T11:00:00+00:00" })] });
    const r = await planner.blocks.add({ task: T1, day: "mon", start: "10:30", minutes: "1h30" });
    expect(r.said).toMatch(/^Blocked “Write” on Mon 26 Oct 10:30–12:00, and the task is on Mon 26 Oct now \[block .+\]\. It overlaps Focus 10:00–11:00$/);
    expect(on("tasks")).toEqual([["PATCH", T1, { do_date: "2026-10-26", state: "active" }]]);
  });

  it("makes a block of the person's own, moves it, renames it, locks it, and takes it away", async () => {
    setup({ time_blocks: [block({})] });
    expect((await planner.blocks.add({ title: "Lunch", start: "12:30", end: "13:15" })).said).toMatch(/^Blocked “Lunch” on today 12:30–13:15/);
    expect((await planner.blocks.change("Focus", { start: "16:00" })).said).toBe("Block “Focus”: moved to today 16:00–17:00 (1h)");
    expect((await planner.blocks.change(B1, { day: "mon", minutes: 30, title: "Deep", locked: true })).said).toBe("Block “Focus”: moved to Mon 26 Oct 16:00–16:30 (30m), renamed to “Deep”, locked");
    expect(await refusal(planner.blocks.change(B1, { start: "9:00" }))).toMatch(/is locked at 16:00–16:30/);
    expect((await planner.blocks.change(B1, { start: "9:00", locked: false })).said).toContain("unlocked");
    expect((await planner.blocks.remove(B1)).said).toBe("Removed the block “Deep” (Mon 26 Oct 09:00–09:30)");
    expect(on("time_blocks").at(-1)).toEqual(["DELETE", B1, undefined]);
  });

  it("refuses what makes no sense, in words", async () => {
    setup({ tasks: [weekly()] });
    expect(await refusal(planner.blocks.add({}))).toMatch(/Say what the block is for/);
    expect(await refusal(planner.blocks.add({ title: "x", day: "yesterday" }))).toBe("That day has passed.");
    expect(await refusal(planner.blocks.add({ title: "x", start: "15:00", end: "14:00" }))).toMatch(/end after it starts/);
    expect(await refusal(planner.blocks.add({ task: "Gym", day: "tue", start: "9:00" }))).toMatch(/repeats and is on Mon 26 Oct/);
    expect(await refusal(planner.blocks.change("Nothing", { locked: true }))).toMatch(/No block ahead matches/);
    expect(store.ops).toHaveLength(0);
  });

  it("keeps a task's time and its block in step, as the app does", async () => {
    setup({ tasks: [task({ id: T1, title: "Call", do_date: "2026-10-26", do_time: "10:00", estimate_min: 30 })], time_blocks: [block({ task_id: T1, title: "Call", start_at: "2026-10-26T10:00:00+00:00", end_at: "2026-10-26T10:30:00+00:00" })] });
    expect((await planner.update("Call", { time: "3pm" })).said).toBe("Changed “Call”: at 15:00 · blocked 15:00–15:30");
    expect(on("time_blocks")[0]).toEqual(["PATCH", B1, { start_at: "2026-10-26T15:00:00Z", end_at: "2026-10-26T15:30:00Z" }]);
    expect((await planner.update("Call", { estimate: 60 })).blocksChanged).toBe(1);
    expect((await planner.update("Call", { time: "none" })).said).toBe("Changed “Call”: no time · its time block is gone");
    expect(on("time_blocks").at(-1)?.[0]).toBe("DELETE");
    // A task with no day has nowhere to put a time.
    setup({ tasks: [task({ title: "Loose" })] });
    expect(await refusal(planner.update("Loose", { time: "3pm" }))).toMatch(/has no day yet/);
  });
});

describe("repeats", () => {
  it("gives a task a repeat from its day, or from the rule's first day", async () => {
    setup({ tasks: [task({ id: T1, title: "Water plants", state: "inbox" })] });
    expect((await planner.repeats.set("Water plants", "every monday")).said).toBe("“Water plants” now repeats every Monday, next on Mon 26 Oct");
    expect(on("tasks")).toEqual([["PATCH", T1, { recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", recurrence_series_id: T1, miss_policy: "skip", do_date: "2026-10-26", state: "active" }]]);
  });

  it("changes the rule from today and drops the one-off changes ahead", async () => {
    setup({ tasks: [weekly()], recurrence_exceptions: [{ id: "ex1", series_id: T1, occurrence_date: "2026-11-02", kind: "skip", moved_to: null, deleted_at: null }] });
    const r = await planner.repeats.set("Gym", "every wednesday");
    expect(r.said).toBe("“Gym” now repeats every Wednesday, next on Wed 28 Oct · dropped 1 one-off change");
    expect(on("recurrence_exceptions")).toEqual([["DELETE", "ex1", undefined]]);
    expect(on("tasks")[0][2]).toMatchObject({ recurrence_rule: "FREQ=WEEKLY;BYDAY=WE", do_date: "2026-10-28" });
  });

  it("skips one day under its stable id, the deadline travelling with it", async () => {
    setup({ tasks: [weekly({ deadline: "2026-10-27" })] });
    expect((await planner.repeats.skip("Gym")).said).toBe("Skipped “Gym” this time · next Mon 2 Nov");
    expect(on("recurrence_exceptions")[0]).toEqual(["PUT", exceptionId(T1, "2026-10-26"), { space_id: "s1", series_id: T1, occurrence_date: "2026-10-26", kind: "skip", moved_to: null, deleted_at: null }]);
    expect(on("tasks")[0][2]).toEqual({ do_date: "2026-11-02", deadline: "2026-11-03" });
  });

  it("pauses until a day, resumes, and stops", async () => {
    setup({ tasks: [weekly()] });
    expect((await planner.repeats.pause("Gym", "2026-11-04")).said).toBe("Paused “Gym” until Wed 4 Nov; it comes back on Mon 9 Nov");
    expect((await planner.repeats.resume("Gym")).said).toBe("Resumed “Gym” · next Mon 26 Oct");
    expect(await refusal(planner.repeats.resume("Gym"))).toBe("“Gym” is not paused.");
    expect((await planner.repeats.stop("Gym")).said).toBe("“Gym” no longer repeats; the task itself stays on Mon 26 Oct");
    expect(on("tasks").at(-1)?.[2]).toEqual({ recurrence_rule: null, recurrence_mode: null, recurrence_series_id: null, recurrence_paused_until: null, miss_policy: "carry" });
    expect(await refusal(planner.repeats.skip("Gym"))).toBe("“Gym” does not repeat.");
    expect(await refusal(planner.repeats.pause("Gym", "tomorrow"))).toBe("“Gym” does not repeat.");
  });

  it("a timed repeat keeps its time on the day it rolls on to", async () => {
    setup({ tasks: [weekly({ do_date: "2026-10-23", recurrence_rule: "FREQ=WEEKLY;BYDAY=FR", do_time: "07:00", estimate_min: 60 })] });
    expect((await planner.complete("Gym")).blocksChanged).toBe(1);
    expect(on("time_blocks")[0][2]).toMatchObject({ task_id: T1, start_at: "2026-10-30T07:00:00Z", end_at: "2026-10-30T08:00:00Z" });
  });
});

describe("projects, areas, headings and tags", () => {
  it("makes a project with its area, deadline, note and headings, once", async () => {
    const r = await planner.places.addProject({ name: " Kitchen ", area: "home", deadline: "30 nov", notes: "New tiles", headings: ["Plan", "Build"] });
    expect(r.said).toMatch(/^Added the project “Kitchen” \(in Home · due Mon 30 Nov · headings: Plan, Build\) \[id /);
    expect(on("projects")[0][2]).toMatchObject({ name: "Kitchen", area_id: HOME, deadline: "2026-11-30", notes_md: "New tiles", state: "active" });
    expect(on("headings").map((h) => h[2]?.title)).toEqual(["Plan", "Build"]);
    expect(await refusal(planner.places.addProject({ name: "kitchen", area: "Home" }))).toMatch(/already a project called/);
    expect(await refusal(planner.places.addProject({ name: "X", area: "Attic" }))).toMatch(/No area is called “Attic”/);
  });

  it("edits a project: name, state, area and headings, saying what stays", async () => {
    setup({
      tasks: [task({ id: T1, title: "One", project_id: ACME, heading_id: "h1" })],
      headings: [{ id: "h1", project_id: ACME, title: "Copy", sort_key: "a0", deleted_at: null }, { id: "h2", project_id: ACME, title: "Design", sort_key: "a1", deleted_at: null }],
    });
    expect((await planner.places.updateProject("acme", { remove_heading: "copy", rename_heading: { from: "Design", to: "Look" }, add_headings: ["Ship"], area: "Home" })).said).toBe("Changed the project “Acme”: in Home, heading “Design” renamed to “Look”, heading “Copy” removed; its tasks stay in the project, heading “Ship” added");
    expect(on("tasks")).toEqual([["PATCH", T1, { heading_id: null }]]);
    expect((await planner.places.updateProject("Acme", { state: "done" })).said).toBe("Changed the project “Acme”: completed, its 1 open task stays as it is");
    expect(on("projects").at(-1)?.[2]).toEqual({ state: "done", completed_at: "2026-10-23T09:00:00.000Z" });
    expect((await planner.places.updateProject("Acme", { state: "active" })).said).toContain("brought back");
    expect(await refusal(planner.places.updateProject("Acme", { remove_heading: "Nope" }))).toMatch(/has no heading called “Nope”\. It has: /);
    expect(await refusal(planner.places.updateProject("Acme", {}))).toMatch(/Nothing to change/);
  });

  it("shows a project with its headings, an area with its projects, Someday and the tags", async () => {
    setup({
      projects: [{ id: ACME, area_id: HOME, name: "Acme", notes_md: "Big one", state: "active", deadline: "2026-10-30", sort_key: "a0", deleted_at: null }, { id: "p2", area_id: null, name: "Sailing", state: "someday", sort_key: "a1", deleted_at: null }],
      headings: [{ id: "h1", project_id: ACME, title: "Copy", sort_key: "a0", deleted_at: null }],
      tasks: [task({ id: T1, title: "Loose", project_id: ACME }), task({ title: "Under", project_id: ACME, heading_id: "h1" }), task({ title: "Parked", state: "someday", project_id: ACME }), task({ title: "Sweep", area_id: HOME })],
      tags: [{ id: "g1", name: "deep work", deleted_at: null }, { id: "g2", name: "calls", deleted_at: null }],
      task_tags: [{ id: "l1", task_id: T1, tag_id: "g1", deleted_at: null }],
    });
    const project = formatPlace(await planner.places.place("Acme"), TODAY);
    expect(project).toContain(`Acme (project) — in Home · due `);
    expect(project).toMatch(/note:\nBig one\n\nTasks \(1\)\n- Loose.*\n\nCopy \(heading, 1\)\n- Under.*\n\nSomeday \(1\)\n- Parked/);
    const area = formatPlace(await planner.places.place("home"), TODAY);
    expect(area).toMatch(/^Home \(area\) \[id .+\]\n\nProjects \(1\)\n- Acme — 2 open \[id .+\]\n\nTasks in the area itself \(1\)\n- Sweep/);
    expect(formatSomeday(await planner.places.someday(), TODAY)).toMatch(/^Someday \(1\)\n- Parked.*\n\nParked projects \(1\)\n- Sailing/);
    expect(formatTags(await planner.places.tags())).toBe('Tags (2)\n- @"deep work" — 1 open\n- @calls — 0 open');
  });

  it("makes, renames and deletes an area, whose contents stay", async () => {
    setup({ projects: [{ id: ACME, area_id: HOME, name: "Acme", state: "done", sort_key: "a0", deleted_at: null }], tasks: [task({ id: T1, area_id: HOME })] });
    expect((await planner.places.addArea("Health")).said).toMatch(/^Added the area “Health”/);
    expect(await refusal(planner.places.addArea("home"))).toMatch(/already an area/);
    expect((await planner.places.renameArea("home", "House")).said).toBe("Renamed the area “Home” to “House”");
    expect((await planner.places.removeArea("House")).said).toBe("Deleted the area “House”; its 1 project and 1 task stay, in no area");
    expect(on("projects")).toEqual([["PATCH", ACME, { area_id: null }]]);
    expect(on("tasks")).toEqual([["PATCH", T1, { area_id: null }]]);
  });

  it("files a task in an area or under a heading of its project", async () => {
    setup({ tasks: [task({ id: T1, title: "One", state: "inbox" })], headings: [{ id: "h1", project_id: ACME, title: "Copy", sort_key: "a0", deleted_at: null }] });
    expect((await planner.update("One", { area: "Home" })).said).toBe("Changed “One”: in Home");
    expect(on("tasks")[0][2]).toEqual({ area_id: HOME, project_id: null, heading_id: null, state: "active" });
    expect(await refusal(planner.update("One", { heading: "Copy" }))).toMatch(/this task is in none/);
    expect((await planner.update("One", { project: "Acme", heading: "copy", start: "mon", ifMissed: "expire" })).said).toBe("Changed “One”: in Acme, under Copy, starts Mon 26 Oct, if missed: expire");
    expect(on("tasks")[1][2]).toMatchObject({ project_id: ACME, area_id: null, heading_id: "h1", start_date: "2026-10-26", miss_policy: "expire" });
  });

  it("narrows a search by tag, project, area, priority, deadline, estimate and repeat", async () => {
    setup({
      tasks: [task({ id: T1, title: "One", project_id: ACME, priority: 3, deadline: "2026-10-25", estimate_min: 30 }), task({ title: "Two", area_id: HOME }), weekly({ id: "gym" })],
      tags: [{ id: "g1", name: "calls", deleted_at: null }],
      task_tags: [{ id: "l1", task_id: T1, tag_id: "g1", deleted_at: null }],
    });
    const titles = async (f: Parameters<Planner["search"]>[2], q = "") => (await planner.search(q, false, f)).tasks.map((t) => t.title);
    expect(await titles({ tag: "@Calls" })).toEqual(["One"]);
    expect(await titles({ project: "acme" })).toEqual(["One"]);
    expect(await titles({ area: "Home" })).toEqual(["Two"]);
    expect(await titles({ priority: 1 })).toEqual(["One"]);
    expect(await titles({ dueBy: "next week" })).toEqual(["One"]);
    expect((await titles({ noEstimate: true })).sort()).toEqual(["Gym", "Two"]);
    expect(await titles({ repeating: true })).toEqual(["Gym"]);
    expect(await titles({ noEstimate: true }, "tw")).toEqual(["Two"]);
    expect(await refusal(planner.search("  "))).toMatch(/something to filter by/);
  });
});

describe("steps and copies", () => {
  const steps = () => [
    { id: "c1", task_id: T1, title: "Outline", done: 0, sort_key: "a0", updated_at: "2026-10-22T10:00:00Z", deleted_at: null },
    { id: "c2", task_id: T1, title: "Draft the intro", done: 1, sort_key: "a1", updated_at: "2026-10-22T10:00:00Z", deleted_at: null },
  ];

  it("adds, ticks, unticks, renames and removes steps by their words", async () => {
    setup({ tasks: [task({ id: T1, title: "Post" })], checklist_items: steps() });
    const r = await planner.places.steps("Post", { check: ["outline"], uncheck: ["intro"], rename: [{ step: "Outline", to: "Plan" }], add: ["Publish"] });
    expect(r.said).toBe("Steps of “Post”: ticked “Outline”, unticked “Draft the intro”, renamed “Outline” to “Plan”, added “Publish”");
    expect(on("checklist_items").map(([op, id, d]) => [op, op === "PUT" ? d?.title : id])).toEqual([["PATCH", "c1"], ["PATCH", "c2"], ["PATCH", "c1"], ["PUT", "Publish"]]);
    expect(String(on("checklist_items")[3][2]?.sort_key) > "a1").toBe(true);
    expect((await planner.places.steps("Post", { remove: ["Plan"] })).said).toContain("removed “Plan”");
    expect(await refusal(planner.places.steps("Post", { check: ["Nope"] }))).toMatch(/No step matches “Nope”\. The steps are: /);
    expect(await refusal(planner.places.steps("Post", {}))).toMatch(/Nothing to change/);
  });

  it("duplicates a task with its steps unticked and its tags, a repeat as a series of its own", async () => {
    setup({ tasks: [weekly({ carry_count: 3 })], checklist_items: steps(), tags: [{ id: "g1", name: "calls", deleted_at: null }], task_tags: [{ id: "l1", task_id: T1, tag_id: "g1", deleted_at: null }] });
    const r = await planner.places.duplicateTask("Gym");
    const [, id, data] = on("tasks")[0];
    expect(r.id).toBe(id);
    expect(data).toMatchObject({ title: "Gym", do_date: "2026-10-26", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_series_id: id, source: "mcp" });
    expect(data).not.toHaveProperty("carry_count");
    expect(on("checklist_items").map((c) => c[2]?.done)).toEqual([false, false]);
    expect(on("task_tags")[0][2]).toMatchObject({ task_id: id, tag_id: "g1" });
  });

  it("duplicates a project with its headings and open tasks", async () => {
    setup({ headings: [{ id: "h1", project_id: ACME, title: "Copy", sort_key: "a0", deleted_at: null }], tasks: [task({ title: "Open", project_id: ACME, heading_id: "h1" }), task({ title: "Done", project_id: ACME, state: "done", completed_at: "2026-10-20T10:00:00Z" })] });
    const r = await planner.places.duplicateProject("Acme");
    expect(r.said).toMatch(/^Duplicated the project as “Acme \(copy\)” with 1 open task/);
    expect(on("tasks")).toHaveLength(1);
    expect(on("tasks")[0][2]).toMatchObject({ title: "Open", project_id: r.id, heading_id: on("headings")[0][1] });
  });

  it("makes a task a project: its steps become tasks, ticked ones done when they were ticked, and it is archived", async () => {
    setup({ tasks: [task({ id: T1, title: "Move house", notes_md: "By May", area_id: HOME, deadline: "2026-11-30" })], checklist_items: steps(), time_blocks: [block({ task_id: T1 })] });
    const r = await planner.places.toProject("Move house");
    expect(on("projects")[0][2]).toMatchObject({ name: "Move house", area_id: HOME, notes_md: "By May", deadline: "2026-11-30" });
    const tasks = on("tasks");
    expect(tasks.slice(0, 2).map((t) => [t[2]?.title, t[2]?.state, t[2]?.completed_at])).toEqual([["Outline", "active", null], ["Draft the intro", "done", "2026-10-22T10:00:00Z"]]);
    expect(tasks[2]).toEqual(["PATCH", T1, { state: "archived", archive_batch_id: expect.any(String), archived_from_state: "active", archived_at: "2026-10-23T09:00:00.000Z" }]);
    expect(r.blocksChanged).toBe(1);
  });
});

describe("planning settings and closing the day", () => {
  it("reads them in words", async () => {
    const text = formatSettings(await planner.account.settings());
    expect(text).toContain("  Monday: 09:00–18:00");
    expect(text).toContain("  Saturday: off");
    expect(text).toContain("Buffer: 15% of the working day");
    expect(text).toContain("Morning message: off");
    expect(text).toContain("Shutdown reminder: at the end of the working day");
  });

  it("changes only what is given, inside the app's own bounds", async () => {
    expect((await planner.account.update({ buffer_percent: 20, default_estimate_minutes: 45, morning_message: true, morning_message_at: "7:30", if_missed: "skip" })).said).toBe("Settings changed: buffer 20%, default estimate 45m, a new task that misses its day: skip, morning message on, morning message at 07:30");
    expect(on("user_settings")).toEqual([["PATCH", "set1", { buffer_pct: 20, default_estimate_min: 45, default_miss_policy: "skip", notify_morning: true, morning_nudge_time: "07:30" }]]);
    expect(await refusal(planner.account.update({ buffer_percent: 90 }))).toBe("The buffer, in per cent, is between 0 and 30.");
    expect(await refusal(planner.account.update({ remind_minutes_before: 7 }))).toMatch(/0, 5, 10 or 15/);
    expect(await refusal(planner.account.update({}))).toMatch(/Nothing to change/);
  });

  it("makes a weekday's hours exactly what was asked, reusing its rows", async () => {
    const r = await planner.account.update({ work_hours: [{ days: ["mon"], hours: ["09:00-12:30", "13:30 to 17:00"] }, { days: ["Friday"], hours: ["off"] }, { days: ["weekend"], hours: ["10:00–12:00"] }] });
    expect(r.said).toBe("Settings changed: Mon: 09:00–12:30, 13:30–17:00, Fri: off, Sat, Sun: 10:00–12:00");
    expect(on("work_hours").map(([op, id, d]) => [op, op === "PUT" ? d?.weekday : id])).toEqual([["PATCH", "w0"], ["PUT", 0], ["DELETE", "w4"], ["PUT", 5], ["PUT", 6]]);
    expect(await refusal(planner.account.update({ work_hours: [{ days: ["mon"], hours: ["18:00-09:00"] }] }))).toBe("The day has to end after it starts.");
    expect(await refusal(planner.account.update({ work_hours: [{ days: ["someday"], hours: [] }] }))).toMatch(/is not a day of the week/);
    expect(await refusal(planner.account.update({ work_hours: [{ days: ["weekdays"], hours: [] }, { days: ["tue"], hours: [] }] }))).toBe("Tuesday is given twice.");
  });

  it("closes the day on its own row", async () => {
    setup({ tasks: [task({ do_date: "2026-10-23" })] });
    expect((await planner.account.closeDay({ highlight: "Shipped it", rating: 4 })).said).toBe("Closed today (highlight “Shipped it”, rated 4 of 5). 1 open task is still on today or earlier.");
    expect(on("day_plans")[0]).toEqual(["PUT", expect.any(String), { space_id: "s1", user_id: "u1", date: "2026-10-23", shutdown_at: "2026-10-23T09:00:00.000Z", highlights: "Shipped it", day_rating: 4 }]);
    await planner.account.closeDay({});
    expect(on("day_plans")[1][0]).toBe("PATCH");
  });
});
