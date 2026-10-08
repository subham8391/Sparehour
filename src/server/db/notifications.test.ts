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

/**
 * The person's today as the server counts it: their zone, less the day-rollover hour (before four it is still
 * yesterday). `calendar` gives the plain date in their zone instead, the day a nudge firing now belongs to.
 */
async function localToday(c: Client, uid: string, calendar = false): Promise<string> {
  const { rows } = await c.query<{ d: string }>(
    "select to_char((timezone(s.timezone, now()) - make_interval(hours => case when $2 then 0 else s.day_rollover_hour end))::date, 'YYYY-MM-DD') as d from public.user_settings s where s.user_id = $1",
    [uid, calendar],
  );
  return rows[0].d;
}

/** The person's day as the badge and the day context count it: their zone less the rollover hour (private.local_today),
 *  so before 04:00 local it is the calendar's yesterday. */
async function appToday(c: Client, uid: string): Promise<string> {
  const { rows } = await c.query<{ d: string }>("select to_char(private.local_today($1), 'YYYY-MM-DD') as d", [uid]);
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
      // At the start (no lead) the body is the slot and its length; "starts in" is only for a lead.
      expect(first[0].payload.notification.body).toMatch(/^\d\d:\d\d–\d\d:\d\d · 45m$/);
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

      // The day-of row lands at the morning time; with a deadline in two days it may sit past the 48h horizon, so bring it in.
      // No working hours on that day: the 08:30 fallback.
      await c.query("delete from public.work_hours where user_id = $1", [uid]);
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

  it("the morning nudge is scheduled on working days at the first segment's start, once per day; the shutdown nudge only when on", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "notif-d@contract.test", "America/New_York");
      const sid = await spaceOf(c, uid);
      await workEveryDay(c, sid, uid);
      const today = await localToday(c, uid);
      const tomorrow = (await c.query<{ d: string }>("select to_char($1::date + 1, 'YYYY-MM-DD') as d", [today])).rows[0].d;
      await materialise(c);
      const mornings = await rows(c, uid, "morning");
      expect(mornings.some((r) => r.dedupe_key === `${uid}:morning::${tomorrow}`)).toBe(true);
      expect(mornings.every((r) => r.local_time === "09:00:00" && r.payload.notification.title === "Good morning.")).toBe(true);
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

  it("a lead time moves the block reminder ahead of the start and says so; changing it re-times the pending row", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "notif-lead@contract.test", "Europe/London");
      const sid = await spaceOf(c, uid);
      const task = await addTask(c, sid, "Review the deck");
      const block = await addBlock(c, sid, uid, task, 120, 45);
      await materialise(c);
      const offset = async () =>
        (await c.query<{ m: number }>("select round(extract(epoch from (b.start_at - n.fire_at)) / 60)::int as m from private.scheduled_notifications n join public.time_blocks b on b.id = n.entity_id where n.entity_id = $1 and n.status = 'pending'", [block])).rows[0]?.m;
      expect(await offset()).toBe(0);
      await c.query("update public.user_settings set block_start_lead_min = 10 where user_id = $1", [uid]);
      await materialise(c);
      const [row] = await rows(c, uid, "block_start");
      expect(row.status).toBe("pending");
      expect(await offset()).toBe(10);
      expect(row.payload.notification.body).toMatch(/^\d\d:\d\d–\d\d:\d\d · 45m · starts in 10m$/);
      const local = await c.query<{ same: boolean }>("select n.local_time = (timezone('Europe/London', n.fire_at))::time as same from private.scheduled_notifications n where n.id = $1", [row.id]);
      expect(local.rows[0].same).toBe(true);
      // Only the four choices Settings offers.
      await c.query("savepoint lead");
      await expect(c.query("update public.user_settings set block_start_lead_min = 7 where user_id = $1", [uid])).rejects.toThrow(/block_start_lead_check/);
      await c.query("rollback to savepoint lead");
    }));

  it("with no custom times the nudges follow working hours, and editing the hours re-times the pending rows", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "notif-derive@contract.test", "Europe/Berlin");
      const sid = await spaceOf(c, uid);
      await workEveryDay(c, sid, uid);
      await c.query("update public.user_settings set notify_shutdown = true where user_id = $1", [uid]);
      const today = await localToday(c, uid);
      const tomorrow = (await c.query<{ d: string }>("select to_char($1::date + 1, 'YYYY-MM-DD') as d", [today])).rows[0].d;
      const weekday = (await c.query<{ w: number }>("select extract(isodow from $1::date)::int - 1 as w", [tomorrow])).rows[0].w;
      const forTomorrow = async (kind: string) => (await rows(c, uid, kind)).filter((r) => r.dedupe_key.endsWith(`:${tomorrow}`));
      await materialise(c);
      expect((await forTomorrow("morning")).map((r) => [r.status, r.local_time])).toEqual([["pending", "09:00:00"]]);
      expect((await forTomorrow("shutdown")).map((r) => [r.status, r.local_time])).toEqual([["pending", "17:30:00"]]);

      // A split day: 10:00–12:30 and 13:30–19:00. The morning moves to the first start, the shutdown to 30 min before the last end.
      await c.query("delete from public.work_hours where user_id = $1 and weekday = $2", [uid, weekday]);
      await c.query("insert into public.work_hours (space_id, user_id, weekday, start_time, end_time) values ($1, $2, $3, '10:00', '12:30'), ($1, $2, $3, '13:30', '19:00')", [sid, uid, weekday]);
      await materialise(c);
      expect((await forTomorrow("morning")).map((r) => [r.status, r.local_time])).toEqual([["pending", "10:00:00"]]);
      expect((await forTomorrow("shutdown")).map((r) => [r.status, r.local_time])).toEqual([["pending", "18:30:00"]]);
      const local = await c.query<{ l: string }>(
        "select to_char(timezone('Europe/Berlin', fire_at), 'YYYY-MM-DD HH24:MI') as l from private.scheduled_notifications where user_id = $1 and kind = 'morning' and dedupe_key like $2",
        [uid, `%:${tomorrow}`],
      );
      expect(local.rows[0].l).toBe(`${tomorrow} 10:00`);

      // A chosen time overrides the derived one.
      await c.query("update public.user_settings set morning_nudge_time = '07:45', shutdown_nudge_time = '17:00' where user_id = $1", [uid]);
      await materialise(c);
      expect((await forTomorrow("morning")).map((r) => [r.status, r.local_time])).toEqual([["pending", "07:45:00"]]);
      expect((await forTomorrow("shutdown")).map((r) => [r.status, r.local_time])).toEqual([["pending", "17:00:00"]]);

      // A day without working hours has no nudges, override or not: the pending rows are cancelled.
      await c.query("update public.work_hours set deleted_at = now() where user_id = $1 and weekday = $2", [uid, weekday]);
      await materialise(c);
      expect((await forTomorrow("morning")).map((r) => r.status)).toEqual(["cancelled"]);
      expect((await forTomorrow("shutdown")).map((r) => r.status)).toEqual(["cancelled"]);
    }));

  it("a new account starts with quiet hours 21:00–08:00, derived nudges, reminders at the start and the badge on", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "notif-defaults@contract.test");
      const { rows: r } = await c.query(
        "select to_char(quiet_hours_start, 'HH24:MI') as qs, to_char(quiet_hours_end, 'HH24:MI') as qe, morning_nudge_time, shutdown_nudge_time, block_start_lead_min, badge_enabled, default_miss_policy, default_view from public.user_settings where user_id = $1",
        [uid],
      );
      expect(r[0]).toEqual({ qs: "21:00", qe: "08:00", morning_nudge_time: null, shutdown_nudge_time: null, block_start_lead_min: 0, badge_enabled: true, default_miss_policy: "carry", default_view: "today" });
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
  // The claim runs across every user; inside the rolled-back transaction, other
  // pending rows (the dev account's real reminders) would otherwise leak in.
  const isolate = (c: Client) => c.query("delete from private.scheduled_notifications where status = 'pending'");
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
      await isolate(c);
      await quietNow(c, uid, false);
      const now = await due(c, uid, "block_start");
      const later = await due(c, uid, "deadline_eve", -60);
      const { rows } = await c.query<{ id: string; kind: string }>("select id, kind from private.claim_due_notifications(10)");
      expect(rows.map((r) => r.id)).toEqual([now]);
      expect(await status(c, now)).toEqual({ status: "sent", attempts: 1 });
      expect((await status(c, later)).status).toBe("pending");
      expect((await c.query("select id from private.claim_due_notifications(10)")).rows).toHaveLength(0);
    }));

  it("inside quiet hours every kind is dropped, deadlines and the morning nudge included; nothing waits for the morning", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "claim-b@contract.test");
      await isolate(c);
      await quietNow(c, uid, true);
      const kinds = ["block_start", "deadline_eve", "deadline_day", "morning", "shutdown"];
      const ids: string[] = [];
      for (const k of kinds) ids.push(await due(c, uid, k));
      const urgent = await due(c, uid, "urgent_repeat");
      const { rows } = await c.query<{ id: string }>("select id from private.claim_due_notifications(10)");
      // Only an opted-in urgent repeat (M2) rings through quiet hours.
      expect(rows.map((r) => r.id)).toEqual([urgent]);
      for (const id of ids) expect((await status(c, id)).status).toBe("skipped_quiet");
      const ahead = await c.query<{ n: number }>("select count(*)::int as n from private.scheduled_notifications where user_id = $1 and status = 'pending'", [uid]);
      expect(ahead.rows[0].n).toBe(0);
    }));

  it("a morning nudge for a day already planned, or a shutdown nudge for a day already closed, is cancelled", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "claim-c@contract.test");
      const sid = await spaceOf(c, uid);
      await isolate(c);
      await quietNow(c, uid, false);
      // A nudge belongs to the calendar day it fires on.
      const today = await localToday(c, uid, true);
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
      await isolate(c);
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

