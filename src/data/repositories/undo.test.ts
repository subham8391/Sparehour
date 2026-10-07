// The generic redo's parts (undo.ts): reading the declared rows, writing back only what changed, re-inserting a
// row that left the device so every restored column reaches the server, and the columns left to the server.
import { describe, expect, it, vi } from "vitest";
import { CLEARABLE_COLUMNS, SERVER_OWNED_COLUMNS } from "@/server/sync/upload";
import { localSqlite } from "@/test/local-sqlite";
import type { LocalDatabase } from "../powersync";
import { SERVER_KEEPS, applyRows, captureRows, redoable, restoreRow, type UndoTable } from "./undo";

describe("restoreRow with what the server holds", () => {
  it("re-inserts a row that left the device with the server's values first, so the write after it changes each column", async () => {
    const execute = vi.fn().mockResolvedValue({});
    const tx = { execute, getOptional: vi.fn().mockResolvedValue(null) };
    const target = { id: "t1", title: "Draft", state: "active", deleted_at: null, do_date: null, completed_at: null };
    const held = { id: "t1", title: "Draft", state: "done", deleted_at: null, do_date: "2026-10-06", completed_at: "2026-10-06T09:00:00Z" };
    await restoreRow(tx, "tasks", target, ["state", "do_date", "completed_at"], "2026-10-06T12:00:00.000Z", held);
    const [insert, args] = execute.mock.calls[0];
    expect(insert).toMatch(/^insert into tasks/);
    const cols = String(insert).match(/\(([^)]*)\)/)![1].split(", ");
    const inserted = Object.fromEntries(cols.map((c, i) => [c, args[i]]));
    expect(inserted).toMatchObject({ state: "done", do_date: "2026-10-06", completed_at: "2026-10-06T09:00:00Z" });
    expect(execute.mock.calls[1][0]).toBe("update tasks set state = ?, do_date = ?, completed_at = ?, updated_at = ? where id = ?");
    expect(execute.mock.calls[1][1].slice(0, 3)).toEqual(["active", null, null]);
  });
});

describe("captureRows and applyRows", () => {
  it("reads rows by id (null where one is not on the device) or by their task, in chunks however many there are", async () => {
    const s = localSqlite();
    const ids = Array.from({ length: 1200 }, (_, i) => `t${i}`);
    for (const id of ids) s.insert("tasks", { id, title: id, state: "active" });
    s.insert("task_tags", { id: "l1", task_id: "t3", tag_id: "g1" });
    const got = await captureRows(s.db, { tasks: [...ids, "gone"], task_tags: { task_id: ["t3", "t4"] } });
    expect(got).toHaveLength(1202);
    expect(got.find((r) => r.id === "gone")?.row).toBeNull();
    expect(got.find((r) => r.table === "task_tags")).toMatchObject({ id: "l1", row: { task_id: "t3" } });
  });

  it("writes back only the columns that differ, and leaves a row with no state alone", async () => {
    const s = localSqlite();
    s.insert("tasks", { id: "t1", title: "Draft", state: "active", priority: 1 });
    const from = await captureRows(s.db, { tasks: ["t1"] });
    s.rows("update tasks set priority = 3, title = 'Changed elsewhere' where id = 't1'");
    const to = [{ table: "tasks" as const, id: "t1", row: { ...from[0].row!, priority: 2 } }, { table: "tasks" as const, id: "absent", row: null }];
    await applyRows(s.db, to, from);
    expect(s.row("tasks", "t1")).toMatchObject({ priority: 2, title: "Changed elsewhere" });
    expect(s.row("tasks", "absent")).toBeNull();
  });
});

describe("redoable", () => {
  it("an entry whose rows cannot be read still undoes, and is not offered for redo", async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const db = { getAll: vi.fn().mockRejectedValue(new Error("closed")), writeTransaction: vi.fn() } as unknown as LocalDatabase;
    const entry = redoable(db, { label: "Changed “Draft”", toast: false, rows: { tasks: ["t1"] }, undo });
    expect(entry).toMatchObject({ label: "Changed “Draft”", toast: false });
    await expect(entry.undo()).resolves.toBeUndefined();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("tells the screen when a redo made the change again and when an undo after it took it back", async () => {
    const s = localSqlite();
    s.insert("tasks", { id: "t1", title: "Draft", state: "active", priority: 2 });
    const settled = vi.fn();
    const entry = redoable(s.db, {
      label: "Changed “Draft”",
      toast: false,
      rows: { tasks: ["t1"] },
      undo: async () => void s.rows("update tasks set priority = 0 where id = 't1'"),
      settled,
    });
    const again = await entry.undo();
    await again!.redo();
    expect(s.row("tasks", "t1")?.priority).toBe(2);
    await again!.undo();
    expect(s.row("tasks", "t1")?.priority).toBe(0);
    expect(settled.mock.calls).toEqual([["redone"], ["undone"]]);
  });
});

describe("SERVER_KEEPS", () => {
  it("names every column the server owns on the tables a redo writes, except the bookkeeping ones and those a person may clear", () => {
    const tables: UndoTable[] = ["tasks", "projects", "headings", "areas", "task_tags", "checklist_items", "recurrence_exceptions", "time_blocks", "task_completions", "user_settings", "day_plans"];
    for (const table of tables) {
      const owned = (SERVER_OWNED_COLUMNS[table] ?? []).filter((c) => !["created_at", "updated_at", "user_id", "space_id"].includes(c) && !(CLEARABLE_COLUMNS[table] ?? []).includes(c));
      expect([...(SERVER_KEEPS[table] ?? [])].sort(), table).toEqual([...owned].sort());
    }
  });
});
