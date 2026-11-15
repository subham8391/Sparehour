// The MCP planner on an in-memory store (store.fake.ts): what each tool reads the way the app reads it, and the
// exact ops each write sends through apply_mutations — quick-add's filing and tags, a repeat's completion and its
// "just this once" move, blocks let go when a task leaves a day, lists and items — and the refusals, each with its
// reason. Friday 23 October 2026, 09:00 UTC, an account in UTC.
import { beforeEach, describe, expect, it } from "vitest";
import { exceptionId } from "@/core/recurrence/exception-id";
import { Temporal } from "@/core/time";
import type { WireOp } from "@/server/sync/upload";
import { formatPlan, formatSearch, formatToday, formatUpcoming } from "./format";
import { Planner, Refusal, estimateMinutes, lastKey } from "./planner";
import type { Row } from "./store";
import { FakeStore } from "./store.fake";

const NOW = Temporal.Instant.from("2026-10-23T09:00:00Z");
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const ACME = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENT_TAG = "bbbbbbbb-0000-4000-8000-000000000001";

function task(over: Row): Row {
  return {
    id: uuid(),
    space_id: "s1",
    project_id: null,
    heading_id: null,
    area_id: null,
    title: "A task",
    notes_md: null,
    state: "active",
    priority: 0,
    do_date: null,
    do_time: null,
    deadline: null,
    start_date: null,
    evening: 0,
    estimate_min: null,
    carry_count: 0,
    miss_policy: "carry",
    recurrence_rule: null,
    recurrence_mode: null,
    recurrence_series_id: null,
    recurrence_paused_until: null,
    sort_key: "a0",
    day_sort_key: null,
    completed_at: null,
    created_at: "2026-10-20T10:00:00Z",
    actual_min: null,
    routine_run_id: null,
    last_carried_at: null,
    last_touched_at: "2026-10-20T10:00:00Z",
    deleted_at: null,
    ...over,
  };
}

let store: FakeStore;
let planner: Planner;

function setup(tables: Record<string, Row[]> = {}, settings?: Row) {
  store = new FakeStore(
    {
      projects: [{ id: ACME, area_id: null, name: "Acme", state: "active", sort_key: "a0", deleted_at: null }],
      tags: [{ id: CLIENT_TAG, name: "client", deleted_at: null }],
      ...tables,
    },
    { userId: "u1", spaceId: "s1", settings },
  );
  planner = new Planner(store, { device: "mcp:client-1", now: () => NOW, newId: uuid });
}

const opsOn = (table: string) => store.ops.filter((o) => o.table === table);
const only = (ops: WireOp[]) => {
  expect(ops).toHaveLength(1);
  return ops[0];
};
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

