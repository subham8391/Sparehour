// The tools over the wire: the SDK's own handler serving the server buildServer makes, on the in-memory store, so
// these are the requests Claude sends (a 2025-era client, stateless) and the answers it reads — the tool list with
// its annotations and schemas, text answers, a refusal as an error result with its reason, a read-only connection
// refusing every write before it reaches the store, and the follow-ups a write asks for.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Temporal } from "@/core/time";
import { Planner } from "./planner";
import { FakeStore } from "./store.fake";
import { SERVER_INSTRUCTIONS, buildServer, type Access, type Effects } from "./tools";

const NOW = Temporal.Instant.from("2026-10-23T09:00:00Z");

let store: FakeStore;
let effects: Effects & { calendarChanged: Mock<() => void> };

function handlerFor(access: Access) {
  return createMcpHandler(() => buildServer(new Planner(store, { device: "mcp:c1", now: () => NOW }), access, effects));
}

async function rpc(access: Access, method: string, params: Record<string, unknown> = {}) {
  const res = await handlerFor(access).fetch(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
    }),
  );
  const text = await res.text();
  const body = (res.headers.get("content-type") ?? "").includes("text/event-stream") ? (text.split("\n").find((l) => l.startsWith("data: ")) ?? "data: null").slice(6) : text;
  return { status: res.status, json: JSON.parse(body) };
}

/** The draft code the server gives a task, as an assistant reads it. */
async function codeOf(task: Record<string, unknown>): Promise<string> {
  return /Draft code: ([0-9a-f]{6})/.exec((await call("write", "draft_task", { tasks: [task] })).text)?.[1] ?? "none";
}
const drafted = async (task: Record<string, unknown>) => ({ ...task, draft: await codeOf(task) });

async function call(access: Access, name: string, args: Record<string, unknown> = {}) {
  const r = await rpc(access, "tools/call", { name, arguments: args });
  expect(r.status).toBe(200);
  return { text: r.json.result.content[0].text as string, isError: Boolean(r.json.result.isError) };
}

beforeEach(() => {
  store = new FakeStore(
    { time_blocks: [] },
    { userId: "u1", spaceId: "s1" },
  );
  effects = { calendarChanged: vi.fn<() => void>() };
});

