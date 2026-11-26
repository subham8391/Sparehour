// What the AI connection says about reminders and clashes (docs/product/REMINDERS_AND_AI_SPEC.md §2 and §3): quiet
// hours read and changed, the draft's notice, the check made again as a task is added, the same words from every
// tool that gives a task or a block a time, and five minutes for a quick thing.
// Friday 23 October 2026, 09:00 UTC; quiet hours 21:00–08:00; a block's reminder five minutes before it.
import { beforeEach, describe, expect, it } from "vitest";
import { Temporal } from "@/core/time";
import { formatAdded, formatDraft, formatSettings } from "./format";
import { Planner, Refusal } from "./planner";
import type { Row } from "./store";
import { FakeStore } from "./store.fake";

const NOW = Temporal.Instant.from("2026-10-23T09:00:00Z");
const GOT = "bbbbbbbb-0000-4000-8000-000000000001";
const T1 = "aaaaaaaa-0000-4000-8000-000000000001";
const B1 = "dddddddd-0000-4000-8000-000000000001";
const HELD_2125 = "No reminder: 21:25 is inside quiet hours (21:00–08:00).";
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const task = (over: Row): Row => ({ id: uuid(), space_id: "s1", project_id: null, heading_id: null, area_id: null, title: "A task", notes_md: null, state: "active", priority: 0, do_date: null, do_time: null, deadline: null, start_date: null, evening: 0, estimate_min: null, carry_count: 0, miss_policy: "carry", recurrence_rule: null, recurrence_mode: null, recurrence_series_id: null, recurrence_paused_until: null, sort_key: "a0", day_sort_key: null, completed_at: null, deleted_at: null, ...over });
const block = (over: Row): Row => ({ id: B1, space_id: "s1", task_id: null, title: "Focus", start_at: "2026-10-23T14:00:00+00:00", end_at: "2026-10-23T15:00:00+00:00", locked: 0, source: "manual", deleted_at: null, ...over });
/** "watching GOT", open, on the timeline tonight 21:00–23:00. */
const got = (state = "active"): Record<string, Row[]> => ({
  tasks: [task({ id: GOT, title: "watching GOT", state, do_date: "2026-10-23", do_time: "21:00", estimate_min: 120 })],
  time_blocks: [block({ id: "b-got", task_id: GOT, title: "watching GOT", start_at: "2026-10-23T21:00:00+00:00", end_at: "2026-10-23T23:00:00+00:00" })],
});

let store: FakeStore;
let planner: Planner;

