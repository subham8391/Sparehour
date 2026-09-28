// The done purge's contract (20260928000100): a task finished more than a week
// ago is removed for good with its steps, tag links and completion records; its
// blocks are soft-deleted so the calendar worker can take the event back; a
// task finished this week, and everything still open, stays exactly as it was.
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();

const spaceOf = async (c: Client, uid: string) => (await c.query<{ s: string }>("select personal_space_id as s from public.users where id = $1", [uid])).rows[0].s;

describe.skipIf(admin === null)("done purge contract", () => {
  it("removes week-old done tasks and their children, keeps recent and open ones", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "purge-a@contract.test");
      const sid = await spaceOf(c, uid);
      const task = async (title: string, state: string, finishedAgo: string | null) =>
        (
          await c.query<{ id: string }>(
            `insert into public.tasks (space_id, title, sort_key, state, completed_at)
             values ($1, $2, 'a0', $3, case when $4::text is null then null else now() - $4::interval end) returning id`,
            [sid, title, state, finishedAgo],
          )
        ).rows[0].id;
      const old = await task("finished last week", "done", "8 days");
      const fresh = await task("finished on Tuesday", "done", "2 days");
      const open = await task("still open", "active", null);

      await c.query("insert into public.checklist_items (space_id, task_id, title, sort_key) values ($1, $2, 'a step', 'a0')", [sid, old]);
      const tag = (await c.query<{ id: string }>("insert into public.tags (space_id, name) values ($1, 'purge-tag') returning id", [sid])).rows[0].id;
      await c.query("insert into public.task_tags (space_id, task_id, tag_id) values ($1, $2, $3)", [sid, old, tag]);
      const block = (
        await c.query<{ id: string }>(
          `insert into public.time_blocks (space_id, user_id, task_id, start_at, end_at, push_state)
           values ($1, $2, $3, now() - interval '8 days', now() - interval '8 days' + interval '30 minutes', 'local') returning id`,
          [sid, uid, old],
        )
      ).rows[0].id;
      await c.query(
        `insert into public.task_completions (space_id, task_id, occurrence_date, completed_at)
         values ($1, $2, current_date - 9, now() - interval '9 days'), ($1, $3, current_date - 1, now() - interval '1 day')`,
        [sid, old, fresh],
      );

      // The purge sweeps the whole database (the seed has old done rows of its own), so count at least ours.
      const { rows } = await c.query<{ n: number }>("select private.purge_done_tasks() as n");
      expect(rows[0].n).toBeGreaterThanOrEqual(1);

      const left = (await c.query<{ id: string }>("select id from public.tasks where id = any($1::uuid[])", [[old, fresh, open]])).rows.map((r) => r.id).sort();
      expect(left).toEqual([fresh, open].sort());
      expect((await c.query<{ n: number }>("select count(*)::int as n from public.checklist_items where task_id = $1", [old])).rows[0].n).toBe(0);
      expect((await c.query<{ n: number }>("select count(*)::int as n from public.task_tags where task_id = $1", [old])).rows[0].n).toBe(0);
      const b = (await c.query<{ task_id: string | null; deleted_at: Date | null }>("select task_id, deleted_at from public.time_blocks where id = $1", [block])).rows[0];
      expect(b.task_id).toBeNull();
      expect(b.deleted_at).not.toBeNull();
      const completions = (await c.query<{ task_id: string }>("select task_id from public.task_completions where space_id = $1", [sid])).rows.map((r) => r.task_id);
      expect(completions).toEqual([fresh]);
    }));

  it("is not callable by a signed-in person", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "purge-b@contract.test");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
      await c.query("savepoint expect_refused");
      await expect(c.query("select private.purge_done_tasks()")).rejects.toThrow(/permission denied/);
      await c.query("rollback to savepoint expect_refused");
      await c.query("reset role");
    }));
});
