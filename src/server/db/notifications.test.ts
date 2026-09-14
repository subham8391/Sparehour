// Notifications against the real database (SYSTEM_DESIGN.md §7.4–7.5):
// materialisation in the user's zone, reconciliation when a source moves or
// closes, the claim rules (quiet hours, already planned) and the delivery
// verdicts. Every test rolls back.
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asUser, inTx as inTxOn, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();
const inTx = (fn: (c: Client) => Promise<void>) => inTxOn(admin, fn);

const materialise = (c: Client) => c.query("select private.materialise_notifications()");
const rows = async (c: Client, uid: string, kind?: string) =>
  (
    await c.query<{ id: string; kind: string; entity_id: string | null; status: string; fire_at: string; local_time: string; dedupe_key: string; payload: { notification: { title: string; body: string; navigate: string }; sh: { kind: string; actions: string[] } } }>(
      `select id, kind, entity_id, status, fire_at::text, local_time::text, dedupe_key, payload from private.scheduled_notifications where user_id = $1 and ($2::text is null or kind = $2) order by fire_at`,
      [uid, kind ?? null],
    )
  ).rows;

async function localToday(c: Client, uid: string): Promise<string> {
  const { rows } = await c.query<{ d: string }>("select to_char(timezone(s.timezone, now())::date, 'YYYY-MM-DD') as d from public.user_settings s where s.user_id = $1", [uid]);
  return rows[0].d;
}

async function addTask(c: Client, sid: string, title: string, over: { deadline?: string; doDate?: string | null; estimate?: number; state?: string } = {}): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.tasks (space_id, title, state, do_date, deadline, estimate_min, sort_key) values ($1, $2, $3, $4::date, $5::date, $6, 'a0') returning id`,
    [sid, title, over.state ?? "active", over.doDate ?? null, over.deadline ?? null, over.estimate ?? null],
  );
  return rows[0].id;
}

async function addBlock(c: Client, sid: string, uid: string, taskId: string | null, startsInMinutes: number, lengthMinutes = 45, title: string | null = null): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.time_blocks (space_id, user_id, task_id, title, start_at, end_at, push_state)
     values ($1, $2, $3, $4, now() + make_interval(mins => $5), now() + make_interval(mins => $5 + $6), 'local') returning id`,
    [sid, uid, taskId, title, startsInMinutes, lengthMinutes],
  );
  return rows[0].id;
}

/** Every weekday a working day, so the nudge tests do not depend on what day it is. */
async function workEveryDay(c: Client, sid: string, uid: string): Promise<void> {
  await c.query(`delete from public.work_hours where user_id = $1`, [uid]);
  await c.query(`insert into public.work_hours (space_id, user_id, weekday, start_time, end_time) select $1, $2, d, '09:00', '18:00' from generate_series(0, 6) d`, [sid, uid]);
}

afterAll(async () => {
  await admin?.end();
});