describe("the Sparehour MCP server", () => {
  it("introduces itself with its instructions and lists its reads and writes, annotated, and no list tools", async () => {
    const init = await rpc("write", "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(init.json.result.serverInfo).toMatchObject({ name: "sparehour", title: "Sparehour" });
    expect(init.json.result.instructions).toBe(SERVER_INSTRUCTIONS);
    const { tools } = (await rpc("write", "tools/list")).json.result as { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean }; inputSchema: { properties?: Record<string, unknown> } }[] };
    const reads = tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    const writes = tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
    expect(reads).toEqual(["get_today", "get_inbox", "get_upcoming", "get_task", "search", "get_day", "get_someday", "get_logbook", "get_project", "list_tags", "get_settings", "draft_task", "list_projects", "plan_day"]);
    expect(writes).toEqual([
      "apply_day_plan", "add_task", "complete_task", "reopen_task", "reschedule_task", "update_task", "edit_steps", "change_repeat", "duplicate_task", "make_task_a_project", "drop_task",
      "block_time", "change_block", "remove_block", "add_project", "update_project", "duplicate_project", "add_area", "rename_area", "delete_area", "update_settings", "close_day",
    ]);
    expect(writes.filter((n) => tools.find((t) => t.name === n)?.annotations.destructiveHint)).toEqual(["drop_task", "delete_area"]);
    // The instructions tell any assistant to ask before it adds.
    expect(init.json.result.instructions).toMatch(/always call draft_task first[\s\S]*confirmed: true[\s\S]*Never fill in a project/);
    expect(init.json.result.instructions).not.toMatch(/\blists\b/i);
    expect(tools.find((t) => t.name === "drop_task")?.annotations.destructiveHint).toBe(true);
    expect(Object.keys(tools.find((t) => t.name === "add_task")?.inputSchema.properties ?? {})).toEqual(["tasks", "confirmed"]);
  });

  it("answers in short text with ids, and refuses with the reason as an error result", async () => {
    const added = await call("write", "add_task", { tasks: [await drafted({ text: "Pick up the parcel tomorrow 5pm ~15m" })], confirmed: true });
    expect(added.isError).toBe(false);
    expect(added.text).toMatch(/^Added “Pick up the parcel” — Tomorrow 17:00 · 15m → Upcoming · blocked 17:00–17:15\n- Pick up the parcel — Tomorrow 17:00 · 15m \[id [0-9a-f-]{36}\]$/);
    expect(effects.calendarChanged).toHaveBeenCalledTimes(1);
    const inbox = await call("write", "get_inbox");
    expect(inbox.text).toBe("The inbox is empty.");
    const missing = await call("write", "complete_task", { task: "Nothing called this" });
    expect(missing).toEqual({ isError: true, text: "No task matches “Nothing called this”. Search with search, or give its id." });
  });

  it("checks its inputs before anything runs", async () => {
    const r = await rpc("write", "tools/call", { name: "get_upcoming", arguments: { days: 90 } });
    const failed = r.json.error ?? (r.json.result?.isError ? r.json.result : null);
    expect(failed).toBeTruthy();
    expect(store.ops).toHaveLength(0);
  });

  it("on a read-only connection refuses every write before the store, and still reads", async () => {
    for (const [name, args] of [
      ["add_task", { tasks: [{ text: "Anything" }], confirmed: true }],
      ["add_task", { tasks: [{ text: "Anything" }] }],
      ["edit_steps", { task: "x", add: ["y"] }],
      ["change_repeat", { task: "x", action: "stop" }],
      ["duplicate_task", { task: "x" }],
      ["make_task_a_project", { task: "x" }],
      ["block_time", { title: "x" }],
      ["change_block", { block: "x", locked: true }],
      ["remove_block", { block: "x" }],
      ["add_project", { name: "x" }],
      ["update_project", { project: "x", state: "done" }],
      ["duplicate_project", { project: "x" }],
      ["add_area", { name: "x" }],
      ["rename_area", { area: "x", name: "y" }],
      ["delete_area", { area: "x" }],
      ["update_settings", { buffer_percent: 10 }],
      ["close_day", {}],
      ["complete_task", { task: "x" }],
      ["reschedule_task", { task: "x", when: "tomorrow" }],
      ["update_task", { task: "x", title: "y" }],
      ["drop_task", { task: "x" }],
      ["apply_day_plan", {}],
    ] as const) {
      const r = await call("read", name, args);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/^This connection is read only, so Sparehour changed nothing\. .*Settings › Connected apps/);
    }
    expect(store.ops).toHaveLength(0);
    expect((await call("read", "get_inbox")).text).toBe("The inbox is empty.");
  });

  it("adds nothing until the person has answered: add_task without confirmed answers with the draft", async () => {
    const asked = await call("write", "add_task", { tasks: [{ text: "Pay the rent" }] });
    expect(asked.isError).toBe(false);
    expect(asked.text).toMatch(/^Nothing has been added: ask the person first, then call add_task again with confirmed: true\./);
    expect(asked.text).toContain("Not set: day, how long, project, deadline, priority, tags");
    expect(store.ops).toHaveLength(0);
    // The draft itself is a read: a read-only connection may look.
    expect((await call("read", "draft_task", { tasks: [{ text: "Pay the rent" }] })).text).toMatch(/^Not added yet\./);
    expect(store.ops).toHaveLength(0);
  });

  it("adds no task that was not drafted, whatever the assistant says it was told", async () => {
    const code = await codeOf({ text: "Pay the rent" });
    const r = await call("write", "add_task", { tasks: [{ text: "Pay the rent tomorrow", estimate: 10, draft: code }, { text: "Water the garden every sunday morning" }, { text: "Something else", draft: code }], confirmed: true });
    expect(r.text).toContain("Added “Pay the rent”");
    expect(r.text).toContain("These were not added: they have not been drafted yet, so the person has not been asked. Ask them now.");
    expect(r.text).toContain("“morning” is not a time, so it stays in the title. Ask what time, if they meant one.");
    expect(store.ops.filter((o) => o.table === "tasks").map((o) => o.data?.title)).toEqual(["Pay the rent"]);
    const vague = await call("read", "draft_task", { tasks: [{ text: "Water the garden", do: "sunday morning" }] });
    expect(vague.text).toContain("“morning” is not a time. Ask the person what time, or give the day alone.");
  });

  it("adds several at once, and says which could not be added without losing the rest", async () => {
    const r = await call("write", "add_task", { tasks: [await drafted({ text: "One" }), { text: "Two", project: "Nowhere", draft: "abc123" }, await drafted({ title: "Three" })], confirmed: true });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("Added “One”");
    expect(r.text).toMatch(/Not added “Two”: No project is called “Nowhere”/);
    expect(r.text).toContain("Added “Three”");
    expect(store.ops.filter((o) => o.table === "tasks")).toHaveLength(2);
  });

  it("does the same to several tasks in one call, and refuses only when none could be changed", async () => {
    for (const t of ["A", "B"]) store.tables.tasks.push({ id: t, space_id: "s1", title: `Task ${t}`, state: "active", priority: 0, evening: 0, carry_count: 0, sort_key: "a0", deleted_at: null });
    const r = await call("write", "complete_task", { task: ["Task A", "Task B", "Task C"] });
    expect(r).toMatchObject({ isError: false, text: "Completed “Task A”\nCompleted “Task B”\nNot changed: No task matches “Task C”. Search with search, or give its id." });
    expect((await call("write", "drop_task", { task: ["Nope", "Nor this"] })).isError).toBe(true);
  });

  it("offers ready-made requests", async () => {
    const { prompts } = (await rpc("read", "prompts/list")).json.result as { prompts: { name: string }[] };
    expect(prompts.map((p) => p.name)).toEqual(["add_task", "brain_dump", "plan_my_day", "close_my_day", "weekly_review"]);
    const got = (await rpc("read", "prompts/get", { name: "add_task", arguments: { task: "call mum" } })).json.result;
    expect(got.messages[0].content.text).toContain("call mum");
  });

  it("asks for the calendar when blocks are let go", async () => {
    store.tables.tasks.push({ id: "t1", space_id: "s1", title: "Deep work", state: "active", do_date: "2026-10-23", priority: 0, evening: 0, carry_count: 0, sort_key: "a0", deleted_at: null });
    store.tables.time_blocks.push({ id: "b1", task_id: "t1", start_at: "2026-10-23T14:00:00+00:00", end_at: "2026-10-23T15:00:00+00:00", locked: 0, deleted_at: null });
    expect((await call("write", "reschedule_task", { task: "Deep work", when: "mon" })).text).toBe("Moved “Deep work” to Mon 26 Oct");
    expect(effects.calendarChanged).toHaveBeenCalledTimes(1);
  });

  it("shows Plan my day on any connection, writes it only on one that may change things, and then asks for the calendar", async () => {
    store.tables.work_hours.push({ id: "w1", weekday: 4, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null });
    store.tables.tasks.push({ id: "t1", space_id: "s1", title: "Deep work", state: "active", do_date: "2026-10-23", estimate_min: 60, priority: 3, evening: 0, carry_count: 0, sort_key: "a0", created_at: "2026-10-20T10:00:00Z", deleted_at: null });
    const shown = await call("read", "plan_day");
    expect(shown.isError).toBe(false);
    expect(shown.text).toContain("Blocks (1)\n- 09:00–10:00 Deep work — High priority. [task t1]");
    expect(shown.text).toContain("Nothing has changed yet.");
    expect(store.ops).toHaveLength(0);
    expect(effects.calendarChanged).not.toHaveBeenCalled();

    const applied = await call("write", "apply_day_plan");
    expect(applied.isError).toBe(false);
    expect(applied.text).toContain("On the timeline now (1)\n- 09:00–10:00 Deep work");
    expect(store.ops.map((o) => [o.op, o.table, o.data?.source])).toEqual([["PUT", "time_blocks", "plan"]]);
    expect(effects.calendarChanged).toHaveBeenCalledTimes(1);
  });

  it("hides a server error behind a calm message", async () => {
    store.tasks = async () => {
      throw new Error("connection reset");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await call("write", "get_today")).toEqual({ isError: true, text: "Sparehour couldn't do that just now (a server error). Try again in a moment." });
    spy.mockRestore();
  });
});