describe("add_task reads quick-add as the app does", () => {
  it("files a dated, timed, estimated line in its project with its tag and priority, as the person, from MCP", async () => {
    const added = await planner.addTask("Draft proposal mon 3pm ~45m #Acme @client !2");
    const put = only(opsOn("tasks"));
    expect(put.op).toBe("PUT");
    expect(put.data).toMatchObject({
      space_id: "s1",
      title: "Draft proposal",
      state: "active",
      project_id: ACME,
      do_date: "2026-10-26",
      do_time: "15:00",
      estimate_min: 45,
      priority: 2,
      miss_policy: "carry",
      source: "mcp",
      evening: false,
    });
    // An existing tag is linked, never made again; the device names the connection.
    expect(opsOn("tags")).toHaveLength(0);
    expect(only(opsOn("task_tags")).data).toMatchObject({ task_id: put.id, tag_id: CLIENT_TAG, space_id: "s1" });
    expect(store.devices).toEqual(["mcp:client-1"]);
    expect(added.destination).toBe("Upcoming");
    expect(added.strip).toContain("Acme");
    expect(added.task.tagNames).toEqual(["client"]);
  });

  it("puts a line with no day and no project in the Inbox, and makes a new tag once whatever its case", async () => {
    const added = await planner.addTask("Buy seeds @Garden @garden");
    expect(only(opsOn("tasks")).data).toMatchObject({ state: "inbox", do_date: null, project_id: null });
    expect(only(opsOn("tags")).data).toMatchObject({ name: "Garden", space_id: "s1" });
    expect(added.destination).toBe("Inbox");
  });

  it("makes the project #+Name asks for, before the task that goes in it", async () => {
    const added = await planner.addTask("Order compost #+Garden");
    const [project, t] = store.ops;
    expect(project).toMatchObject({ op: "PUT", table: "projects", data: { name: "Garden", state: "active", space_id: "s1" } });
    expect(t.data).toMatchObject({ project_id: project.id, state: "active" });
    expect(added.strip).toContain("new project Garden");
  });

  it("keeps a #name that files nothing in the title, and says so", async () => {
    const added = await planner.addTask("Call Sam #Nowhere");
    expect(only(opsOn("tasks")).data).toMatchObject({ title: "Call Sam #Nowhere", project_id: null });
    expect(added.unfiled).toEqual({ name: "Nowhere", several: false });
  });

  it("places it after the day's last task by code unit, not by the database's collation", async () => {
    setup({ tasks: [task({ do_date: "2026-10-26", day_sort_key: "a0", sort_key: "a0" }), task({ do_date: "2026-10-26", day_sort_key: "Zz", sort_key: "Zz" })] });
    await planner.addTask("Third mon");
    const data = only(opsOn("tasks")).data as Record<string, string>;
    expect(data.day_sort_key > "a0").toBe(true);
    expect(data.sort_key > "a0").toBe(true);
  });

  it("starts a repeat on skip as the head of its own series, and a one-off on the person's default", async () => {
    await planner.addTask("Gym every monday");
    const repeat = only(opsOn("tasks"));
    expect(repeat.data).toMatchObject({ miss_policy: "skip", recurrence_series_id: repeat.id, recurrence_mode: "fixed" });
    setup({}, { timezone: "UTC", day_rollover_hour: 4, default_miss_policy: "expire", evening_starts_at: "18:00:00" });
    await planner.addTask("Tickets for the gig tomorrow");
    expect(only(opsOn("tasks")).data).toMatchObject({ miss_policy: "expire", do_date: "2026-10-24" });
  });

  it("adds the note it is given to the one the line carries", async () => {
    await planner.addTask("Read the brief // skim first", "Then the appendix");
    expect(only(opsOn("tasks")).data).toMatchObject({ title: "Read the brief", notes_md: "skim first\n\nThen the appendix" });
  });

  it("refuses an empty line, a line with nothing but tokens, and several lines", async () => {
    expect(await refusal(planner.addTask("   "))).toMatch(/empty/);
    expect(await refusal(planner.addTask("tomorrow ~30m"))).toMatch(/no title is left/);
    expect(await refusal(planner.addTask("One\nTwo"))).toMatch(/One task per call/);
    expect(store.ops).toHaveLength(0);
  });

  it("passes on a refusal from the database with the reason", async () => {
    store.refuse = () => "42501";
    expect(await refusal(planner.addTask("Anything"))).toMatch(/may not change that/);
  });
});

