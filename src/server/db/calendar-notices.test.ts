// Calendar sync states the client shows (migration 20261007231500): the quiet
// "block removed in Google Calendar" note a detach leaves on a block whose task
// is open, that a person may clear and never set; and the mark an account gets
// when its write calendar leaves Google, cleared by choosing another.
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { asAdmin, asUser, inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();
const OWNED = "https://www.googleapis.com/auth/calendar.events.owned";

async function setup(c: Client, email: string): Promise<{ uid: string; sid: string; aid: string; cal: string; task: string; block: string }> {
  const uid = await newUser(c, email);
  const sid = (await c.query<{ s: string }>("select personal_space_id as s from public.users where id = $1", [uid])).rows[0].s;
  const aid = (await c.query<{ id: string }>("select public.calendar_account_connect($1, 'google', 'g', 'me@gmail.com', 'cg==', 'YQ==', now() + interval '1 hour', $2, 1) as id", [uid, [OWNED]])).rows[0].id;
  const cal = (await c.query<{ id: string }>("insert into public.calendars (space_id, user_id, calendar_account_id, external_id, summary, access_role, write_target) values ($1, $2, $3, 'primary', 'Work', 'owner', true) returning id", [sid, uid, aid])).rows[0].id;
  const task = (await c.query<{ id: string }>("insert into public.tasks (space_id, title, state, sort_key) values ($1, 'Draft the proposal', 'active', 'a0') returning id", [sid])).rows[0].id;
  const block = (await c.query<{ id: string }>("insert into public.time_blocks (space_id, user_id, task_id, title, start_at, end_at) values ($1, $2, $3, 'Draft the proposal', '2026-10-07 09:00+00', '2026-10-07 10:00+00') returning id", [sid, uid, task])).rows[0].id;
  return { uid, sid, aid, cal, task, block };
}

const blockRow = async (c: Client, id: string) => (await c.query("select push_state, notice, deleted_at is not null as deleted from public.time_blocks where id = $1", [id])).rows[0];
const lostAt = async (c: Client, aid: string) => (await c.query<{ write_lost_at: string | null }>("select write_lost_at from public.calendar_connections where id = $1", [aid])).rows[0].write_lost_at;

describe.skipIf(admin === null)("calendar notices contract", () => {
  it("a detach leaves the note on an open task's block; a closed task's block, or one already deleted, gets none", () =>
    inTx(admin, async (c) => {
      const open = await setup(c, "n-a@contract.test");
      await c.query("select public.time_block_detached($1)", [open.block]);
      expect(await blockRow(c, open.block)).toMatchObject({ push_state: "detached", deleted: true, notice: "removed_in_google" });

      const done = await setup(c, "n-b@contract.test");
      await c.query("update public.tasks set state = 'done', completed_at = now() where id = $1", [done.task]);
      await c.query("select public.time_block_detached($1)", [done.block]);
      expect(await blockRow(c, done.block)).toMatchObject({ push_state: "detached", deleted: true, notice: null });

      const gone = await setup(c, "n-c@contract.test");
      await c.query("update public.time_blocks set deleted_at = now() where id = $1", [gone.block]);
      await c.query("select public.time_block_detached($1)", [gone.block]);
      expect((await blockRow(c, gone.block)).notice).toBeNull();
    }));

  it("a person may clear the note but never set it, on insert or update", () =>
    inTx(admin, async (c) => {
      const { uid, sid, block } = await setup(c, "n-d@contract.test");
      const other = await setup(c, "n-e@contract.test");
      await c.query("select public.time_block_detached($1)", [block]);

      await asUser(c, uid);
      // Setting it on a live block of one's own is ignored…
      const fresh = (await c.query<{ id: string }>("insert into public.time_blocks (space_id, user_id, title, start_at, end_at, notice) values ($1, $2, 'Mine', '2026-10-07 11:00+00', '2026-10-07 12:00+00', 'removed_in_google') returning id", [sid, uid])).rows[0].id;
      await c.query("update public.time_blocks set notice = 'removed_in_google' where id = $1", [fresh]);
      // …a change to another column keeps the server's note…
      await c.query("update public.time_blocks set title = 'Renamed' where id = $1", [block]);
      await asAdmin(c);
      expect((await blockRow(c, fresh)).notice).toBeNull();
      expect((await blockRow(c, block)).notice).toBe("removed_in_google");

      // …and clearing it is allowed, through the sync path like any upload.
      await asUser(c, uid);
      const ops = [{ op: "PATCH", table: "time_blocks", id: block, client_id: "n1", data: { notice: null } }];
      const res = (await c.query<{ r: { applied: string[]; rejected: unknown[] } }>("select public.apply_mutations('dev-n', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(res.rejected).toEqual([]);
      // Nobody clears someone else's.
      await c.query("update public.time_blocks set notice = null where id = $1", [other.block]);
      await asAdmin(c);
      expect((await blockRow(c, block)).notice).toBeNull();
    }));

  it("the write calendar leaving Google marks its account; choosing a write target again clears the mark", () =>
    inTx(admin, async (c) => {
      const { uid, sid, aid, cal } = await setup(c, "n-f@contract.test");
      const spare = (await c.query<{ id: string }>("insert into public.calendars (space_id, user_id, calendar_account_id, external_id, summary, access_role) values ($1, $2, $3, 'team', 'Team', 'owner') returning id", [sid, uid, aid])).rows[0].id;
      expect(await lostAt(c, aid)).toBeNull();
      // A calendar that is not the write target leaving changes nothing.
      const other = (await c.query<{ id: string }>("insert into public.calendars (space_id, user_id, calendar_account_id, external_id, summary, access_role) values ($1, $2, $3, 'old', 'Old', 'reader') returning id", [sid, uid, aid])).rows[0].id;
      await c.query("update public.calendars set deleted_at = now() where id = $1", [other]);
      expect(await lostAt(c, aid)).toBeNull();

      // The sync engine's soft delete of the write target (store.softDeleteCalendars).
      await c.query("update public.calendars set deleted_at = now(), write_target = false where id = $1", [cal]);
      expect(await lostAt(c, aid)).not.toBeNull();

      // The person picks another in the banner's picker: a client write, as the person.
      await asUser(c, uid);
      await c.query("update public.calendars set write_target = true where id = $1", [spare]);
      await asAdmin(c);
      expect(await lostAt(c, aid)).toBeNull();
    }));
});