describe.skipIf(admin === null)("materialise_notifications", () => {
  it("a block start is scheduled at the block's start with the task's words, and re-running changes nothing", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "notif-a@contract.test", "Europe/London");
      const sid = await spaceOf(c, uid);
      const task = await addTask(c, sid, "Draft the proposal");
      const block = await addBlock(c, sid, uid, task, 120, 45);
      await materialise(c);
      const first = await rows(c, uid, "block_start");
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({ entity_id: block, status: "pending" });
      expect(first[0].payload.notification.title).toBe("Draft the proposal");
      expect(first[0].payload.notification.body).toMatch(/^\d\d:\d\d–\d\d:\d\d · 45m · starts now$/);
      expect(first[0].payload.notification.navigate).toBe(`/today?src=push&kind=block_start&task=${task}&block=${block}`);
      expect(first[0].payload.sh).toMatchObject({ kind: "block_start", actions: ["start", "snooze", "plan"] });
      const fire = await c.query<{ same: boolean }>("select n.fire_at = b.start_at as same from private.scheduled_notifications n join public.time_blocks b on b.id = n.entity_id where n.id = $1", [first[0].id]);
      expect(fire.rows[0].same).toBe(true);
      await materialise(c);
      expect(await rows(c, uid, "block_start")).toHaveLength(1);
    }));

  it("a moved block moves its notification; a removed block or a completed task cancels it; the switch cancels all", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "notif-b@contract.test");
      const sid = await spaceOf(c, uid);
      const t1 = await addTask(c, sid, "One");
      const t2 = await addTask(c, sid, "Two");
      const t3 = await addTask(c, sid, "Three");
      const b1 = await addBlock(c, sid, uid, t1, 60);
      const b2 = await addBlock(c, sid, uid, t2, 90);
      const b3 = await addBlock(c, sid, uid, t3, 120);
      await materialise(c);
      expect(await rows(c, uid, "block_start")).toHaveLength(3);

      await c.query("update public.time_blocks set start_at = start_at + interval '30 minutes', end_at = end_at + interval '30 minutes' where id = $1", [b1]);
      await c.query("update public.time_blocks set deleted_at = now() where id = $1", [b2]);
      await c.query("update public.tasks set state = 'done', completed_at = now() where id = $1", [t3]);
      await materialise(c);
      const after = await rows(c, uid, "block_start");
      const byBlock = Object.fromEntries(after.map((r) => [r.entity_id, r]));
      expect(byBlock[b1].status).toBe("pending");
      const moved = await c.query<{ same: boolean }>("select n.fire_at = b.start_at as same from private.scheduled_notifications n join public.time_blocks b on b.id = n.entity_id where n.id = $1", [byBlock[b1].id]);
      expect(moved.rows[0].same).toBe(true);
      expect(byBlock[b2].status).toBe("cancelled");
      expect(byBlock[b3].status).toBe("cancelled");

      await c.query("update public.user_settings set notify_block_start = false where user_id = $1", [uid]);
      await materialise(c);
      expect((await rows(c, uid, "block_start")).every((r) => r.status === "cancelled")).toBe(true);
    }));

  it("deadlines: 17:00 local the day before and the morning nudge on the day; a changed deadline replaces the rows", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "notif-c@contract.test", "Asia/Kolkata");
      const sid = await spaceOf(c, uid);
      const today = await localToday(c, uid);
      const inTwo = (await c.query<{ d: string }>("select to_char($1::date + 2, 'YYYY-MM-DD') as d", [today])).rows[0].d;
      const tomorrow = (await c.query<{ d: string }>("select to_char($1::date + 1, 'YYYY-MM-DD') as d", [today])).rows[0].d;
      const task = await addTask(c, sid, "Send the invoice", { deadline: inTwo, estimate: 20 });
      await materialise(c);
      const eve = (await rows(c, uid, "deadline_eve"))[0];
      expect(eve).toMatchObject({ entity_id: task, status: "pending", local_time: "17:00:00" });
      expect(eve.dedupe_key.endsWith(`:${tomorrow}`)).toBe(true);
      expect(eve.payload.notification.title).toBe("Due tomorrow: Send the invoice");
      expect(eve.payload.notification.body).toBe("Not planned yet — want to put it somewhere?");
      const local = await c.query<{ l: string }>("select to_char(timezone('Asia/Kolkata', fire_at), 'YYYY-MM-DD HH24:MI') as l from private.scheduled_notifications where id = $1", [eve.id]);
      expect(local.rows[0].l).toBe(`${tomorrow} 17:00`);

      // The day-of row lands at the morning nudge; with a deadline in two days it may sit past the 48h horizon, so bring it in.
      await c.query("update public.tasks set deadline = $2::date, do_date = $2::date where id = $1", [task, tomorrow]);
      await materialise(c);
      const day = (await rows(c, uid, "deadline_day")).find((r) => r.status === "pending")!;
      expect(day.local_time).toBe("08:30:00");
      expect(day.payload.notification.title).toBe("Due today: Send the invoice");
      expect(day.payload.notification.body).toBe("~20m · planned for today");
      // The old eve row (for the day before the original deadline) is gone; a new one may exist if 17:00 today is still ahead.
      const eves = await rows(c, uid, "deadline_eve");
      expect(eves.find((r) => r.id === eve.id)?.status).toBe("cancelled");
      expect(eves.filter((r) => r.status === "pending").every((r) => r.dedupe_key.endsWith(`:${today}`))).toBe(true);
    }));

  it("the morning nudge is scheduled on working days at the nudge time, once per day; the shutdown nudge only when set", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "notif-d@contract.test", "America/New_York");
      const sid = await spaceOf(c, uid);
      await workEveryDay(c, sid, uid);
      const today = await localToday(c, uid);
      const tomorrow = (await c.query<{ d: string }>("select to_char($1::date + 1, 'YYYY-MM-DD') as d", [today])).rows[0].d;
      await materialise(c);
      const mornings = await rows(c, uid, "morning");
      expect(mornings.some((r) => r.dedupe_key === `${uid}:morning::${tomorrow}`)).toBe(true);
      expect(mornings.every((r) => r.local_time === "08:30:00" && r.payload.notification.title === "Good morning.")).toBe(true);
      expect(await rows(c, uid, "shutdown")).toHaveLength(0);
      await materialise(c);
      expect(await rows(c, uid, "morning")).toHaveLength(mornings.length);

      await c.query("update public.user_settings set notify_shutdown = true, shutdown_nudge_time = '17:30', morning_nudge_time = '07:45' where user_id = $1", [uid]);
      await materialise(c);
      const shutdowns = await rows(c, uid, "shutdown");
      expect(shutdowns.some((r) => r.dedupe_key === `${uid}:shutdown::${tomorrow}` && r.local_time === "17:30:00")).toBe(true);
      expect((await rows(c, uid, "morning")).filter((r) => r.status === "pending").every((r) => r.local_time === "07:45:00")).toBe(true);

      await c.query("delete from public.work_hours where user_id = $1", [uid]);
      await c.query("update public.user_settings set notify_morning = false where user_id = $1", [uid]);
      await materialise(c);
      expect((await rows(c, uid, "morning")).every((r) => r.status === "cancelled")).toBe(true);
    }));

  it("the schedules exist", async () => {
    const { rows } = await (admin as Client).query("select jobname, schedule, command from cron.job where jobname in ('sparehour_notifications', 'sparehour_push_tick') order by jobname");
    expect(rows).toEqual([
      { jobname: "sparehour_notifications", schedule: "*/5 * * * *", command: "select private.materialise_notifications()" },
      { jobname: "sparehour_push_tick", schedule: "* * * * *", command: "select private.push_tick()" },
    ]);
  });
});