describe("the reads", () => {
  it("shows Today as the screen does: the day, this evening, Carried over, the calendar and the spare time", async () => {
    setup({
      tasks: [
        task({ title: "Write the report", do_date: "2026-10-23", do_time: "11:00:00", estimate_min: 60, day_sort_key: "a1" }),
        task({ title: "First thing", do_date: "2026-10-23", day_sort_key: "a0", project_id: ACME }),
        task({ title: "Call mum", do_date: "2026-10-23", evening: 1, day_sort_key: "a2" }),
        task({ title: "Missed Monday", do_date: "2026-10-19", carry_count: 3 }),
        task({ title: "Not started", do_date: "2026-10-23", start_date: "2026-10-30" }),
        task({ title: "Parked", state: "someday" }),
        task({ title: "Finished", do_date: "2026-10-23", state: "done", completed_at: "2026-10-23T08:00:00Z" }),
      ],
      work_hours: [{ id: "w1", weekday: 4, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null }],
      calendars: [
        { id: "c1", read: 1, private: 0, deleted_at: null },
        { id: "c2", read: 1, private: 1, deleted_at: null },
      ],
      calendar_events: [
        { id: "e1", calendar_id: "c1", summary: "Standup", start_at: "2026-10-23T10:00:00+00:00", end_at: "2026-10-23T10:30:00+00:00", all_day: 0, busy: 1, status: "confirmed", self_response: "accepted", event_type: "default", is_ours: 0, deleted_at: null },
        { id: "e2", calendar_id: "c2", summary: "Therapy", start_at: "2026-10-23T16:00:00+00:00", end_at: "2026-10-23T17:00:00+00:00", all_day: 0, busy: 1, status: "confirmed", self_response: "accepted", event_type: "default", is_ours: 0, deleted_at: null },
      ],
    });
    const v = await planner.todayView();
    expect(v.tasks.map((t) => t.title)).toEqual(["First thing", "Write the report"]);
    expect(v.evening.map((t) => t.title)).toEqual(["Call mum"]);
    expect(v.carried.map((t) => t.title)).toEqual(["Missed Monday"]);
    // 9h − 1h30 meetings − 1h20 buffer − 1h30 planned (60m + the default 30m; the evening is kept apart).
    expect(v.capacity?.spareMin).toBe(540 - 90 - 80 - 90);
    const text = formatToday(v);
    expect(text).toContain("Today, Friday 23 October · 09:00 in UTC");
    expect(text).toContain("Calendar: 10:00–10:30 Standup · 16:00–17:00 Busy");
    expect(text).toContain("- Write the report — 11:00 · 1h");
    expect(text).toContain("- First thing — #Acme");
    expect(text).toMatch(/Carried over \(1\)\n- Missed Monday — 19 Oct · carried 3×/);
    expect(text).not.toContain("overdue");
  });

  it("lists the inbox newest first and Upcoming by day, with the tasks that have no day yet", async () => {
    setup({
      tasks: [
        task({ title: "Older", state: "inbox", created_at: "2026-10-01T09:00:00Z" }),
        task({ title: "Newer", state: "inbox", created_at: "2026-10-22T09:00:00Z" }),
        task({ title: "Saturday", do_date: "2026-10-24" }),
        task({ title: "Monday", do_date: "2026-10-26" }),
        task({ title: "Next month", do_date: "2026-11-20" }),
        task({ title: "Some time", do_date: null }),
        task({ title: "Later start", do_date: null, start_date: "2026-11-01" }),
      ],
    });
    expect((await planner.inbox()).map((t) => t.title)).toEqual(["Newer", "Older"]);
    const up = await planner.upcoming(7);
    expect(up.days.map((d) => d.day.toString())).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(up.days.flatMap((d) => d.tasks.map((t) => t.title))).toEqual(["Saturday", "Monday"]);
    expect(up.unplanned.map((t) => t.title)).toEqual(["Some time"]);
    const text = formatUpcoming(up);
    expect(text).toContain("Sun 25 Oct · No working hours\n(nothing planned)");
    expect(text).toContain("Not yet planned (1, no day yet)");
  });

  it("finds tasks, projects and areas holding every word", async () => {
    setup({
      tasks: [task({ title: "Draft the Acme proposal" }), task({ title: "Proposal for Bea" }), task({ title: "Old Acme proposal", state: "done", completed_at: "2026-10-20T08:00:00Z" })],
      projects: [{ id: "p1", space_id: "s1", area_id: "a1", name: "Acme launch", state: "active", sort_key: "a0", deleted_at: null }],
      areas: [{ id: "a1", space_id: "s1", name: "Acme", sort_key: "a0", deleted_at: null }],
    });
    const found = await planner.search("acme proposal");
    expect(found.tasks.map((t) => t.title)).toEqual(["Draft the Acme proposal"]);
    expect((await planner.search("acme proposal", true)).tasks.map((t) => t.title)).toEqual(["Draft the Acme proposal", "Old Acme proposal"]);
    const acme = await planner.search("acme");
    expect(acme.projects).toEqual([{ id: "p1", name: "Acme launch", area: "Acme" }]);
    expect(acme.areas).toEqual([{ id: "a1", name: "Acme" }]);
    expect(acme).not.toHaveProperty("lists");
    expect(await refusal(planner.search("  "))).toMatch(/at least one word/);
  });

  it("asked for finished ones too, lists what was finished before the week the Logbook holds (amendment 2026-11-14)", async () => {
    setup({
      tasks: [task({ title: "Pay the rent", do_date: "2026-10-23" })],
      projects: [{ id: "p1", space_id: "s1", area_id: null, name: "Home", state: "active", sort_key: "a0", deleted_at: null }],
      finished_tasks: [
        { id: "f1", space_id: "s1", title: "Pay the rent", notes_md: null, project_id: "p1", completed_at: "2026-09-01T16:00:00+00:00", occurrence_of: null, deleted_at: null },
        { id: "f2", space_id: "s1", title: "Rent the van", notes_md: "pay on collection", project_id: null, completed_at: "2025-12-31T23:30:00+00:00", occurrence_of: "t-van", deleted_at: null },
        { id: "f3", space_id: "s1", title: "Something else", notes_md: null, project_id: null, completed_at: "2026-09-02T10:00:00+00:00", occurrence_of: null, deleted_at: null },
      ],
    });
    // Left out unless finished ones are asked for.
    expect((await planner.search("pay rent")).older).toEqual([]);
    const found = await planner.search("pay rent", true);
    expect(found.older.map((o) => ({ ...o, finished: o.finished.toString() }))).toEqual([
      { id: "f1", title: "Pay the rent", finished: "2026-09-01", project: "Home", occurrence: false },
      { id: "f2", title: "Rent the van", finished: "2025-12-31", project: null, occurrence: true },
    ]);
    const text = formatSearch(found, "pay rent", Temporal.PlainDate.from("2026-10-23"));
    expect(text).toContain("Finished earlier (2)\n- Pay the rent — finished Tue 1 Sep 2026 · #Home\n- Rent the van — finished Wed 31 Dec 2025 · one day of a repeat");
  });
});

