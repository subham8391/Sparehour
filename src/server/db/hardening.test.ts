// The hardening migration's contract (20260916000100): what a signed-in
// person cannot do at the table, whatever path they use — and what the
// server still can.
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();

async function asUser(c: Client, uid: string): Promise<void> {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
}
async function asAdmin(c: Client): Promise<void> {
  await c.query("reset role");
}
async function refused(c: Client, sql: string, params: unknown[] = [], pattern = /permission denied|not a member|not recognised|must be|too many/): Promise<void> {
  await c.query("savepoint expect_refused");
  await expect(c.query(sql, params)).rejects.toThrow(pattern);
  await c.query("rollback to savepoint expect_refused");
}
const spaceOf = async (c: Client, uid: string) => (await c.query<{ s: string }>("select personal_space_id as s from public.users where id = $1", [uid])).rows[0].s;

describe.skipIf(admin === null)("hardening contract", () => {
  it("a time zone the database cannot resolve is refused, and sign-up falls back to UTC", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "hard-a@contract.test", "Nowhere/Bogus");
      expect((await c.query("select timezone from public.user_settings where user_id = $1", [uid])).rows[0]).toEqual({ timezone: "UTC" });
      const ok = await newUser(c, "hard-a2@contract.test", "Asia/Kolkata");
      expect((await c.query("select timezone from public.user_settings where user_id = $1", [ok])).rows[0]).toEqual({ timezone: "Asia/Kolkata" });
      await asUser(c, uid);
      await refused(c, "update public.user_settings set timezone = 'Mars/Olympus' where user_id = $1", [uid]);
      await c.query("update public.user_settings set timezone = 'Europe/London' where user_id = $1", [uid]);
      expect((await c.query("select timezone from public.user_settings where user_id = $1", [uid])).rows[0]).toEqual({ timezone: "Europe/London" });
    }));

  it("a person cannot move their settings or profile to another space, nor set the rollover's counters", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "hard-b@contract.test");
      const other = await newUser(c, "hard-c@contract.test");
      const mine = await spaceOf(c, me);
      const theirs = await spaceOf(c, other);
      await asUser(c, me);
      // Re-pointing is silently ignored: the row keeps its space.
      await c.query("update public.user_settings set space_id = $2 where user_id = $1", [me, theirs]);
      expect((await c.query("select space_id from public.user_settings where user_id = $1", [me])).rows[0]).toEqual({ space_id: mine });
      await c.query("update public.users set personal_space_id = $2, email = 'x@y.z', display_name = 'Sam' where id = $1", [me, theirs]);
      expect((await c.query("select personal_space_id, email, display_name from public.users where id = $1", [me])).rows[0]).toEqual({ personal_space_id: mine, email: "hard-b@contract.test", display_name: "Sam" });

      const { rows } = await c.query<{ id: string }>("insert into public.tasks (space_id, title, sort_key, carry_count, last_carried_at) values ($1, 'x', 'a0', 99, current_date) returning id", [mine]);
      expect((await c.query("select carry_count, last_carried_at from public.tasks where id = $1", [rows[0].id])).rows[0]).toEqual({ carry_count: 0, last_carried_at: null });
      await c.query("update public.tasks set carry_count = 7, assignee_id = $2 where id = $1", [rows[0].id, other]);
      expect((await c.query("select carry_count, assignee_id from public.tasks where id = $1", [rows[0].id])).rows[0]).toEqual({ carry_count: 0, assignee_id: null });
      // The server (postgres here) may.
      await asAdmin(c);
      await c.query("update public.tasks set carry_count = 7 where id = $1", [rows[0].id]);
      expect((await c.query("select carry_count from public.tasks where id = $1", [rows[0].id])).rows[0]).toEqual({ carry_count: 7 });
    }));

  it("Someday, Drop and Archive reset the carry count; nothing else a person writes moves it (20261001000100)", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "hard-carry@contract.test");
      const mine = await spaceOf(c, me);
      const task = async (title: string) =>
        (await c.query<{ id: string }>("insert into public.tasks (space_id, title, sort_key, state, do_date, carry_count) values ($1, $2, 'a0', 'active', current_date - 1, 3) returning id", [mine, title])).rows[0].id;
      const parked = await task("parked");
      const dropped = await task("dropped");
      const archived = await task("archived");
      const moved = await task("moved");
      await asUser(c, me);
      await c.query("update public.tasks set state = 'someday', do_date = null where id = $1", [parked]);
      await c.query("update public.tasks set state = 'dropped' where id = $1", [dropped]);
      await c.query("update public.tasks set state = 'archived', do_date = null where id = $1", [archived]);
      // A plain reschedule (or a client trying its own number) keeps the server's count.
      await c.query("update public.tasks set do_date = current_date + 1, carry_count = 0 where id = $1", [moved]);
      const counts = await c.query<{ title: string; carry_count: number }>("select title, carry_count from public.tasks where id = any($1::uuid[]) order by title", [[parked, dropped, archived, moved]]);
      expect(counts.rows).toEqual([
        { title: "archived", carry_count: 0 },
        { title: "dropped", carry_count: 0 },
        { title: "moved", carry_count: 3 },
        { title: "parked", carry_count: 0 },
      ]);
    }));

  it("blocks: Google's columns are the worker's; a moved synced block still re-queues", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "hard-d@contract.test");
      const mine = await spaceOf(c, me);
      await asUser(c, me);
      const { rows } = await c.query<{ id: string }>("insert into public.time_blocks (space_id, user_id, start_at, end_at, push_state, external_event_id) values ($1, $2, now(), now() + interval '1 hour', 'synced', 'evil') returning id", [mine, me]);
      const id = rows[0].id;
      expect((await c.query("select push_state, external_event_id from public.time_blocks where id = $1", [id])).rows[0]).toEqual({ push_state: "pending", external_event_id: null });
      await asAdmin(c);
      await c.query("select public.time_block_pushed($1, null, 'evt', '\"v1\"')", [id]);
      await asUser(c, me);
      await c.query("update public.time_blocks set end_at = now() + interval '2 hours', push_state = 'synced', external_etag = 'forged' where id = $1", [id]);
      expect((await c.query("select push_state, external_etag from public.time_blocks where id = $1", [id])).rows[0]).toEqual({ push_state: "pending", external_etag: '"v1"' });
    }));

  it("calendars: only the toggles are a person's; the mirror and the account link are not", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "hard-e@contract.test");
      const other = await newUser(c, "hard-f@contract.test");
      const mine = await spaceOf(c, me);
      const acctMine = (await c.query<{ id: string }>("select public.calendar_account_connect($1, 'google', 'g-me', 'me@x', 'cg==', 'YQ==', now() + interval '1 hour', '{}', 1) as id", [me])).rows[0].id;
      const acctOther = (await c.query<{ id: string }>("select public.calendar_account_connect($1, 'google', 'g-other', 'o@x', 'cg==', 'YQ==', now() + interval '1 hour', '{}', 1) as id", [other])).rows[0].id;
      const cal = (await c.query<{ id: string }>("insert into public.calendars (space_id, user_id, calendar_account_id, external_id, summary) values ($1, $2, $3, 'primary', 'Work') returning id", [mine, me, acctMine])).rows[0].id;
      await asUser(c, me);
      await refused(c, "insert into public.calendars (space_id, user_id, calendar_account_id, external_id, summary) values ($1, $2, $3, 'x', 'Theirs')", [mine, me, acctOther]);
      await refused(c, "insert into public.calendar_events (space_id, user_id, calendar_id, external_id) values ($1, $2, $3, 'e')", [mine, me, cal]);
      await refused(c, "delete from public.calendars where id = $1", [cal]);
      await c.query("update public.calendars set read = false, private = true, write_target = true, calendar_account_id = $2, external_id = 'moved', sync_token = 'x' where id = $1", [cal, acctOther]);
      expect((await c.query("select read, private, write_target, calendar_account_id, external_id, sync_token from public.calendars where id = $1", [cal])).rows[0]).toEqual({ read: false, private: true, write_target: true, calendar_account_id: acctMine, external_id: "primary", sync_token: null });
    }));

  it("push subscriptions must point at public https hosts, and twenty is the limit", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "hard-g@contract.test");
      await asUser(c, me);
      const sub = (endpoint: string) => c.query("insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')", [me, endpoint]);
      for (const bad of ["http://fcm.googleapis.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://[::1]/x", "https://intranet/x"]) await refused(c, "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')", [me, bad]);
      for (let i = 0; i < 20; i++) await sub(`https://fcm.googleapis.com/fcm/send/${i}`);
      await refused(c, "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/21', 'k', 'a')", [me]);
    }));

  it("apply_mutations rejects a broken op on its own, keys the ledger per user, and answers a replay honestly", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "hard-h@contract.test");
      const other = await newUser(c, "hard-i@contract.test");
      const mine = await spaceOf(c, me);
      await asUser(c, me);
      const ops = [
        { op: "PUT", table: "tasks", id: "11111111-1111-4111-8111-111111111111", client_id: "c1", data: { space_id: mine, title: "fine", sort_key: "a0" } },
        { op: "PUT", table: "tasks", id: "22222222-2222-4222-8222-222222222222", client_id: "c2", data: { space_id: mine, title: "bad", sort_key: "a0", priority: 99999 } },
        { op: "PATCH", table: "tasks", id: "11111111-1111-4111-8111-111111111111", client_id: "c3", data: { no_such_column: 1 } },
      ];
      const first = (await c.query<{ r: { applied: string[]; rejected: { client_id: string; code: string }[] } }>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(first.applied).toEqual(["c1"]);
      expect(first.rejected.map((x) => x.client_id).sort()).toEqual(["c2", "c3"]);
      // A replay: the good op is still "applied", the bad ones are still rejected — nothing runs twice.
      const again = (await c.query<{ r: { applied: string[]; rejected: { client_id: string; code: string }[] } }>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(again.applied).toEqual(["c1"]);
      expect(again.rejected.map((x) => x.code)).toEqual(["replayed_rejected", "replayed_rejected"]);
      // Another person with the same device id and client ids is not shadowed by my ledger.
      await asAdmin(c);
      const theirs = await spaceOf(c, other);
      await asUser(c, other);
      const res = (await c.query<{ r: { applied: string[] } }>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify([{ op: "PUT", table: "tasks", id: "33333333-3333-4333-8333-333333333333", client_id: "c1", data: { space_id: theirs, title: "theirs", sort_key: "a0" } }])])).rows[0].r;
      expect(res.applied).toEqual(["c1"]);
      expect((await c.query("select count(*)::int as n from public.tasks where id = '33333333-3333-4333-8333-333333333333'")).rows[0].n).toBe(1);
    }));

  it("calendar claims can be scoped to one account, and a release drops only the lock", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "hard-j@contract.test");
      const a = (await c.query<{ id: string }>("select public.calendar_account_connect($1, 'google', 'g-1', 'a@x', 'cg==', 'YQ==', now() + interval '1 hour', '{}', 1) as id", [me])).rows[0].id;
      const b = (await c.query<{ id: string }>("select public.calendar_account_connect($1, 'google', 'g-2', 'b@x', 'cg==', 'YQ==', now() + interval '1 hour', '{}', 1) as id", [me])).rows[0].id;
      expect((await c.query("select id from public.calendar_accounts_claim(null, 10, true, $1)", [b])).rows).toEqual([{ id: b }]);
      // a is untouched and still claimable; b is locked.
      expect((await c.query("select id from public.calendar_accounts_claim($1, 10, true, null)", [me])).rows).toEqual([{ id: a }]);
      await c.query("select public.calendar_account_release($1)", [b]);
      expect((await c.query("select sync_locked_at, last_sync_at from private.calendar_accounts where id = $1", [b])).rows[0]).toEqual({ sync_locked_at: null, last_sync_at: null });
    }));

  it("the private helpers are not executable by people, and the ledger purge is scheduled", async () => {
    const c = admin as Client;
    for (const fn of ["private.apply_one(jsonb)", "private.in_quiet_hours(time, time, time)", "private.next_quiet_end(text, time)", "private.next_occurrence(text, date, date)", "private.is_valid_timezone(text)"]) {
      expect((await c.query("select has_function_privilege('anon', $1, 'execute') as anon", [fn])).rows[0]).toEqual({ anon: false });
    }
    expect((await c.query("select has_function_privilege('authenticated', 'private.in_quiet_hours(time, time, time)', 'execute') as a")).rows[0]).toEqual({ a: false });
    expect((await c.query("select count(*)::int as n from cron.job where jobname = 'sparehour_mutations_purge'")).rows[0]).toEqual({ n: 1 });
  });

  it("the server's own role writes the guarded tables: the guards ask helpers it may run (20261021000200)", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "hard-svc@contract.test", "Europe/London");
      const sid = await spaceOf(c, uid);
      const task = (await c.query<{ id: string }>("insert into public.tasks (space_id, title, sort_key) values ($1, 'svc', 'a0') returning id", [sid])).rows[0].id;
      // The calendar worker updates calendars, routes touch tasks and settings: as service_role, none is refused.
      await c.query("set local role service_role");
      await c.query("update public.user_settings set timezone = timezone where user_id = $1", [uid]);
      await c.query("update public.tasks set title = 'svc2' where id = $1", [task]);
      await asAdmin(c);
      expect((await c.query("select title from public.tasks where id = $1", [task])).rows[0]).toEqual({ title: "svc2" });
      for (const fn of ["private.is_app_user()", "private.is_valid_timezone(text)"]) {
        expect((await c.query("select has_function_privilege('service_role', $1, 'execute') as ok", [fn])).rows[0]).toEqual({ ok: true });
      }
    }));
});

