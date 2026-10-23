// Connected apps' database contract (migration 20261023000100; DECISIONS.md, amendment 2026-10-23). A person keeps
// their own connections and nobody else's; an app's token (a session with a client_id claim) never writes one; a
// read-only app — or one with no connection on record — reads but changes nothing, through apply_mutations, a direct
// write or the permanent delete; a read-and-change app writes exactly what the MCP planner sends; and every table a
// person can write carries the read-only rule, so a new table cannot forget it.
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, inTx as inTxOn, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();
const inTx = (fn: (c: Client) => Promise<void>) => inTxOn(admin, fn);

interface ApplyResult {
  applied: string[];
  rejected: { client_id: string; code: string }[];
}

/** What PostgREST does for a token Supabase's OAuth server issued to an app: the person, plus the app's client_id. */
async function asApp(c: Client, uid: string, clientId: string): Promise<void> {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated", client_id: clientId })]);
}

async function apply(c: Client, ops: Record<string, unknown>[], device = "mcp:claude"): Promise<ApplyResult> {
  const { rows } = await c.query<{ r: ApplyResult }>("select public.apply_mutations($1, $2::jsonb) as r", [device, JSON.stringify(ops)]);
  return rows[0].r;
}

const uuid = () => crypto.randomUUID();
let n = 0;
const put = (table: string, id: string, data: Record<string, unknown>) => ({ client_id: `c${++n}`, op: "PUT", table, id, data });
const patch = (table: string, id: string, data: Record<string, unknown>) => ({ client_id: `c${++n}`, op: "PATCH", table, id, data });

async function errorCode(c: Client, sql: string, params: unknown[] = []): Promise<string | null> {
  await c.query("savepoint attempt");
  try {
    await c.query(sql, params);
    await c.query("release savepoint attempt");
    return null;
  } catch (e) {
    await c.query("rollback to savepoint attempt");
    return (e as { code?: string }).code ?? "error";
  }
}