describe("completing, moving and dropping", () => {
  it("completes a one-off task", async () => {
    setup({ tasks: [task({ id: "t1", title: "Send invoice" })] });
    expect((await planner.complete("Send invoice")).said).toBe("Completed “Send invoice”");
    expect(only(store.ops)).toMatchObject({ op: "PATCH", table: "tasks", id: "t1", data: { state: "done", completed_at: "2026-10-23T09:00:00.000Z" } });
    expect(await refusal(planner.complete("Send invoice"))).toBe("“Send invoice” is already done.");
  });

  it("records how long it took when the person said, on the task or on a repeat's finished day", async () => {
    setup({
      tasks: [
        task({ id: "t1", title: "Send invoice", estimate_min: 30 }),
        task({ id: "r1", title: "Weekly review", do_date: "2026-10-19", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", recurrence_series_id: "r1", miss_policy: "skip" }),
        task({ id: "t2", title: "Call Sam" }),
      ],
    });
    expect((await planner.complete("Send invoice", 50)).said).toBe("Completed “Send invoice” · took 50m");
    expect(only(store.ops)).toMatchObject({ op: "PATCH", table: "tasks", id: "t1", data: { state: "done", actual_min: 50 } });
    const repeat = await planner.complete("Weekly review", 75);
    expect(repeat.said).toMatch(/^Completed “Weekly review” · it repeats, next on .+ · took 1h 15m$/);
    expect(only(opsOn("task_completions")).data).toMatchObject({ task_id: "r1", actual_min: 75 });
    // The rolling task itself carries no length: the next day of it is its own.
    expect(opsOn("tasks").find((o) => o.id === "r1")?.data).not.toHaveProperty("actual_min");
    // Nothing said, nothing written.
    expect((await planner.complete("Call Sam", 0)).said).toBe("Completed “Call Sam”");
    expect(opsOn("tasks").find((o) => o.id === "t2")?.data).not.toHaveProperty("actual_min");
  });

  it("rolls a repeat on to its next day with its deadline at the same offset, and unticks its steps", async () => {
    setup({
      tasks: [task({ id: "r1", title: "Weekly review", do_date: "2026-10-19", deadline: "2026-10-20", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", recurrence_series_id: "r1", miss_policy: "skip" })],
      checklist_items: [
        { id: "s1", task_id: "r1", title: "Inbox zero", done: 1, sort_key: "a0", deleted_at: null },
        { id: "s2", task_id: "r1", title: "Plan", done: 0, sort_key: "a1", deleted_at: null },
      ],
    });
    const r = await planner.complete("Weekly review");
    const completion = only(opsOn("task_completions"));
    expect(completion.data).toMatchObject({ task_id: "r1", occurrence_date: "2026-10-19" });
    const rolled = only(opsOn("tasks")).data as Record<string, string>;
    expect(rolled.state).toBe("active");
    expect(Temporal.PlainDate.from(rolled.do_date).dayOfWeek).toBe(1);
    expect(rolled.do_date > "2026-10-19").toBe(true);
    expect(Temporal.PlainDate.from(rolled.deadline).since(Temporal.PlainDate.from(rolled.do_date)).days).toBe(1);
    expect(only(opsOn("checklist_items"))).toMatchObject({ id: "s1", data: { done: false } });
    expect(r.said).toMatch(/^Completed “Weekly review” · it repeats, next on /);
  });

  it("refuses to complete what is done or dropped, with what to do instead", async () => {
    setup({ tasks: [task({ id: "11111111-0000-4000-8000-000000000001", title: "Done one", state: "done", completed_at: "2026-10-22T08:00:00Z" }), task({ title: "Gone", state: "dropped" })] });
    expect(await refusal(planner.complete("11111111-0000-4000-8000-000000000001"))).toBe("“Done one” is already done.");
    expect(await refusal(planner.complete("Gone"))).toMatch(/reopen_task/);
  });

  it("moves a task to a day and time, brings it out of the Inbox, and lets go of the blocks it held elsewhere", async () => {
    setup({
      tasks: [task({ id: "t1", title: "Draft", state: "inbox" })],
      time_blocks: [
        { id: "b-later", task_id: "t1", start_at: "2026-10-23T14:00:00+00:00", end_at: "2026-10-23T15:00:00+00:00", locked: 0, deleted_at: null },
        { id: "b-locked", task_id: "t1", start_at: "2026-10-23T16:00:00+00:00", end_at: "2026-10-23T17:00:00+00:00", locked: 1, deleted_at: null },
        { id: "b-started", task_id: "t1", start_at: "2026-10-23T08:30:00+00:00", end_at: "2026-10-23T09:30:00+00:00", locked: 0, deleted_at: null },
        { id: "b-monday", task_id: "t1", start_at: "2026-10-26T09:00:00+00:00", end_at: "2026-10-26T10:00:00+00:00", locked: 0, deleted_at: null },
      ],
    });
    const r = await planner.reschedule("Draft", "mon 9am");
    expect(only(opsOn("tasks")).data).toEqual({ do_date: "2026-10-26", do_time: "09:00", evening: false, state: "active" });
    expect(opsOn("time_blocks").map((o) => [o.op, o.id])).toEqual([["DELETE", "b-later"]]);
    expect(r).toMatchObject({ said: "Moved “Draft” to Mon 26 Oct 09:00", blocksReleased: 1 });
  });

  it("reads ISO dates, parks in Someday, takes the day off, and says what it could not read", async () => {
    setup({ tasks: [task({ id: "t1", title: "Plan trip", do_date: "2026-10-23", do_time: "10:00:00" })] });
    await planner.reschedule("Plan trip", "2026-11-02");
    expect(opsOn("tasks")[0].data).toEqual({ do_date: "2026-11-02" });
    expect((await planner.reschedule("Plan trip", "someday")).said).toBe("Moved “Plan trip” to Someday");
    expect(opsOn("tasks")[1].data).toEqual({ state: "someday", do_date: null, do_time: null });
    expect(await refusal(planner.reschedule("Plan trip", "blursday"))).toMatch(/Couldn't read “blursday” as a day/);
  });

  it("moves a repeat just this once: a move exception under its stable id, the rule untouched", async () => {
    setup({ tasks: [task({ id: "r1", title: "Gym", do_date: "2026-10-26", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", recurrence_series_id: "r1" })] });
    const r = await planner.reschedule("Gym", "tue");
    const ex = only(opsOn("recurrence_exceptions"));
    expect(ex).toMatchObject({ op: "PUT", id: exceptionId("r1", "2026-10-26"), data: { series_id: "r1", occurrence_date: "2026-10-26", kind: "move", moved_to: "2026-10-27", deleted_at: null } });
    expect(only(opsOn("tasks")).data).toEqual({ do_date: "2026-10-27" });
    expect(r.said).toBe("Moved “Gym” to Tue 27 Oct, just this once (it still repeats every Monday)");
    expect(await refusal(planner.reschedule("Gym", "someday"))).toMatch(/repeats, so it always has a next day/);
  });

  it("drops a task and lets go of its blocks; reopen brings back a dropped task and un-completes a done one", async () => {
    setup({
      tasks: [task({ id: "t1", title: "Old idea", do_date: "2026-10-24" }), task({ id: "t2", title: "Loose end", state: "done", completed_at: "2026-10-22T08:00:00Z" })],
      time_blocks: [{ id: "b1", task_id: "t1", start_at: "2026-10-24T09:00:00+00:00", end_at: "2026-10-24T10:00:00+00:00", locked: 0, deleted_at: null }],
    });
    expect((await planner.drop("Old idea")).blocksReleased).toBe(1);
    expect(store.ops.map((o) => [o.op, o.table, o.data?.state])).toEqual([
      ["PATCH", "tasks", "dropped"],
      ["DELETE", "time_blocks", undefined],
    ]);
    expect((await planner.reopen("Old idea")).said).toBe("Brought back “Old idea”");
    expect((await planner.reopen("Loose end")).said).toBe("Reopened “Loose end”");
    // Nothing files or dates it, so it goes back to the Inbox (PRODUCT_SPEC.md §7 rule 2).
    expect(store.ops.at(-1)?.data).toEqual({ state: "inbox", completed_at: null });
  });

  it("asks which task when a title is not enough, and never matches a title by its note", async () => {
    setup({
      tasks: [task({ id: "t1", title: "Call Sam" }), task({ id: "t2", title: "Call Sam", do_date: "2026-10-26" }), task({ id: "t3", title: "Errands", notes_md: "call sam about the van" })],
    });
    const why = await refusal(planner.complete("Call Sam"));
    expect(why).toMatch(/^2 tasks match “Call Sam”: .*id t1.*id t2.*Say which by its id\.$/);
    expect(await refusal(planner.complete("about the van"))).toMatch(/^No task matches “about the van”/);
  });
});

describe("editing a task", () => {
  it("writes only the fields given, in the app's own encodings", async () => {
    setup({ tasks: [task({ id: "t1", title: "Brief", state: "inbox" })], projects: [{ id: ACME, name: "Acme website", state: "active", sort_key: "a0", deleted_at: null }] });
    const r = await planner.update("Brief", { priority: 1, estimate: "1h30", deadline: "fri", project: "acme", addTags: ["client", "new-one"] });
    // "fri" on a Friday is next Friday, as quick-add reads it.
    expect(opsOn("tasks")[0].data).toEqual({ deadline: "2026-10-30", estimate_min: 90, priority: 3, project_id: ACME, area_id: null, heading_id: null, state: "active" });
    expect(opsOn("tags").map((o) => o.data?.name)).toEqual(["new-one"]);
    expect(opsOn("task_tags")).toHaveLength(2);
    expect(r.said).toBe("Changed “Brief”: due Fri 30 Oct, estimate 90m, priority 1, in Acme website, tagged @client @new-one");
  });

  it("takes a tag off by its link, clears a deadline, and refuses what it cannot read", async () => {
    setup({ tasks: [task({ id: "t1", title: "Brief", deadline: "2026-10-30" })], task_tags: [{ id: "link-1", task_id: "t1", tag_id: CLIENT_TAG, deleted_at: null }] });
    await planner.update("Brief", { removeTags: ["@client"], deadline: "none" });
    expect(store.ops.map((o) => [o.op, o.table, o.id])).toEqual([
      ["PATCH", "tasks", "t1"],
      ["DELETE", "task_tags", "link-1"],
    ]);
    expect(await refusal(planner.update("Brief", {}))).toMatch(/Nothing to change/);
    expect(await refusal(planner.update("Brief", { estimate: "a while" }))).toMatch(/Couldn't read “a while” as an estimate/);
    expect(await refusal(planner.update("Brief", { priority: 7 }))).toMatch(/Priority is 1/);
    expect(await refusal(planner.update("Brief", { project: "Nope" }))).toMatch(/No project is called “Nope”/);
  });

  it("reads the last key by code unit, as SQLite does, whatever the database's collation would say", () => {
    expect(lastKey(["Zz", "a0", null, "B1"])).toBe("a0");
    expect(lastKey([])).toBeNull();
  });

  it("reads estimates as the app's tokens do", () => {
    expect([45, "45m", "45", "1h", "1h30", "1.5h", null, "none", "two", 0, 2000].map(estimateMinutes)).toEqual([45, 45, 45, 60, 90, 90, null, null, undefined, undefined, undefined]);
  });
});

describe("Plan my day is the app's own scheduler, shown first and written only when asked (amendment 2026-11-14)", () => {
  // Friday 23 October, 09:00: work 09:00–18:00 with a stand-up at 10:00.
  const day = (over: Record<string, Row[]> = {}) => ({
    tasks: [
      task({ id: "t-report", title: "Write the report", do_date: "2026-10-23", do_time: "11:00:00", estimate_min: 60, day_sort_key: "a1" }),
      task({ id: "t-first", title: "First thing", do_date: "2026-10-23", day_sort_key: "a0" }),
      task({ id: "t-due", title: "Send the invoice", do_date: "2026-10-23", deadline: "2026-10-23", estimate_min: 45, day_sort_key: "a2" }),
      task({ id: "t-carried", title: "Missed Monday", do_date: "2026-10-19", carry_count: 3, estimate_min: 30 }),
      task({ id: "t-evening", title: "Call mum", do_date: "2026-10-23", evening: 1, estimate_min: 20, day_sort_key: "a3" }),
      task({ id: "t-later", title: "Not started", do_date: "2026-10-23", start_date: "2026-10-30" }),
    ],
    work_hours: [{ id: "w1", weekday: 4, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null }],
    calendars: [{ id: "c1", read: 1, private: 0, deleted_at: null }],
    calendar_events: [
      { id: "e1", calendar_id: "c1", summary: "Standup", start_at: "2026-10-23T10:00:00+00:00", end_at: "2026-10-23T10:30:00+00:00", all_day: 0, busy: 1, status: "confirmed", self_response: "accepted", event_type: "default", is_ours: 0, deleted_at: null },
    ],
    ...over,
  });
  const placed = (v: Awaited<ReturnType<Planner["planDay"]>>) => v.proposal.blocks.map((b) => [b.title, b.start, b.end]);
  const overlaps = (a: number[], b: number[]) => a[0] < b[1] && b[0] < a[1];

  it("plan_day proposes a block for every open task that fits, around the meeting, and writes nothing", async () => {
    setup(day());
    const v = await planner.planDay();
    expect(store.ops).toHaveLength(0);
    expect(v.considered).toBe(5);
    const blocks = placed(v);
    // A do-time is a promise: the report sits at 11:00 for its hour.
    expect(blocks).toContainEqual(["Write the report", 11 * 60, 12 * 60]);
    expect(blocks.map((b) => b[0]).sort()).toEqual(["First thing", "Missed Monday", "Send the invoice", "Write the report"]);
    // Nothing before now, in the stand-up, or on top of another block; the evening task has no evening time in a day that ends at 18:00.
    for (const [, start, end] of blocks) {
      expect(start).toBeGreaterThanOrEqual(9 * 60);
      expect(end).toBeLessThanOrEqual(18 * 60);
      expect(overlaps([start as number, end as number], [10 * 60, 10 * 60 + 30])).toBe(false);
    }
    for (const [i, a] of blocks.entries()) for (const b of blocks.slice(i + 1)) expect(overlaps([a[1] as number, a[2] as number], [b[1] as number, b[2] as number])).toBe(false);
    expect(v.proposal.unplaced.map((u) => [u.title, u.reason.kind])).toEqual([["Call mum", "no_evening_time"]]);

    const text = formatPlan(v);
    expect(text).toContain("Plan for today, Friday 23 October · from 09:00 in UTC");
    expect(text).toContain("Blocks (4)");
    expect(text).toContain("- 11:00–12:00 Write the report — You set it for 11:00. [task t-report]");
    expect(text).toMatch(/- \d\d:\d\d–\d\d:\d\d Send the invoice — Due today, so it gets time before the day ends\. \[task t-due\]/);
    expect(text).toMatch(/Didn't fit \(1\)\n- Call mum \(20m\) — Your working hours end before 18:00/);
    expect(text).toContain("Nothing has changed yet.");
    expect(text).not.toContain("overdue");
  });

  it("apply_day_plan writes those blocks as the plan's own, as the person, and a second run replaces them", async () => {
    setup(day());
    const before = await planner.planDay();
    const v = await planner.applyPlan();
    expect(v.applied).toEqual({ placed: 4, replaced: 0 });
    expect(store.devices).toEqual(["mcp:client-1"]);
    const puts = opsOn("time_blocks");
    expect(puts.map((o) => o.op)).toEqual(["PUT", "PUT", "PUT", "PUT"]);
    expect(puts.map((o) => [o.data?.title, o.data?.start_at, o.data?.end_at]).sort()).toEqual(
      placed(before)
        .map(([title, start, end]) => [title, new Date(Date.UTC(2026, 9, 23, 0, start as number)).toISOString().replace(".000Z", "Z"), new Date(Date.UTC(2026, 9, 23, 0, end as number)).toISOString().replace(".000Z", "Z")])
        .sort(),
    );
    const report = puts.find((o) => o.data?.task_id === "t-report");
    expect(report?.data).toMatchObject({ space_id: "s1", user_id: "u1", task_id: "t-report", title: "Write the report", start_at: "2026-10-23T11:00:00Z", end_at: "2026-10-23T12:00:00Z", locked: false, source: "plan" });
    // The calendar's side of a block is the server's: nothing of it is sent.
    expect(Object.keys(report?.data ?? {})).not.toContain("push_state");
    expect(formatPlan(v)).toContain("On the timeline now (4)");
    expect(formatPlan(v)).not.toContain("Nothing has changed yet.");

    // Planned again, the plan's own unlocked blocks are its to replace, and the day comes out the same.
    const again = await planner.applyPlan();
    expect(again.applied).toEqual({ placed: 4, replaced: 4 });
    const second = store.ops.slice(4).filter((o) => o.table === "time_blocks");
    expect(second.filter((o) => o.op === "DELETE").map((o) => o.id).sort()).toEqual(puts.map((o) => o.id).sort());
    expect(second.filter((o) => o.op === "PUT")).toHaveLength(4);
    expect(formatPlan(again)).toContain("Replaced 4 earlier plan blocks.");
    expect(placed(again)).toEqual(placed(before));
  });

  it("a locked block, a block made by hand and a meeting all stay where they are", async () => {
    setup(
      day({
        time_blocks: [
          { id: "b-locked", task_id: "t-first", title: "First thing", start_at: "2026-10-23T09:00:00+00:00", end_at: "2026-10-23T09:30:00+00:00", locked: 1, source: "plan", deleted_at: null },
          { id: "b-hand", task_id: null, title: "Deep work", start_at: "2026-10-23T13:00:00+00:00", end_at: "2026-10-23T15:00:00+00:00", locked: 0, source: "manual", deleted_at: null },
        ],
      }),
    );
    const v = await planner.applyPlan();
    expect(v.proposal.kept).toEqual(["t-first"]);
    expect(v.proposal.replaces).toEqual([]);
    expect(opsOn("time_blocks").every((o) => o.op === "PUT")).toBe(true);
    for (const [title, start, end] of placed(v)) {
      expect(title).not.toBe("First thing");
      expect(overlaps([start as number, end as number], [9 * 60, 9 * 60 + 30])).toBe(false);
      expect(overlaps([start as number, end as number], [13 * 60, 15 * 60])).toBe(false);
    }
    expect(formatPlan(v)).toContain("1 task keeps the block it already has.");
  });

  it("a day off, or a day with nothing open, has nothing to plan and writes nothing", async () => {
    setup(day({ work_hours: [] }));
    expect(formatPlan(await planner.applyPlan())).toContain("No working hours today, so there is nothing to plan.");
    setup({ work_hours: [{ id: "w1", weekday: 4, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null }] });
    const none = await planner.applyPlan();
    expect(none.applied).toBeUndefined();
    expect(formatPlan(none)).toContain("Nothing to plan: today has no open tasks.");
    expect(store.ops).toHaveLength(0);
  });

  it("a connection that may not write is refused by the database, in words", async () => {
    setup(day());
    store.refuse = () => "42501";
    expect(await refusal(planner.applyPlan())).toContain("Sparehour refused to plan the day: this connection may not change that");
  });
});
