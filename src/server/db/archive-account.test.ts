// Archive batches, permanent delete, account deletion and the account's picture (20261007100000): a Clear-the-slate
// batch uploads and comes back with its state and dates, the done purge leaves archived rows alone, a permanent
// delete removes only the chosen archived or dropped rows, a deleted account is marked at once and gone for good
// after the grace with not one row left, and the profile follows the provider's picture.
import { describe, expect, it } from "vitest";
import { asAdmin, asUser, inTx, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();

type Applied = { r: { applied: string[]; rejected: { client_id: string; code: string }[] } };

describe.skipIf(admin === null)("archive and account contract", () => {
  it("a Clear-the-slate batch uploads with its batch, prior state and date; a restore brings them back and the carry count stays the server's zero", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "archive-a@contract.test");
      const mine = await spaceOf(c, me);
      const { rows } = await c.query<{ id: string }>(
        `insert into public.tasks (space_id, title, sort_key, state, do_date, carry_count) values
           ($1, 'Carried', 'a0', 'active', current_date - 3, 2),
           ($1, 'Backlog', 'a1', 'active', null, 0)
         returning id`,
        [mine],
      );
      const [carried, backlog] = rows.map((r) => r.id);
      const batch = "77777777-7777-4777-8777-777777777777";
      await asUser(c, me);
      const at = "2026-10-06T09:00:00Z";
      const ops = [carried, backlog].map((id, i) => ({
        op: "PATCH",
        table: "tasks",
        id,
        client_id: `t${i}`,
        data: { state: "archived", archive_batch_id: batch, archived_from_state: "active", archived_at: at },
      }));
      const r = (await c.query<Applied>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(r.rejected).toEqual([]);
      const archived = await c.query(
        "select title, state, archive_batch_id::text as batch, archived_from_state, archived_at is not null as stamped, do_date is not null as dated, carry_count from public.tasks where space_id = $1 order by sort_key",
        [mine],
      );
      expect(archived.rows).toEqual([
        { title: "Carried", state: "archived", batch, archived_from_state: "active", stamped: true, dated: true, carry_count: 0 },
        { title: "Backlog", state: "archived", batch, archived_from_state: "active", stamped: true, dated: false, carry_count: 0 },
      ]);
      // The restore: back to the state each left, the batch marks cleared, the do-date never moved.
      await c.query("update public.tasks set state = archived_from_state, archive_batch_id = null, archived_from_state = null, archived_at = null where archive_batch_id = $1", [batch]);
      const back = await c.query("select title, state, archive_batch_id, (do_date = current_date - 3) as same_day, carry_count from public.tasks where space_id = $1 order by sort_key", [mine]);
      expect(back.rows).toEqual([
        { title: "Carried", state: "active", archive_batch_id: null, same_day: true, carry_count: 0 },
        { title: "Backlog", state: "active", archive_batch_id: null, same_day: null, carry_count: 0 },
      ]);
    }));

  it("the done purge never touches archived rows, however old", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "archive-b@contract.test");
      const mine = await spaceOf(c, me);
      await c.query(
        "insert into public.tasks (space_id, title, sort_key, state, archive_batch_id, archived_at, updated_at) values ($1, 'Old archive', 'a0', 'archived', gen_random_uuid(), now() - interval '400 days', now() - interval '400 days')",
        [mine],
      );
      await c.query("select private.purge_done_tasks()");
      expect((await c.query("select count(*)::int as n from public.tasks where space_id = $1 and state = 'archived'", [mine])).rows[0]).toEqual({ n: 1 });
    }));

  it("a permanent delete removes only the chosen archived or dropped tasks of the caller, with their steps and tags", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "archive-c@contract.test");
      const other = await newUser(c, "archive-c2@contract.test");
      const mine = await spaceOf(c, me);
      const theirs = await spaceOf(c, other);
      const { rows } = await c.query<{ id: string; title: string }>(
        `insert into public.tasks (space_id, title, sort_key, state) values
           ($1, 'Archived A', 'a0', 'archived'),
           ($1, 'Archived B', 'a1', 'archived'),
           ($1, 'Dropped', 'a2', 'dropped'),
           ($1, 'Active', 'a3', 'active'),
           ($2, 'Someone else archived', 'a0', 'archived')
         returning id, title`,
        [mine, theirs],
      );
      const id = Object.fromEntries(rows.map((r) => [r.title, r.id]));
      await c.query("insert into public.checklist_items (space_id, task_id, title, sort_key) values ($1, $2, 'Step', 'a0')", [mine, id["Archived A"]]);
      const tag = (await c.query<{ id: string }>("insert into public.tags (space_id, name) values ($1, 'home') returning id", [mine])).rows[0].id;
      await c.query("insert into public.task_tags (space_id, task_id, tag_id) values ($1, $2, $3)", [mine, id["Dropped"], tag]);
      const block = (
        await c.query<{ id: string }>(
          "insert into public.time_blocks (space_id, user_id, task_id, start_at, end_at) values ($1, $2, $3, now() + interval '1 day', now() + interval '1 day 30 minutes') returning id",
          [mine, me, id["Archived A"]],
        )
      ).rows[0].id;

      await asUser(c, me);
      // Asked for: two archived, one dropped, one active (not allowed) and another person's archived task (not visible).
      const asked = [id["Archived A"], id["Dropped"], id["Active"], id["Someone else archived"]];
      const n = (await c.query<{ n: number }>("select public.delete_tasks_permanently($1::uuid[]) as n", [asked])).rows[0].n;
      expect(n).toBe(2);
      await asAdmin(c);
      const left = await c.query<{ title: string }>("select title from public.tasks where space_id in ($1, $2) order by title", [mine, theirs]);
      expect(left.rows.map((r) => r.title)).toEqual(["Active", "Archived B", "Someone else archived"]);
      expect((await c.query("select count(*)::int as n from public.checklist_items where task_id = $1", [id["Archived A"]])).rows[0]).toEqual({ n: 0 });
      expect((await c.query("select count(*)::int as n from public.task_tags where tag_id = $1", [tag])).rows[0]).toEqual({ n: 0 });
      // The tag itself is the person's and stays; the block is soft-deleted for the calendar worker.
      expect((await c.query("select count(*)::int as n from public.tags where id = $1", [tag])).rows[0]).toEqual({ n: 1 });
      expect((await c.query("select task_id, deleted_at is not null as gone from public.time_blocks where id = $1", [block])).rows[0]).toEqual({ task_id: null, gone: true });
    }));

  it("a permanent delete needs a signed-in caller", () =>
    inTx(admin, async (c) => {
      await c.query("set local role anon");
      await expect(c.query("select public.delete_tasks_permanently(array[gen_random_uuid()])")).rejects.toThrow();
    }));

  it("asking to delete an account marks it at once, a restore clears the marks, and only the service role may do either", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "archive-d@contract.test");
      await c.query("insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/1', 'k', 'a')", [me]);
      await asUser(c, me);
      await c.query("savepoint expect_refused");
      await expect(c.query("select public.account_delete_request($1)", [me])).rejects.toThrow();
      await c.query("rollback to savepoint expect_refused");
      await asAdmin(c);
      const after = (await c.query<{ d: Date }>("select public.account_delete_request($1) as d", [me])).rows[0].d;
      expect(after.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
      const marks = (
        await c.query("select u.deleted_at is not null as marked, a.raw_app_meta_data ? 'delete_after' as flagged from public.users u join auth.users a on a.id = u.id where u.id = $1", [me])
      ).rows[0];
      expect(marks).toEqual({ marked: true, flagged: true });
      expect((await c.query("select count(*)::int as n from public.push_subscriptions where user_id = $1", [me])).rows[0]).toEqual({ n: 0 });
      // Within the grace the nightly job leaves it alone.
      expect((await c.query<{ n: number }>("select private.purge_deleted_accounts() as n")).rows[0].n).toBe(0);
      expect((await c.query<{ ok: boolean }>("select public.account_restore($1) as ok", [me])).rows[0].ok).toBe(true);
      const cleared = (
        await c.query("select u.deleted_at is null as kept, not (a.raw_app_meta_data ? 'delete_after') as unflagged from public.users u join auth.users a on a.id = u.id where u.id = $1", [me])
      ).rows[0];
      expect(cleared).toEqual({ kept: true, unflagged: true });
      expect((await c.query<{ ok: boolean }>("select public.account_restore($1) as ok", [me])).rows[0].ok).toBe(false);
    }));

  it("an account past its grace is removed with every row it owned, and nobody else's", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "archive-e@contract.test");
      const other = await newUser(c, "archive-e2@contract.test");
      const mine = await spaceOf(c, me);
      const theirs = await spaceOf(c, other);
      const project = (await c.query<{ id: string }>("insert into public.projects (space_id, name, state, sort_key) values ($1, 'House', 'active', 'a0') returning id", [mine])).rows[0].id;
      const task = (
        await c.query<{ id: string }>("insert into public.tasks (space_id, project_id, title, sort_key, state, do_date) values ($1, $2, 'Paint', 'a0', 'active', current_date) returning id", [mine, project])
      ).rows[0].id;
      await c.query("insert into public.checklist_items (space_id, task_id, title, sort_key) values ($1, $2, 'Buy paint', 'a0')", [mine, task]);
      await c.query("insert into public.areas (space_id, name, sort_key) values ($1, 'Home', 'a0')", [mine]);
      await c.query("insert into public.time_blocks (space_id, user_id, task_id, start_at, end_at) values ($1, $2, $3, now(), now() + interval '1 hour')", [mine, me, task]);
      await c.query("insert into public.day_plans (space_id, user_id, date) values ($1, $2, current_date)", [mine, me]);
      await c.query("insert into private.mutations (mutation_id, user_id, result) values ('archive-e-1', $1, 'applied')", [me]);
      await c.query("insert into private.rollover_runs (user_id, local_date) values ($1, current_date)", [me]);
      await c.query("insert into public.tasks (space_id, title, sort_key, state) values ($1, 'Not mine', 'a0', 'active')", [theirs]);

      await c.query("select public.account_delete_request($1)", [me]);
      await c.query("update public.users set deleted_at = now() - interval '31 days' where id = $1", [me]);
      expect((await c.query<{ n: number }>("select private.purge_deleted_accounts() as n")).rows[0].n).toBe(1);

      // Not one row left anywhere that names the account or its space.
      const tables = await c.query<{ schema: string; table: string; column: string }>(
        `select table_schema as schema, table_name as table, column_name as column
           from information_schema.columns
          where table_schema in ('public', 'private') and column_name in ('user_id', 'space_id', 'owner_id')
            and table_name in (select table_name from information_schema.tables t where t.table_schema = columns.table_schema and t.table_type = 'BASE TABLE')`,
      );
      expect(tables.rows.length).toBeGreaterThan(10);
      for (const t of tables.rows) {
        const n = (await c.query<{ n: number }>(`select count(*)::int as n from ${t.schema}.${t.table} where ${t.column}::text in ($1, $2)`, [me, mine])).rows[0].n;
        expect({ table: `${t.schema}.${t.table}.${t.column}`, n }).toEqual({ table: `${t.schema}.${t.table}.${t.column}`, n: 0 });
      }
      expect((await c.query("select count(*)::int as n from public.users where id = $1", [me])).rows[0]).toEqual({ n: 0 });
      expect((await c.query("select count(*)::int as n from public.spaces where id = $1", [mine])).rows[0]).toEqual({ n: 0 });
      expect((await c.query("select count(*)::int as n from auth.users where id = $1", [me])).rows[0]).toEqual({ n: 0 });
      // The other account is untouched.
      expect((await c.query("select count(*)::int as n from public.tasks where space_id = $1", [theirs])).rows[0]).toEqual({ n: 1 });
      expect((await c.query("select count(*)::int as n from public.users where id = $1", [other])).rows[0]).toEqual({ n: 1 });
    }));

  it("the profile takes the provider's https picture on sign-up and when it changes, and nothing else", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "archive-f@contract.test");
      const avatar = async () => (await c.query<{ avatar_url: string | null }>("select avatar_url from public.users where id = $1", [me])).rows[0].avatar_url;
      expect(await avatar()).toBeNull();
      await c.query("update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"picture\": \"https://lh3.googleusercontent.com/a/abc\"}' where id = $1", [me]);
      expect(await avatar()).toBe("https://lh3.googleusercontent.com/a/abc");
      await c.query("update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"avatar_url\": \"https://lh3.googleusercontent.com/a/new\"}' where id = $1", [me]);
      expect(await avatar()).toBe("https://lh3.googleusercontent.com/a/new");
      await c.query("update auth.users set raw_user_meta_data = (raw_user_meta_data - 'picture') || '{\"avatar_url\": \"javascript:alert(1)\"}' where id = $1", [me]);
      expect(await avatar()).toBeNull();
    }));
});
