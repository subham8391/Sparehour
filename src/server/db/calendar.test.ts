// Calendar sync migration contract (SYSTEM_DESIGN.md §6, migration
// 20260915000100): the service-role functions round-trip an account without
// the database ever holding a plain token, the client-visible mirror follows,
// RLS keeps connections read-only and private, and disconnect keeps the
// mirror seven days.
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();
const B64 = { refresh: Buffer.from("sealed-refresh").toString("base64"), access: Buffer.from("sealed-access").toString("base64") };

async function connect(c: Client, uid: string, external = "g-1"): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select public.calendar_account_connect($1, 'google', $2, 'sam@gmail.com', $3, $4, now() + interval '1 hour', array['https://www.googleapis.com/auth/calendar.events.readonly'], 1) as id", [uid, external, B64.refresh, B64.access]);
  return rows[0].id;
}

/** A statement that must be refused; the savepoint keeps the transaction usable afterwards. */
async function denied(c: Client, sql: string): Promise<void> {
  await c.query("savepoint expect_denied");
  await expect(c.query(sql)).rejects.toThrow(/permission denied/);
  await c.query("rollback to savepoint expect_denied");
}

async function asUser(c: Client, uid: string): Promise<void> {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
}

describe.skipIf(admin === null)("calendar sync contract", () => {
  it("connect seals an account and mirrors a connection; claim hands the ciphertext back once; finish records the outcome for the client", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "cal-a@contract.test");
      const aid = await connect(c, uid);
      const acct = (await c.query("select status, email, encode(refresh_token_enc, 'base64') as r, key_version, sync_requested_at from private.calendar_accounts where id = $1", [aid])).rows[0];
      expect(acct).toMatchObject({ status: "ok", email: "sam@gmail.com", r: B64.refresh, key_version: 1 });
      expect(acct.sync_requested_at).toBeNull();
      expect((await c.query("select status, email, can_write, can_read_titles, can_write_own from public.calendar_connections where id = $1", [aid])).rows[0]).toEqual({ status: "ok", email: "sam@gmail.com", can_write: false, can_read_titles: true, can_write_own: false });

      const claimed = (await c.query("select id, refresh_b64, access_b64, status from public.calendar_accounts_claim($1, 5, false)", [uid])).rows;
      expect(claimed).toEqual([{ id: aid, refresh_b64: B64.refresh, access_b64: B64.access, status: "ok" }]);
      // Claimed rows are locked for ten minutes: a second worker gets nothing.
      expect((await c.query("select id from public.calendar_accounts_claim($1, 5, false)", [uid])).rows).toHaveLength(0);
      // …unless forced (Sync now).
      expect((await c.query("select id from public.calendar_accounts_claim($1, 5, true)", [uid])).rows).toHaveLength(0);
      await c.query("update private.calendar_accounts set sync_locked_at = now() - interval '11 minutes' where id = $1", [aid]);
      expect((await c.query("select id from public.calendar_accounts_claim($1, 5, false)", [uid])).rows).toHaveLength(1);

      await c.query("select public.calendar_account_finish($1, 'ok', null)", [aid]);
      const done = (await c.query("select last_sync_at, sync_locked_at, status from private.calendar_accounts where id = $1", [aid])).rows[0];
      expect(done.sync_locked_at).toBeNull();
      expect(done.last_sync_at).not.toBeNull();
      // Freshly synced: not due again for an hour.
      expect((await c.query("select id from public.calendar_accounts_claim($1, 5, false)", [uid])).rows).toHaveLength(0);

      await c.query("select public.calendar_account_finish($1, 'needs_reauth', 'lapsed')", [aid]);
      expect((await c.query("select status, last_error from public.calendar_connections where id = $1", [aid])).rows[0]).toEqual({ status: "needs_reauth", last_error: "lapsed" });
      // A lapsed account is not reclaimed by the reconcile, only by a forced sync after reconnecting.
      expect((await c.query("select id from public.calendar_accounts_claim($1, 5, false)", [uid])).rows).toHaveLength(0);

      // Reconnecting keeps the refresh token when the new grant has none, and clears the error.
      await c.query("select public.calendar_account_connect($1, 'google', 'g-1', 'sam@gmail.com', null, $2, now() + interval '1 hour', array['https://www.googleapis.com/auth/calendar.events.owned'], 1)", [uid, B64.access]);
      const again = (await c.query("select encode(refresh_token_enc, 'base64') as r, status, scopes from private.calendar_accounts where id = $1", [aid])).rows[0];
      expect(again.r).toBe(B64.refresh);
      expect(again.status).toBe("ok");
      expect(again.scopes).toHaveLength(2);
      // Scopes accumulate, so the account now reads titles and writes to the person's own calendars.
      expect((await c.query("select status, can_write, can_read_titles, can_write_own from public.calendar_connections where id = $1", [aid])).rows[0]).toEqual({ status: "ok", can_write: true, can_read_titles: true, can_write_own: true });
    }));

  it("the default connect (busy times, then the app-created calendar) tells the client it reads no titles and writes only to its own calendar (DECISIONS.md, 2026-10-21)", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "cal-busy@contract.test");
      const busy = ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events.freebusy"];
      const { rows } = await c.query<{ id: string }>("select public.calendar_account_connect($1, 'google', 'g-busy', 'sam@gmail.com', $2, $3, now() + interval '1 hour', $4, 1) as id", [uid, B64.refresh, B64.access, busy]);
      const aid = rows[0].id;
      expect((await c.query("select can_write, can_read_titles, can_write_own from public.calendar_connections where id = $1", [aid])).rows[0]).toEqual({ can_write: false, can_read_titles: false, can_write_own: false });
      await c.query("select public.calendar_account_connect($1, 'google', 'g-busy', 'sam@gmail.com', null, $2, now() + interval '1 hour', array['https://www.googleapis.com/auth/calendar.app.created'], 1)", [uid, B64.access]);
      expect((await c.query("select can_write, can_read_titles, can_write_own from public.calendar_connections where id = $1", [aid])).rows[0]).toEqual({ can_write: true, can_read_titles: false, can_write_own: false });
    }));

  it("a person reads only their own connections and cannot write them; the private table is out of reach", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "cal-b@contract.test");
      const other = await newUser(c, "cal-c@contract.test");
      await connect(c, me);
      await connect(c, other, "g-2");
      await asUser(c, me);
      const mine = (await c.query("select email from public.calendar_connections")).rows;
      expect(mine).toEqual([{ email: "sam@gmail.com" }]);
      await denied(c, "update public.calendar_connections set status = 'revoked'");
      await denied(c, "insert into public.calendar_connections (id, space_id, user_id, provider) select id, space_id, user_id, provider from public.calendar_connections");
      await denied(c, "select * from private.calendar_accounts");
      await denied(c, "select public.calendar_accounts_claim(null, 5, true)");
    }));

  it("disconnect returns the sealed refresh token, drops the account and its connection, and soft-deletes the mirror", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "cal-d@contract.test");
      const sid = (await c.query<{ s: string }>("select personal_space_id as s from public.users where id = $1", [uid])).rows[0].s;
      const aid = await connect(c, uid);
      const cal = (await c.query<{ id: string }>("insert into public.calendars (space_id, user_id, calendar_account_id, external_id, summary, write_target) values ($1, $2, $3, 'primary', 'Work', true) returning id", [sid, uid, aid])).rows[0].id;
      await c.query("insert into public.calendar_events (space_id, user_id, calendar_id, external_id, summary, start_at, end_at) values ($1, $2, $3, 'e1', 'Standup', now(), now() + interval '30 minutes')", [sid, uid, cal]);
      expect((await c.query("select private from public.calendars where id = $1", [cal])).rows[0]).toEqual({ private: false });

      await expect(c.query("select public.calendar_account_disconnect($1, $2) as t", [aid, "00000000-0000-0000-0000-000000000000"])).resolves.toMatchObject({ rows: [{ t: null }] });
      const { rows } = await c.query("select public.calendar_account_disconnect($1, $2) as t", [aid, uid]);
      expect(rows[0].t).toBe(B64.refresh);
      expect((await c.query("select deleted_at is not null as gone, status, refresh_token_enc is null as forgot from private.calendar_accounts where id = $1", [aid])).rows[0]).toEqual({ gone: true, status: "revoked", forgot: true });
      expect((await c.query("select count(*)::int as n from public.calendar_connections where id = $1", [aid])).rows[0].n).toBe(0);
      // Disconnected accounts are never claimed, and a second disconnect finds nothing.
      expect((await c.query("select id from public.calendar_accounts_claim($1, 5, true)", [uid])).rows).toHaveLength(0);
      expect((await c.query("select public.calendar_account_disconnect($1, $2) as t", [aid, uid])).rows[0].t).toBeNull();
      expect((await c.query("select deleted_at is not null as gone, write_target from public.calendars where id = $1", [cal])).rows[0]).toEqual({ gone: true, write_target: false });
      expect((await c.query("select deleted_at is not null as gone from public.calendar_events where calendar_id = $1", [cal])).rows[0]).toEqual({ gone: true });
      // The purge leaves a fresh soft delete alone.
      await c.query("select private.calendar_purge_deleted()");
      expect((await c.query("select count(*)::int as n from public.calendar_events where calendar_id = $1", [cal])).rows[0].n).toBe(1);
      // Reconnecting within the week brings the same account back, with fresh tokens.
      expect(await connect(c, uid)).toBe(aid);
      expect((await c.query("select deleted_at, status from private.calendar_accounts where id = $1", [aid])).rows[0]).toEqual({ deleted_at: null, status: "ok" });
      expect((await c.query("select status from public.calendar_connections where id = $1", [aid])).rows[0]).toEqual({ status: "ok" });
      // A week later the purge takes what was not reconnected.
      await c.query("update private.calendar_accounts set deleted_at = now() - interval '8 days' where id = $1", [aid]);
      await c.query("update public.calendar_events set deleted_at = now() - interval '8 days' where calendar_id = $1", [cal]);
      await c.query("select private.calendar_purge_deleted()");
      expect((await c.query("select count(*)::int as n from private.calendar_accounts where id = $1", [aid])).rows[0].n).toBe(0);
    }));

  it("the reconcile and purge schedules exist", async () => {
    const { rows } = await (admin as Client).query("select jobname, schedule from cron.job where jobname in ('sparehour_calendar_tick', 'sparehour_calendar_purge') order by jobname");
    expect(rows).toEqual([
      { jobname: "sparehour_calendar_purge", schedule: "15 3 * * *" },
      { jobname: "sparehour_calendar_tick", schedule: "7,37 * * * *" },
    ]);
  });
});
