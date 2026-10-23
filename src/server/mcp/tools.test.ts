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
let effects: Effects & { calendarChanged: Mock<() => void>; linkSaved: Mock<(itemId: string, url: string) => void> };

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

async function call(access: Access, name: string, args: Record<string, unknown> = {}) {
  const r = await rpc(access, "tools/call", { name, arguments: args });
  expect(r.status).toBe(200);
  return { text: r.json.result.content[0].text as string, isError: Boolean(r.json.result.isError) };
}

beforeEach(() => {
  store = new FakeStore(
    {
      lists: [{ id: "l1", space_id: "s1", parent_id: null, name: "Books", emoji: "📚", item_order: "manual", hide_done: 0, sort_key: "a0", deleted_at: null }],
      time_blocks: [],
    },
    { userId: "u1", spaceId: "s1" },
  );
  effects = { calendarChanged: vi.fn<() => void>(), linkSaved: vi.fn<(itemId: string, url: string) => void>() };
});

describe("the Sparehour MCP server", () => {
  it("introduces itself with its instructions and lists eight reads and nine writes, annotated", async () => {
    const init = await rpc("write", "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(init.json.result.serverInfo).toMatchObject({ name: "sparehour", title: "Sparehour" });
    expect(init.json.result.instructions).toBe(SERVER_INSTRUCTIONS);
    const { tools } = (await rpc("write", "tools/list")).json.result as { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean }; inputSchema: { properties?: Record<string, unknown> } }[] };
    const reads = tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    const writes = tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
    expect(reads).toEqual(["get_today", "get_inbox", "get_upcoming", "get_task", "search", "list_projects", "get_lists", "get_list"]);
    expect(writes).toEqual(["add_task", "complete_task", "reopen_task", "reschedule_task", "update_task", "drop_task", "create_list", "add_list_items", "update_list_item"]);
    expect(tools.find((t) => t.name === "drop_task")?.annotations.destructiveHint).toBe(true);
    expect(Object.keys(tools.find((t) => t.name === "add_task")?.inputSchema.properties ?? {})).toEqual(["text", "notes"]);
  });

  it("answers in short text with ids, and refuses with the reason as an error result", async () => {
    const added = await call("write", "add_task", { text: "Pick up the parcel tomorrow 5pm ~15m" });
    expect(added.isError).toBe(false);
    expect(added.text).toMatch(/^Added “Pick up the parcel” — Tomorrow 17:00 · 15m → Upcoming\n- Pick up the parcel — Tomorrow 17:00 · 15m \[id [0-9a-f-]{36}\]$/);
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
      ["add_task", { text: "Anything" }],
      ["complete_task", { task: "x" }],
      ["reschedule_task", { task: "x", when: "tomorrow" }],
      ["create_list", { name: "Films" }],
      ["add_list_items", { list: "Books", items: ["Dune"] }],
    ] as const) {
      const r = await call("read", name, args);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/^This connection is read only, so Sparehour changed nothing\. .*Settings › Connected apps/);
    }
    expect(store.ops).toHaveLength(0);
    expect((await call("read", "get_lists")).text).toBe("Lists\n- 📚 Books — 0 items [id l1]");
  });

  it("asks for a link's preview after an item with a link is saved, and for the calendar when blocks are let go", async () => {
    const r = await call("write", "add_list_items", { list: "Books", items: [{ title: "Dune", url: "en.wikipedia.org/wiki/Dune_(novel)" }, "Neuromancer"] });
    expect(r.text).toMatch(/^Added 2 items to Books:\n- Dune \[id .+\]\n- Neuromancer \[id .+\]$/);
    expect(effects.linkSaved).toHaveBeenCalledTimes(1);
    expect(effects.linkSaved.mock.calls[0][1]).toBe("https://en.wikipedia.org/wiki/Dune_(novel)");

    store.tables.tasks.push({ id: "t1", space_id: "s1", title: "Deep work", state: "active", do_date: "2026-10-23", priority: 0, evening: 0, carry_count: 0, sort_key: "a0", deleted_at: null });
    store.tables.time_blocks.push({ id: "b1", task_id: "t1", start_at: "2026-10-23T14:00:00+00:00", end_at: "2026-10-23T15:00:00+00:00", locked: 0, deleted_at: null });
    expect((await call("write", "reschedule_task", { task: "Deep work", when: "mon" })).text).toBe("Moved “Deep work” to Mon 26 Oct");
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