describe.skipIf(admin === null)("claim_due_notifications", () => {
  async function due(c: Client, uid: string, kind: string, minutesAgo = 1): Promise<string> {
    const { rows } = await c.query<{ id: string }>(
      `insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
       select $1::uuid, $2::text, null, now() - make_interval(mins => $3::int), '09:00', s.timezone, $1::text || ':' || $2::text || '::' || gen_random_uuid(), '{"web_push":8030,"notification":{"title":"x","body":"y","navigate":"/today"},"sh":{"kind":"x","actions":[]}}'::jsonb
         from public.user_settings s where s.user_id = $1::uuid returning id`,
      [uid, kind, minutesAgo],
    );
    return rows[0].id;
  }
  const status = async (c: Client, id: string) => (await c.query<{ status: string; attempts: number }>("select status, attempts from private.scheduled_notifications where id = $1", [id])).rows[0];
  const quietNow = (c: Client, uid: string, on: boolean) =>
    c.query(
      on
        ? "update public.user_settings s set quiet_hours_start = (timezone(s.timezone, now()) - interval '1 hour')::time, quiet_hours_end = (timezone(s.timezone, now()) + interval '1 hour')::time where user_id = $1"
        : "update public.user_settings set quiet_hours_start = null, quiet_hours_end = null where user_id = $1",
      [uid],
    );

  it("returns what is due, marks it sent, and leaves the future alone", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "claim-a@contract.test");
      await quietNow(c, uid, false);
      const now = await due(c, uid, "block_start");
      const later = await due(c, uid, "deadline_eve", -60);
      const { rows } = await c.query<{ id: string; kind: string }>("select id, kind from private.claim_due_notifications(10)");
      expect(rows.map((r) => r.id)).toEqual([now]);
      expect(await status(c, now)).toEqual({ status: "sent", attempts: 1 });
      expect((await status(c, later)).status).toBe("pending");
      expect((await c.query("select id from private.claim_due_notifications(10)")).rows).toHaveLength(0);
    }));

  it("inside quiet hours a block start is skipped and a deadline waits until they end", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "claim-b@contract.test");
      await quietNow(c, uid, true);
      const block = await due(c, uid, "block_start");
      const deadline = await due(c, uid, "deadline_day");
      const { rows } = await c.query("select id from private.claim_due_notifications(10)");
      expect(rows).toHaveLength(0);
      expect((await status(c, block)).status).toBe("skipped_quiet");
      expect((await status(c, deadline)).status).toBe("pending");
      const deferred = await c.query<{ ahead: boolean; local: string }>(
        "select n.fire_at > now() as ahead, to_char(timezone(s.timezone, n.fire_at), 'HH24:MI') as local from private.scheduled_notifications n join public.user_settings s on s.user_id = n.user_id where n.id = $1",
        [deadline],
      );
      const end = await c.query<{ l: string }>("select to_char(quiet_hours_end, 'HH24:MI') as l from public.user_settings where user_id = $1", [uid]);
      expect(deferred.rows[0].ahead).toBe(true);
      expect(deferred.rows[0].local).toBe(end.rows[0].l);
    }));

  it("a morning nudge for a day already planned, or a shutdown nudge for a day already closed, is cancelled", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "claim-c@contract.test");
      const sid = await spaceOf(c, uid);
      await quietNow(c, uid, false);
      const today = await localToday(c, uid);
      await c.query("insert into public.day_plans (space_id, user_id, date, planned_at, shutdown_at) values ($1, $2, $3::date, now(), now())", [sid, uid, today]);
      const morning = await due(c, uid, "morning");
      const shutdown = await due(c, uid, "shutdown");
      const open = await due(c, uid, "deadline_eve");
      const { rows } = await c.query<{ id: string }>("select id from private.claim_due_notifications(10)");
      expect(rows.map((r) => r.id)).toEqual([open]);
      expect((await status(c, morning)).status).toBe("cancelled");
      expect((await status(c, shutdown)).status).toBe("cancelled");
    }));

  it("delivery verdicts: 410 retires the subscription, success resets its failures, a retry hands the row back three times at most", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "claim-d@contract.test");
      await quietNow(c, uid, false);
      const n = await due(c, uid, "block_start");
      const sub = (await c.query<{ id: string }>("insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, failure_count) values ($1, 'https://push.test/1', 'k', 'a', 2) returning id", [uid])).rows[0].id;
      await c.query("select id from private.claim_due_notifications(10)");
      await c.query("select private.record_notification_delivery($1, $2, 201, null)", [n, sub]);
      let s = (await c.query<{ failure_count: number; deleted_at: string | null; last_success_at: string | null }>("select failure_count, deleted_at, last_success_at from public.push_subscriptions where id = $1", [sub])).rows[0];
      expect(s.failure_count).toBe(0);
      expect(s.last_success_at).not.toBeNull();
      await c.query("select private.record_notification_delivery($1, $2, 503, 'busy')", [n, sub]);
      s = (await c.query("select failure_count, deleted_at, last_success_at from public.push_subscriptions where id = $1", [sub])).rows[0];
      expect(s.failure_count).toBe(1);
      await c.query("select private.record_notification_delivery($1, $2, 410, 'gone')", [n, sub]);
      s = (await c.query("select failure_count, deleted_at, last_success_at from public.push_subscriptions where id = $1", [sub])).rows[0];
      expect(s.deleted_at).not.toBeNull();
      expect((await c.query("select count(*)::int as n from private.notification_deliveries where notification_id = $1", [n])).rows[0].n).toBe(3);

      await c.query("select private.finish_notification($1, 'retry')", [n]);
      expect((await status(c, n)).status).toBe("pending");
      await c.query("update private.scheduled_notifications set fire_at = now() - interval '1 minute' where id = $1", [n]);
      await c.query("select id from private.claim_due_notifications(10)");
      await c.query("select private.finish_notification($1, 'retry')", [n]);
      await c.query("update private.scheduled_notifications set fire_at = now() - interval '1 minute' where id = $1", [n]);
      await c.query("select id from private.claim_due_notifications(10)");
      await c.query("select private.finish_notification($1, 'retry')", [n]);
      expect(await status(c, n)).toEqual({ status: "failed", attempts: 3 });
    }));

  it("the service wrappers are for the service role only; a signed-in user cannot claim, and only sees their own subscriptions", () =>
    inTx(async (c) => {
      const a = await newUser(c, "claim-e@contract.test");
      const b = await newUser(c, "claim-f@contract.test");
      await c.query("insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.test/a', 'k', 'a'), ($2, 'https://push.test/b', 'k', 'a')", [a, b]);
      await c.query("savepoint s1");
      await asUser(c, a);
      const mine = await c.query<{ endpoint: string }>("select endpoint from public.push_subscriptions");
      expect(mine.rows.map((r) => r.endpoint)).toEqual(["https://push.test/a"]);
      await expect(c.query("select * from public.claim_due_notifications(10)")).rejects.toThrow(/permission denied/);
      await c.query("rollback to savepoint s1");
    }));
});