describe.skipIf(admin === null)("connected apps contract", () => {
  afterAll(async () => {
    await admin?.end();
  });

  it("a person keeps their own connections and sees nobody else's", () =>
    inTx(async (c) => {
      const me = await newUser(c, "apps-a@contract.test");
      const other = await newUser(c, "apps-b@contract.test");
      await asUser(c, me);
      await c.query("insert into public.app_connections (client_id, client_name, access) values ('claude', 'Claude', 'write')");
      expect((await c.query("select user_id, access from public.app_connections")).rows).toEqual([{ user_id: me, access: "write" }]);
      await c.query("update public.app_connections set access = 'read', client_id = 'changed' where client_id = 'claude'");
      // The guard keeps the app the row is about.
      expect((await c.query("select client_id, access from public.app_connections")).rows).toEqual([{ client_id: "claude", access: "read" }]);
      await asAdmin(c);
      await asUser(c, other);
      expect((await c.query("select * from public.app_connections")).rows).toEqual([]);
      expect(await errorCode(c, "insert into public.app_connections (user_id, client_id) values ($1, 'x')", [me])).toBe("42501");
    }));

  it("an app's own token never writes a connection, not even its own", () =>
    inTx(async (c) => {
      const me = await newUser(c, "apps-c@contract.test");
      await asUser(c, me);
      await c.query("insert into public.app_connections (client_id, access) values ('claude', 'read')");
      await asAdmin(c);
      await asApp(c, me, "claude");
      expect(await errorCode(c, "update public.app_connections set access = 'write'")).toBe("42501");
      expect(await errorCode(c, "insert into public.app_connections (client_id, access) values ('other', 'write')")).toBe("42501");
      expect(await errorCode(c, "delete from public.app_connections")).toBe("42501");
      expect((await c.query("select access from public.app_connections")).rows).toEqual([{ access: "read" }]);
    }));

  it("a read-only app reads everything and changes nothing, however its token is used", () =>
    inTx(async (c) => {
      const me = await newUser(c, "apps-d@contract.test");
      const sid = await spaceOf(c, me);
      const task = uuid();
      await asUser(c, me);
      expect((await apply(c, [put("tasks", task, { space_id: sid, title: "Mine", state: "dropped", sort_key: "a0" })], "dev-1")).rejected).toEqual([]);
      await c.query("insert into public.app_connections (client_id, access) values ('claude', 'read')");
      await asAdmin(c);

      await asApp(c, me, "claude");
      expect((await c.query("select title from public.tasks where id = $1", [task])).rows).toEqual([{ title: "Mine" }]);
      const out = await apply(c, [patch("tasks", task, { title: "Changed" }), put("tasks", uuid(), { space_id: sid, title: "New", state: "inbox", sort_key: "a1" })]);
      expect(out.rejected.map((r) => r.code)).toEqual(["42501", "42501"]);
      expect(await errorCode(c, "insert into public.tasks (space_id, title, sort_key) values ($1, 'Direct', 'a2')", [sid])).toBe("42501");
      expect((await c.query("update public.tasks set title = 'Direct' where id = $1", [task])).rowCount).toBe(0);
      expect(await errorCode(c, "select public.delete_tasks_permanently(array[$1::uuid])", [task])).toBe("42501");
      await asAdmin(c);
      expect((await c.query("select title, state from public.tasks where id = $1", [task])).rows).toEqual([{ title: "Mine", state: "dropped" }]);
    }));

  it("an app with no connection on record is read only; one that may change writes what the planner sends, as the person", () =>
    inTx(async (c) => {
      const me = await newUser(c, "apps-e@contract.test");
      const sid = await spaceOf(c, me);
      await asApp(c, me, "claude");
      expect((await apply(c, [put("tags", uuid(), { space_id: sid, name: "x" })])).rejected.map((r) => r.code)).toEqual(["42501"]);
      await asAdmin(c);
      await asUser(c, me);
      await c.query("insert into public.app_connections (client_id, access) values ('claude', 'write')");
      await asAdmin(c);

      // add_task's ops (src/server/mcp/planner.ts): the draft's row with source 'mcp', a new tag and its link.
      const [task, tag, link, series, list, item, itemTag] = [uuid(), uuid(), uuid(), uuid(), uuid(), uuid(), uuid()];
      await asApp(c, me, "claude");
      const out = await apply(c, [
        put("tasks", task, {
          space_id: sid,
          state: "active",
          project_id: null,
          area_id: null,
          heading_id: null,
          title: "Draft proposal",
          notes_md: null,
          priority: 2,
          do_date: "2026-10-26",
          do_time: "15:00",
          deadline: null,
          start_date: null,
          evening: false,
          estimate_min: 45,
          miss_policy: "carry",
          recurrence_rule: null,
          recurrence_mode: null,
          recurrence_series_id: null,
          sort_key: "a0",
          day_sort_key: "a0",
          source: "mcp",
        }),
        put("tags", tag, { space_id: sid, name: "client" }),
        put("task_tags", link, { space_id: sid, task_id: task, tag_id: tag }),
        // A repeat moved just this once: the exception's upsert brings a soft-deleted one back.
        put("tasks", series, { space_id: sid, state: "active", title: "Gym", do_date: "2026-10-26", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", recurrence_series_id: series, miss_policy: "skip", sort_key: "a1", evening: false, priority: 0 }),
        put("recurrence_exceptions", uuid(), { space_id: sid, series_id: series, occurrence_date: "2026-10-26", kind: "move", moved_to: "2026-10-27", deleted_at: null }),
        // create_list and add_list_items: a list, an item with a link and a rating, and a tag on it.
        put("lists", list, { space_id: sid, parent_id: null, name: "Books", emoji: "📚", item_order: "manual", hide_done: false, sort_key: "a0" }),
        put("list_items", item, { space_id: sid, list_id: list, title: "Dune", note_md: null, url: "https://example.com/dune", status: "doing", rating: 5, done_at: null, sort_key: "a0" }),
        put("list_item_tags", itemTag, { space_id: sid, item_id: item, tag_id: tag }),
      ]);
      expect(out.rejected).toEqual([]);
      await asAdmin(c);
      expect((await c.query("select source, state, do_time::text, estimate_min, priority, carry_count from public.tasks where id = $1", [task])).rows).toEqual([
        { source: "mcp", state: "active", do_time: "15:00:00", estimate_min: 45, priority: 2, carry_count: 0 },
      ]);
      expect((await c.query("select count(*)::int as n from public.task_tags where task_id = $1 and deleted_at is null", [task])).rows[0].n).toBe(1);
      expect((await c.query("select kind, moved_to::text from public.recurrence_exceptions where series_id = $1", [series])).rows).toEqual([{ kind: "move", moved_to: "2026-10-27" }]);
      expect((await c.query("select status, rating, preview_title from public.list_items where id = $1", [item])).rows).toEqual([{ status: "doing", rating: 5, preview_title: null }]);

      // complete_task's ops for a one-off: state and the completion time; the server-owned columns stay the server's.
      await asApp(c, me, "claude");
      expect((await apply(c, [patch("tasks", task, { state: "done", completed_at: "2026-10-23T09:00:00Z" })])).rejected).toEqual([]);
      await asAdmin(c);
      expect((await c.query("select state from public.tasks where id = $1", [task])).rows[0].state).toBe("done");

      // Switched to read only in Settings, the same app is stopped at once.
      await asUser(c, me);
      await c.query("update public.app_connections set access = 'read' where client_id = 'claude'");
      await asAdmin(c);
      await asApp(c, me, "claude");
      expect((await apply(c, [patch("tasks", task, { state: "active", completed_at: null })])).rejected.map((r) => r.code)).toEqual(["42501"]);
    }));

  it("every table a person may write carries the read-only rule for insert, update and delete", async () => {
    const { rows } = await (admin as Client).query<{ table_name: string; missing: string[] }>(`
      with writable as (
        select distinct table_name from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
          and table_name <> 'app_connections'
      )
      select w.table_name, array(
        select cmd from unnest(array['INSERT', 'UPDATE', 'DELETE']) cmd
        where not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = w.table_name and p.permissive = 'RESTRICTIVE'
            and p.cmd = cmd and coalesce(p.qual, p.with_check) like '%app_may_write%'
        )
      ) as missing
      from writable w order by 1`);
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.filter((r) => r.missing.length > 0)).toEqual([]);
  });
});