function setup(tables: Record<string, Row[]> = {}, settings: Row = {}) {
  store = new FakeStore(
    { work_hours: [0, 1, 2, 3, 4].map((weekday) => ({ id: `w${weekday}`, weekday, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null })), user_settings: [{ id: "set1", deleted_at: null }], ...tables },
    {
      userId: "u1",
      spaceId: "s1",
      settings: { id: "set1", timezone: "UTC", day_rollover_hour: 4, buffer_pct: 15, default_estimate_min: 30, evening_starts_at: "18:00:00", evening_ends_at: "22:00:00", notify_block_start: 1, block_start_lead_min: 5, notify_deadline: 1, notify_morning: 0, notify_shutdown: 0, quiet_hours_start: "21:00:00", quiet_hours_end: "08:00:00", ...settings },
    },
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

describe("quiet hours in the settings", () => {
  it("are read out, with the lead of a block's reminder", async () => {
    const text = formatSettings(await planner.account.settings());
    expect(text).toContain("Reminders: before a block (5m), deadlines");
    expect(text).toContain("Quiet hours: 21:00–08:00 (no reminders are sent then)");
    setup({}, { quiet_hours_start: null, quiet_hours_end: null, block_start_lead_min: 0 });
    const none = formatSettings(await planner.account.settings());
    expect(none).toContain("Quiet hours: none");
    expect(none).toContain("Reminders: before a block (at its start), deadlines");
  });

  it("are changed as one pair, or turned off, and never half set", async () => {
    expect((await planner.account.update({ quiet_hours: "11pm - 7am" })).said).toBe("Settings changed: quiet hours 23:00–07:00");
    expect((await planner.account.update({ quiet_hours: "none" })).said).toBe("Settings changed: quiet hours off");
    expect((await planner.account.update({ quiet_hours: null })).said).toBe("Settings changed: quiet hours off");
    expect(on("user_settings")).toEqual([
      ["PATCH", "set1", { quiet_hours_start: "23:00", quiet_hours_end: "07:00" }],
      ["PATCH", "set1", { quiet_hours_start: null, quiet_hours_end: null }],
      ["PATCH", "set1", { quiet_hours_start: null, quiet_hours_end: null }],
    ]);
    expect(await refusal(planner.account.update({ quiet_hours: "23:00" }))).toMatch(/Couldn't read “23:00” as quiet hours/);
    expect(await refusal(planner.account.update({ quiet_hours: "22:00-22:00" }))).toMatch(/a start and an end that differ/);
  });
});

describe("draft_task", () => {
  it("says when the reminder would fall in quiet hours, and only then", async () => {
    const held = (await planner.drafts.draft([{ text: "Take zinc today 21:30" }])).lines[0].notices;
    expect(held).toContain("Its reminder (21:25) is inside quiet hours (21:00–08:00), so none will come. Offer another time, or changing quiet hours.");
    // 21:00 rings at 20:55, before quiet hours begin.
    expect((await planner.drafts.draft([{ text: "Watch a film today 21:00" }])).lines[0].notices.join(" ")).not.toMatch(/quiet hours/);
    expect((await planner.drafts.draft([{ text: "Lunch today 13:00" }])).lines[0].notices.join(" ")).not.toMatch(/quiet hours/);
    // No time, no block, no reminder to hold.
    expect((await planner.drafts.draft([{ text: "Take zinc today" }])).lines[0].notices.join(" ")).not.toMatch(/quiet hours/);
    setup({}, { notify_block_start: 0 });
    expect((await planner.drafts.draft([{ text: "Take zinc today 21:30" }])).lines[0].notices.join(" ")).not.toMatch(/quiet hours/);
    expect(store.ops).toHaveLength(0);
  });

  it("offers five minutes for a quick thing", async () => {
    const text = formatDraft(await planner.drafts.draft([{ text: "Take zinc" }]));
    expect(text).toContain("How long? 5m · 15m · 30m · 1h · 2h (with none it counts as 30m; for something that takes a moment, like a tablet or a short call, put 5m first)");
  });
});

describe("add_task checks again as it adds", () => {
  it("says what the chosen time overlaps and that no reminder will come, and still adds it", async () => {
    setup(got());
    const added = await planner.drafts.add({ title: "Take zinc", do: "today 21:30" });
    const text = formatAdded(added, Temporal.PlainDate.from("2026-10-23"));
    expect(text.split("\n").slice(0, 3)).toEqual(["Added “Take zinc” — Today 21:30 → Today · blocked 21:30–22:00", "Heads up: it overlaps watching GOT 21:00–23:00.", HELD_2125]);
    expect(on("tasks")).toHaveLength(1);
    expect(on("time_blocks")).toHaveLength(1);
  });

  it("a block of a finished task is nothing to clash with, and a clear time says nothing", async () => {
    setup(got("done"));
    expect((await planner.drafts.draft([{ text: "Read today 21:30" }])).lines[0].notices.join(" ")).not.toMatch(/overlaps/);
    expect((await planner.drafts.add({ title: "Take zinc", do: "today 21:30" })).notes).toBe(`\n${HELD_2125}`);
    expect((await planner.drafts.add({ title: "Lunch", do: "today 13:00" })).notes).toBe("");
    expect((await planner.drafts.add({ title: "No time", do: "today" })).notes).toBe("");
  });

  it("a five-minute task with a time takes five minutes on the timeline", async () => {
    const added = await planner.drafts.add({ title: "Take zinc", do: "today 13:00", estimate: "5m" });
    expect(added.blocked).toBe(" · blocked 13:00–13:05");
    expect(on("time_blocks")[0][2]).toMatchObject({ start_at: "2026-10-23T13:00:00Z", end_at: "2026-10-23T13:05:00Z" });
  });
});

describe("every tool that sets a time says the same", () => {
  it("update_task and reschedule_task", async () => {
    setup({ ...got(), tasks: [...got().tasks, task({ id: T1, title: "Take zinc", do_date: "2026-10-23" })] });
    expect((await planner.update("Take zinc", { time: "21:30" })).said).toBe(`Changed “Take zinc”: at 21:30 · blocked 21:30–22:00\nHeads up: it overlaps watching GOT 21:00–23:00.\n${HELD_2125}`);
    // Monday at seven in the morning: nothing to overlap, and still inside quiet hours.
    expect((await planner.reschedule("Take zinc", "mon 7am")).said).toMatch(/^Moved “Take zinc” to Mon 26 Oct[^\n]*\nNo reminder: 06:55 is inside quiet hours \(21:00–08:00\)\.$/);
    expect((await planner.reschedule("Take zinc", "mon 10am")).said).not.toMatch(/No reminder|Heads up/);
  });

  it("block_time and change_block", async () => {
    setup({ tasks: [task({ id: T1, title: "Take zinc", do_date: "2026-10-23" })], time_blocks: [block({})] });
    expect((await planner.blocks.add({ task: T1, start: "21:30", minutes: 5 })).said).toMatch(/^Blocked “Take zinc” on today 21:30–21:35 \[block .+\]\nNo reminder: 21:25 is inside quiet hours \(21:00–08:00\)\.$/);
    expect((await planner.blocks.change(B1, { start: "22:00" })).said).toBe("Block “Focus”: moved to today 22:00–23:00 (1h)\nNo reminder: 21:55 is inside quiet hours (21:00–08:00).");
    expect((await planner.blocks.change(B1, { start: "16:00" })).said).toBe("Block “Focus”: moved to today 16:00–17:00 (1h)");
  });

  it("with no quiet hours nothing is said about reminders", async () => {
    setup(got(), { quiet_hours_start: null, quiet_hours_end: null });
    expect((await planner.drafts.add({ title: "Take zinc", do: "today 21:30" })).notes).toBe("\nHeads up: it overlaps watching GOT 21:00–23:00.");
  });
});
