// The push queue's contract (SYSTEM_DESIGN.md §6.5–§6.6, migration
// 20260915000200): what puts a block in the queue, who gets claimed, and
// how the worker's outcomes land — pushed, failed, adopted, detached.
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();
const OWNED = "https://www.googleapis.com/auth/calendar.events.owned";

async function setup(c: Client, email: string, scopes: string[]): Promise<{ uid: string; sid: string; cal: string; block: string }> {
  const uid = await newUser(c, email);
  const sid = (await c.query<{ s: string }>("select personal_space_id as s from public.users where id = $1", [uid])).rows[0].s;
  const aid = (await c.query<{ id: string }>("select public.calendar_account_connect($1, 'google', 'g', 'me@gmail.com', 'cg==', 'YQ==', now() + interval '1 hour', $2, 1) as id", [uid, scopes])).rows[0].id;
  const cal = (await c.query<{ id: string }>("insert into public.calendars (space_id, user_id, calendar_account_id, external_id, summary, access_role, write_target) values ($1, $2, $3, 'primary', 'Work', 'owner', true) returning id", [sid, uid, aid])).rows[0].id;
  const block = (await c.query<{ id: string }>("insert into public.time_blocks (space_id, user_id, title, start_at, end_at) values ($1, $2, 'Deep work', '2026-09-16 09:00+00', '2026-09-16 10:00+00') returning id", [sid, uid])).rows[0].id;
  return { uid, sid, cal, block };
}

const claim = async (c: Client, uid: string | null) => (await c.query("select id, external_calendar_id, title, timezone, deleted, external_event_id from public.time_blocks_claim_push($1, 10)", [uid])).rows;
const state = async (c: Client, id: string) => (await c.query("select push_state, push_attempts, push_error, external_event_id, external_etag, locked, deleted_at is not null as deleted, start_at from public.time_blocks where id = $1", [id])).rows[0];

describe.skipIf(admin === null)("calendar write contract", () => {
  it("a new block is pending and is claimed with its write calendar; pushed marks it synced; a move puts it back; a delete queues the event's removal", () =>
    inTx(admin, async (c) => {
      const { uid, block } = await setup(c, "w-a@contract.test", [OWNED]);
      expect((await state(c, block)).push_state).toBe("pending");
      const [row] = await claim(c, uid);
      expect(row).toMatchObject({ id: block, external_calendar_id: "primary", title: "Deep work", timezone: "UTC", deleted: false, external_event_id: null });
      // Locked for five minutes: not claimed twice.
      expect(await claim(c, uid)).toHaveLength(0);

      await c.query("select public.time_block_pushed($1, (select id from public.calendars where user_id = $2), 'evt1', '\"v1\"')", [block, uid]);
      expect(await state(c, block)).toMatchObject({ push_state: "synced", external_event_id: "evt1", external_etag: '"v1"', push_attempts: 0 });
      expect(await claim(c, uid)).toHaveLength(0);

      // The person moves it (a client write): back in the queue.
      await c.query("update public.time_blocks set end_at = '2026-09-16 10:30+00' where id = $1", [block]);
      expect((await state(c, block)).push_state).toBe("pending");
      // A write that sets push_state itself (the worker) is left alone by the trigger.
      await c.query("update public.time_blocks set end_at = '2026-09-16 11:00+00', push_state = 'synced' where id = $1", [block]);
      expect((await state(c, block)).push_state).toBe("synced");
      // A cosmetic column does not re-queue.
      await c.query("update public.time_blocks set locked = true where id = $1", [block]);
      expect((await state(c, block)).push_state).toBe("synced");

      // Deleting a synced block queues the removal; the claim says so.
      await c.query("update public.time_blocks set deleted_at = now() where id = $1", [block]);
      expect((await state(c, block)).push_state).toBe("pending");
      const [gone] = await claim(c, uid);
      expect(gone).toMatchObject({ id: block, deleted: true, external_event_id: "evt1" });
    }));

  it("only people with a writable write calendar are claimed; a never-written block that is deleted needs nothing", () =>
    inTx(admin, async (c) => {
      const readOnly = await setup(c, "w-b@contract.test", ["https://www.googleapis.com/auth/calendar.events.readonly"]);
      expect(await claim(c, readOnly.uid)).toHaveLength(0);
      const noTarget = await setup(c, "w-c@contract.test", [OWNED]);
      await c.query("update public.calendars set write_target = false where user_id = $1", [noTarget.uid]);
      expect(await claim(c, noTarget.uid)).toHaveLength(0);
      const fine = await setup(c, "w-d@contract.test", [OWNED]);
      expect((await claim(c, null)).map((r) => r.id)).toEqual([fine.block]);
      await c.query("update public.time_blocks set deleted_at = now() where id = $1", [fine.block]);
      expect((await state(c, fine.block)).push_state).toBe("local");
    }));

  it("failures count up to eight, then the block rests; adopt takes Google's times and locks; detach soft-deletes", () =>
    inTx(admin, async (c) => {
      const { uid, block } = await setup(c, "w-e@contract.test", [OWNED]);
      for (let i = 0; i < 8; i++) {
        await c.query("update public.time_blocks set push_locked_at = null where id = $1", [block]);
        expect(await claim(c, uid)).toHaveLength(1);
        await c.query("select public.time_block_push_failed($1, 'google events.insert: 503')", [block]);
      }
      expect(await state(c, block)).toMatchObject({ push_state: "failed", push_attempts: 8, push_error: "google events.insert: 503" });
      expect(await claim(c, uid)).toHaveLength(0);

      await c.query("select public.time_block_adopt($1, '2026-09-16 14:00+00', '2026-09-16 15:00+00', 'Renamed in Google', '\"v9\"')", [block]);
      const adopted = await state(c, block);
      expect(adopted).toMatchObject({ push_state: "synced", locked: true, external_etag: '"v9"', push_attempts: 0 });
      expect(new Date(adopted.start_at).toISOString()).toBe("2026-09-16T14:00:00.000Z");
      expect((await c.query("select title from public.time_blocks where id = $1", [block])).rows[0].title).toBe("Renamed in Google");

      await c.query("select public.time_block_etag($1, '\"v10\"')", [block]);
      expect((await state(c, block)).external_etag).toBe('"v10"');

      await c.query("select public.time_block_detached($1)", [block]);
      expect(await state(c, block)).toMatchObject({ push_state: "detached", deleted: true });
      expect(await claim(c, uid)).toHaveLength(0);
    }));
});