describe.skipIf(admin === null)("the day at send time: badge and figures", () => {
  it("the badge counts what Today counts, and is 0 once the day is shut down or the badge is off", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "badge-a@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await appToday(c, uid);
      const yesterday = (await c.query<{ d: string }>("select to_char($1::date - 1, 'YYYY-MM-DD') as d", [today])).rows[0].d;
      const tomorrow = (await c.query<{ d: string }>("select to_char($1::date + 1, 'YYYY-MM-DD') as d", [today])).rows[0].d;
      await addTask(c, sid, "Planned today", { doDate: today });
      await addTask(c, sid, "Carried over", { doDate: yesterday });
      await addTask(c, sid, "Tomorrow", { doDate: tomorrow });
      await addTask(c, sid, "In the inbox", { state: "inbox", doDate: null });
      const done = await addTask(c, sid, "Finished", { doDate: today });
      await c.query("update public.tasks set state = 'done', completed_at = now() where id = $1", [done]);
      const badge = async () => (await c.query<{ n: number }>("select private.app_badge_for($1) as n", [uid])).rows[0].n;
      expect(await badge()).toBe(2);

      await c.query("insert into public.day_plans (space_id, user_id, date, shutdown_at) values ($1, $2, $3::date, now())", [sid, uid, today]);
      expect(await badge()).toBe(0);
      await c.query("update public.day_plans set shutdown_at = null where user_id = $1", [uid]);
      expect(await badge()).toBe(2);
      await c.query("update public.user_settings set badge_enabled = false where user_id = $1", [uid]);
      expect(await badge()).toBe(0);
    }));

  it("push_day_context hands the sender the day's hours, events, blocks, planned tasks, done count and badge; service role only", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "badge-b@contract.test", "Europe/London");
      const sid = await spaceOf(c, uid);
      const today = await appToday(c, uid);
      const planned = await addTask(c, sid, "Write", { doDate: today, estimate: 50 });
      await addTask(c, sid, "Elsewhere", { doDate: null });
      const done = await addTask(c, sid, "Shipped", { doDate: today });
      await c.query("update public.tasks set state = 'done', completed_at = now() where id = $1", [done]);
      await addBlock(c, sid, uid, planned, 30, 50);
      const { rows: ctx } = await c.query<{ j: Record<string, unknown> & { tasks: { id: string }[]; blocks: unknown[]; events: unknown[]; work_hours: unknown[] } }>("select private.push_day_context($1, $2::date) as j", [uid, today]);
      const j = ctx[0].j;
      expect(j).toMatchObject({ day: today, timezone: "Europe/London", buffer_pct: 15, default_estimate_min: 30, calendar_connected: false, done: 1, app_badge: 1 });
      expect(j.tasks.map((t) => t.id)).toEqual([planned]);
      expect(j.blocks).toHaveLength(1);
      expect(j.events).toEqual([]);
      expect(j.work_hours).toHaveLength(5);
      // Without a day it is the person's today.
      const plain = await c.query<{ day: string }>("select private.push_day_context($1)->>'day' as day", [uid]);
      expect(plain.rows[0].day).toBe(today);

      await c.query("savepoint ctx");
      await asUser(c, uid);
      await expect(c.query("select public.push_day_context($1, $2::date)", [uid, today])).rejects.toThrow(/permission denied/);
      await c.query("rollback to savepoint ctx");
    }));
});
