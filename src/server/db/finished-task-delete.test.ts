// Deleting an older finished task for good (migration 20261115000100; DECISIONS.md, amendment 2026-11-15). The
// contract: `finished_tasks` stays read-only for people, and `public.finished_task_delete(id)` is the one way in. A
// person removes one finished row of their own, a task or a repeat's finished day, and is told whether a row went;
// another person's row and an id that is not there both answer false; a read-only connected app and someone signed
// out remove nothing; and the table still takes no direct write.
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, inTx as inTxOn, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();
const inTx = (fn: (c: Client) => Promise<void>) => inTxOn(admin, fn);

/** A task finished `ago` ago, as the app leaves it in `tasks` until the nightly job files it. */
async function finished(c: Client, sid: string, title: string, ago = "10 days"): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.tasks (space_id, title, sort_key, state, completed_at) values ($1, $2, 'a0', 'done', now() - $3::interval) returning id`,
    [sid, title, ago],
  );
  return rows[0].id;
}

const remove = async (c: Client, id: string | null) => (await c.query<{ gone: boolean }>("select public.finished_task_delete($1::uuid) as gone", [id])).rows[0].gone;
const kept = async (c: Client, ids: string[]) => (await c.query<{ id: string }>("select id from public.finished_tasks where id = any($1::uuid[])", [ids])).rows.map((r) => r.id).sort();

/** The error a statement ends in, with the transaction left usable; null when it ran. */
async function refusal(c: Client, sql: string, params: unknown[] = []): Promise<{ code: string; message: string } | null> {
  await c.query("savepoint attempt");
  try {
    await c.query(sql, params);
    await c.query("release savepoint attempt");
    return null;
  } catch (e) {
    await c.query("rollback to savepoint attempt");
    const error = e as { code?: string; message?: string };
    return { code: error.code ?? "error", message: error.message ?? "" };
  }
}

describe.skipIf(admin === null)("deleting a finished task for good", () => {
  afterAll(async () => {
    await admin?.end();
  });

  it("a person deletes one finished task of their own, and a repeat's finished day; the rest stay", () =>
    inTx(async (c) => {
      const me = await newUser(c, "finished-del-a@contract.test");
      const sid = await spaceOf(c, me);
      const invoice = await finished(c, sid, "Send the invoice");
      const rent = await finished(c, sid, "Pay the rent", "20 days");
      const gym = (
        await c.query<{ id: string }>(
          `insert into public.tasks (space_id, title, sort_key, state, recurrence_rule, recurrence_mode) values ($1, 'Gym', 'a1', 'active', 'FREQ=WEEKLY', 'fixed') returning id`,
          [sid],
        )
      ).rows[0].id;
      const day = (
        await c.query<{ id: string }>(
          `insert into public.task_completions (space_id, task_id, occurrence_date, completed_at) values ($1, $2, current_date - 15, now() - interval '15 days') returning id`,
          [sid, gym],
        )
      ).rows[0].id;
      await c.query("select private.archive_done_tasks()");
      expect(await kept(c, [invoice, rent, day])).toEqual([invoice, rent, day].sort());

      await asUser(c, me);
      expect(await remove(c, invoice)).toBe(true);
      // Gone is gone: a second ask finds nothing, and says so rather than failing.
      expect(await remove(c, invoice)).toBe(false);
      expect(await remove(c, day)).toBe(true);
      await asAdmin(c);
      expect(await kept(c, [invoice, rent, day])).toEqual([rent]);
      // The repeating task itself is untouched: only its one finished day went.
      expect((await c.query<{ state: string }>("select state from public.tasks where id = $1", [gym])).rows[0].state).toBe("active");
    }));

  it("another person's row and an id that is not there both answer false, and nothing goes", () =>
    inTx(async (c) => {
      const me = await newUser(c, "finished-del-b@contract.test");
      const other = await newUser(c, "finished-del-b2@contract.test");
      const mine = await finished(c, await spaceOf(c, me), "Mine");
      const theirs = await finished(c, await spaceOf(c, other), "Not yours");
      await c.query("select private.archive_done_tasks()");

      await asUser(c, me);
      expect(await remove(c, theirs)).toBe(false);
      expect(await remove(c, crypto.randomUUID())).toBe(false);
      expect(await remove(c, null)).toBe(false);
      await asAdmin(c);
      expect(await kept(c, [mine, theirs])).toEqual([mine, theirs].sort());

      // The other person, for their own, is answered true.
      await asUser(c, other);
      expect(await remove(c, theirs)).toBe(true);
      await asAdmin(c);
      expect(await kept(c, [mine, theirs])).toEqual([mine]);
    }));

  it("is for someone signed in whose connection may change things: not anon, not a session without a person, not a read-only app", () =>
    inTx(async (c) => {
      const me = await newUser(c, "finished-del-c@contract.test");
      const row = await finished(c, await spaceOf(c, me), "Keep me");
      await c.query("select private.archive_done_tasks()");

      await c.query("set local role anon");
      expect(await refusal(c, "select public.finished_task_delete($1::uuid)", [row])).toMatchObject({ code: "42501", message: expect.stringMatching(/permission denied for function/) });
      await asAdmin(c);

      // The role without a person behind it (no `sub`): refused by the function itself.
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true)");
      expect(await refusal(c, "select public.finished_task_delete($1::uuid)", [row])).toMatchObject({ code: "42501", message: "sign in first" });
      await asAdmin(c);

      // A connected app whose access is read only, with the person's own token (migration 20261023000100).
      await asUser(c, me);
      await c.query("insert into public.app_connections (client_id, access) values ('claude', 'read')");
      await asAdmin(c);
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: me, role: "authenticated", client_id: "claude" })]);
      expect(await refusal(c, "select public.finished_task_delete($1::uuid)", [row])).toMatchObject({ code: "42501", message: "this connection is read only" });
      await asAdmin(c);

      expect(await kept(c, [row])).toEqual([row]);
    }));

  it("leaves the table read-only: no direct write for anyone signed in, one read policy, and the function is the only grant", () =>
    inTx(async (c) => {
      const me = await newUser(c, "finished-del-d@contract.test");
      const sid = await spaceOf(c, me);
      const row = await finished(c, sid, "Still here");
      await c.query("select private.archive_done_tasks()");

      await asUser(c, me);
      for (const sql of [
        `delete from public.finished_tasks where id = '${row}'`,
        `delete from public.finished_tasks`,
        `update public.finished_tasks set title = 'Mine now'`,
        `insert into public.finished_tasks (space_id, title, sort_key, state, completed_at) values ('${sid}', 'Made up', 'a0', 'done', now())`,
        `truncate public.finished_tasks`,
      ]) {
        expect(await refusal(c, sql), sql).toMatchObject({ code: "42501", message: expect.stringMatching(/permission denied/) });
      }
      await asAdmin(c);
      expect(await kept(c, [row])).toEqual([row]);

      const grants = (
        await c.query<{ grantee: string; may: string }>(
          `select grantee, string_agg(privilege_type, ',' order by privilege_type) as may from information_schema.role_table_grants
            where table_schema = 'public' and table_name = 'finished_tasks' and grantee in ('anon', 'authenticated', 'PUBLIC') group by grantee`,
        )
      ).rows;
      expect(grants).toEqual([{ grantee: "authenticated", may: "SELECT" }]);
      expect((await c.query<{ policyname: string; cmd: string }>("select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'finished_tasks'")).rows).toEqual([{ policyname: "finished_tasks_read", cmd: "SELECT" }]);

      // The function: the definer's rights with a pinned search path, for `authenticated` and not for anon or everyone.
      const fn = (
        await c.query<{ definer: boolean; config: string[]; authenticated: boolean; anon: boolean; everyone: boolean }>(
          `select p.prosecdef as definer, p.proconfig as config,
                  has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
                  has_function_privilege('anon', p.oid, 'execute') as anon,
                  exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as everyone
             from pg_proc p where p.oid = 'public.finished_task_delete(uuid)'::regprocedure`,
        )
      ).rows[0];
      expect(fn).toEqual({ definer: true, config: ["search_path=public, pg_temp"], authenticated: true, anon: false, everyone: false });
    }));
});
