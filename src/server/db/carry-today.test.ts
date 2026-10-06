// The carried-over loop and Today's ⋯ (20261006210000): the ask's record is the person's own and is not a touch,
// a conversion's retirement (archived in a one-task batch) resets the carry count on the server through the
// upload path, and Today's Sort and Show completed are the person's settings with Manual and off by default.
import { describe, expect, it } from "vitest";
import { convertTaskToProject } from "@/data/repositories/convert";
import { localSqlite } from "@/test/local-sqlite";
import { sanitize, type WireOp } from "../sync/upload";
import { asAdmin, asUser, inTx, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();

type Applied = { r: { applied: string[]; rejected: { client_id: string; code: string }[] } };

describe.skipIf(admin === null)("carry today contract", () => {
  it("recording the three-carry ask is the person's write and does not touch the task; a real edit still does", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "carry-today-a@contract.test");
      const mine = await spaceOf(c, me);
      const { rows } = await c.query<{ id: string }>(
        "insert into public.tasks (space_id, title, sort_key, state, do_date, last_touched_at) values ($1, 'Book dentist', 'a0', 'active', current_date - 1, now() - interval '20 days') returning id",
        [mine],
      );
      const id = rows[0].id;
      const touched = async () => (await c.query<{ age: number }>("select extract(day from now() - last_touched_at)::int as age from public.tasks where id = $1", [id])).rows[0].age;
      await asUser(c, me);
      await c.query("update public.tasks set carry_asked_at = '2026-10-06T09:00:00Z' where id = $1", [id]);
      expect((await c.query("select carry_asked_at is not null as asked from public.tasks where id = $1", [id])).rows[0]).toEqual({ asked: true });
      expect(await touched()).toBe(20);
      await c.query("update public.tasks set title = 'Book the dentist' where id = $1", [id]);
      expect(await touched()).toBe(0);
    }));

  it("a conversion archives the task in a batch of its own through the upload path, and the server resets its carry count", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "carry-today-b@contract.test");
      const mine = await spaceOf(c, me);
      const { rows } = await c.query<{ id: string }>(
        "insert into public.tasks (space_id, title, sort_key, state, do_date, carry_count) values ($1, 'Plan offsite', 'a0', 'active', current_date - 1, 3) returning id",
        [mine],
      );
      const id = rows[0].id;
      const batch = "55555555-5555-4555-8555-555555555555";
      const project = "66666666-6666-4666-8666-666666666666";
      await asUser(c, me);
      const ops = [
        { op: "PUT", table: "projects", id: project, client_id: "p1", data: { space_id: mine, name: "Plan offsite", state: "active", sort_key: "a0" } },
        { op: "PATCH", table: "tasks", id, client_id: "t1", data: { state: "archived", archive_batch_id: batch, archived_from_state: "active", carry_count: 3 } },
      ];
      const r = (await c.query<Applied>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(r.applied).toEqual(["p1", "t1"]);
      const row = (await c.query("select state, archive_batch_id::text as batch, archived_from_state, carry_count, to_char(do_date, 'YYYY-MM-DD') is not null as dated from public.tasks where id = $1", [id])).rows[0];
      // Archived, in its batch, the state it left kept; the do-date stays on it; the count is the server's zero.
      expect(row).toEqual({ state: "archived", batch, archived_from_state: "active", carry_count: 0, dated: true });
      // The undo puts it back; the count stays the server's (the M1 ruling: it is not restored).
      await c.query("update public.tasks set state = 'active', archive_batch_id = null, archived_from_state = null where id = $1", [id]);
      expect((await c.query("select state, archive_batch_id, carry_count from public.tasks where id = $1", [id])).rows[0]).toEqual({ state: "active", archive_batch_id: null, carry_count: 0 });
    }));

  it("a conversion made on the device uploads whole: the project, every step's task (open and done) and the retirement", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "carry-today-f@contract.test");
      const mine = await spaceOf(c, me);
      const { rows } = await c.query<{ id: string }>(
        "insert into public.tasks (space_id, title, sort_key, state, do_date, carry_count) values ($1, 'Plan offsite', 'a0', 'active', current_date - 1, 3) returning id",
        [mine],
      );
      const id = rows[0].id;
      // The same task on the device, converted there by the app's own code; then its writes go up as sync sends them.
      const device = localSqlite();
      device.insert("tasks", { id, space_id: mine, title: "Plan offsite", notes_md: "By the lake", state: "active", do_date: "2026-10-05", carry_count: 3, sort_key: "a0" });
      device.insert("checklist_items", { id: crypto.randomUUID(), space_id: mine, task_id: id, title: "Pick a date", done: 1, sort_key: "a0" });
      device.insert("checklist_items", { id: crypto.randomUUID(), space_id: mine, task_id: id, title: "Book venue", done: 0, sort_key: "a1" });
      const out = await convertTaskToProject(device.db, undefined, id);
      expect(out?.taskIds).toHaveLength(2);
      const put = (table: string, rowId: string): WireOp => {
        const row = device.row(table, rowId)!;
        const data = Object.fromEntries(Object.entries(row).filter(([k, v]) => k !== "id" && v !== null));
        return sanitize({ op: "PUT", table, id: rowId, client_id: `${table}-${rowId}`, data })!;
      };
      const retired = device.row("tasks", id)!;
      const ops = [
        put("projects", out!.projectId),
        ...out!.taskIds.map((t) => put("tasks", t)),
        sanitize({ op: "PATCH", table: "tasks", id, client_id: "retire", data: { state: retired.state, archive_batch_id: retired.archive_batch_id, archived_from_state: retired.archived_from_state } })!,
      ];
      await asUser(c, me);
      const r = (await c.query<Applied>("select public.apply_mutations('dev-2', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(r.rejected).toEqual([]);
      expect(r.applied).toHaveLength(ops.length);
      await asAdmin(c);
      const made = (await c.query("select title, state, project_id::text as project from public.tasks where project_id = $1 order by sort_key", [out!.projectId])).rows;
      expect(made).toEqual([
        { title: "Pick a date", state: "done", project: out!.projectId },
        { title: "Book venue", state: "active", project: out!.projectId },
      ]);
      expect((await c.query("select state, carry_count from public.tasks where id = $1", [id])).rows[0]).toEqual({ state: "archived", carry_count: 0 });
    }));

  it("archived_from_state takes only an open or parked state", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "carry-today-c@contract.test");
      const mine = await spaceOf(c, me);
      await asUser(c, me);
      await expect(c.query("insert into public.tasks (space_id, title, sort_key, state, archived_from_state) values ($1, 'x', 'a0', 'archived', 'done')", [mine])).rejects.toThrow(/archived_from_state/);
    }));

  it("Today's Sort and Show completed: Manual and off by default, a person sets their own, and only the five sorts exist", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "carry-today-d@contract.test");
      const other = await newUser(c, "carry-today-e@contract.test");
      const settingsId = (await c.query<{ id: string }>("select id from public.user_settings where user_id = $1", [me])).rows[0].id;
      const theirs = (await c.query<{ id: string }>("select id from public.user_settings where user_id = $1", [other])).rows[0].id;
      expect((await c.query("select today_sort, show_completed from public.user_settings where id = $1", [settingsId])).rows[0]).toEqual({ today_sort: "manual", show_completed: false });
      await asUser(c, me);
      const ops = [
        { op: "PATCH", table: "user_settings", id: settingsId, client_id: "s1", data: { today_sort: "estimate", show_completed: true } },
        { op: "PATCH", table: "user_settings", id: theirs, client_id: "s2", data: { today_sort: "time" } },
      ];
      const r = (await c.query<Applied>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(r.applied).toEqual(["s1"]);
      expect((await c.query("select today_sort, show_completed from public.user_settings where id = $1", [settingsId])).rows[0]).toEqual({ today_sort: "estimate", show_completed: true });
      await c.query("savepoint bad_sort");
      await expect(c.query("update public.user_settings set today_sort = 'title' where id = $1", [settingsId])).rejects.toThrow(/today_sort/);
      await c.query("rollback to savepoint bad_sort");
      await asAdmin(c);
      expect((await c.query("select today_sort from public.user_settings where id = $1", [theirs])).rows[0]).toEqual({ today_sort: "manual" });
    }));
});
