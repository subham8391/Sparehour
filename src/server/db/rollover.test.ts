// The rollover job (SYSTEM_DESIGN.md §5.3) against the real database:
// idempotent per local date, the four policies, aging, and the next-
// occurrence rules the job uses for "skip". Since 20261006001100: deadlines
// per occurrence, exceptions and pauses, the one-off skip, the expired
// reason, auto-file exemptions and its stamp, and the carry reset on a
// repeat's completion (with its undo).
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, inTx as inTxOn, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();
const inTx = (fn: (c: Client) => Promise<void>) => inTxOn(admin, fn);

/** The user's local "today" exactly as the job computes it. */
async function todayFor(c: Client, uid: string): Promise<string> {
  const { rows } = await c.query<{ today: string }>(
    `select to_char((timezone(s.timezone, now()) - make_interval(hours => s.day_rollover_hour))::date, 'YYYY-MM-DD') as today
       from public.user_settings s where s.user_id = $1`,
    [uid],
  );
  return rows[0].today;
}

interface TaskSeed {
  title: string;
  /** Days before today of the do-date; null for no do-date. */
  daysAgo: number | null;
  missPolicy?: "carry" | "skip" | "expire";
  rule?: string;
  mode?: "fixed" | "after_completion";
  carryCount?: number;
  lastCarriedDaysAgo?: number | null;
  touchedDaysAgo?: number;
  routine?: boolean;
  state?: string;
  /** Days after today of the deadline; null for none. Defaults to 30. */
  deadlineInDays?: number | null;
  /** Days after the do-date of the deadline; wins over deadlineInDays. */
  deadlineOffset?: number;
  priority?: number;
  /** Days after today the series is paused until. */
  pausedInDays?: number;
  doTime?: string;
}

async function seed(c: Client, sid: string, today: string, t: TaskSeed): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.tasks (space_id, title, state, do_date, do_time, miss_policy, recurrence_rule, recurrence_mode, recurrence_series_id, recurrence_paused_until,
                               carry_count, last_carried_at, last_touched_at, routine_run_id, sort_key, day_sort_key, deadline, priority)
     values ($1, $2, $3, $4::date - $5::int, $15::time, $6, $7::text, case when $7::text is null then null else $14::text end, case when $7::text is null then null else gen_random_uuid() end,
             case when $16::int is null then null else $4::date + $16::int end,
             $8::int, case when $9::int is null then null else $4::date - $9::int end, now() - make_interval(days => $10::int), case when $11::boolean then gen_random_uuid() else null end, 'a0', 'a0',
             case when $12::int is not null then ($4::date - $5::int) + $12::int when $13::int is null then null else $4::date + $13::int end, $17::int)
     returning id`,
    [
      sid,
      t.title,
      t.state ?? "active",
      today,
      t.daysAgo,
      t.missPolicy ?? "carry",
      t.rule ?? null,
      t.carryCount ?? 0,
      t.lastCarriedDaysAgo ?? null,
      t.touchedDaysAgo ?? 0,
      t.routine ?? false,
      t.deadlineOffset ?? null,
      t.deadlineInDays === undefined ? 30 : t.deadlineInDays,
      t.mode ?? "fixed",
      t.doTime ?? null,
      t.pausedInDays ?? null,
      t.priority ?? 0,
    ],
  );
  return rows[0].id;
}

const run = (c: Client) => c.query("select private.run_rollover()");
const task = async (c: Client, id: string) =>
  (
    await c.query(
      `select state, to_char(do_date, 'YYYY-MM-DD') as do_date, do_time::text as do_time, carry_count, to_char(last_carried_at, 'YYYY-MM-DD') as last_carried_at,
              to_char(deadline, 'YYYY-MM-DD') as deadline, expired_at is not null as expired, auto_filed_at::text as auto_filed_at, last_touched_at::text as last_touched_at
         from public.tasks where id = $1`,
      [id],
    )
  ).rows[0];
/** `day` plus `n` days, as YYYY-MM-DD. */
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

afterAll(async () => {
  await admin?.end();
});

describe.skipIf(admin === null)("run_rollover", () => {
  it("carries a missed task once per local date, and never twice in a day", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-a@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const id = await seed(c, sid, today, { title: "Reply to Dana", daysAgo: 1 });
      const fresh = await seed(c, sid, today, { title: "Due today", daysAgo: 0 });
      await run(c);
      expect(await task(c, id)).toMatchObject({ state: "active", carry_count: 1, last_carried_at: today });
      expect((await task(c, fresh)).carry_count).toBe(0);
      await run(c);
      await run(c);
      expect((await task(c, id)).carry_count).toBe(1);
      const runs = await c.query("select local_date::text, stats from private.rollover_runs where user_id = $1", [uid]);
      expect(runs.rows).toHaveLength(1);
      expect(runs.rows[0].stats).toMatchObject({ carried: 1, expired: 0, skipped: 0, someday: 0 });
    }));

  it("keeps counting on later days and leaves deadlines alone", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-b@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const id = await seed(c, sid, today, { title: "Old", daysAgo: 5, carryCount: 3, lastCarriedDaysAgo: 1 });
      const before = await task(c, id);
      await run(c);
      const after = await task(c, id);
      expect(after.carry_count).toBe(4);
      expect(after.deadline).toBe(before.deadline);
      expect(after.do_date).toBe(before.do_date);
    }));

  it("expire drops, skip jumps a recurring task to its next occurrence, routine items are dropped", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-c@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const expire = await seed(c, sid, today, { title: "Expire", daysAgo: 2, missPolicy: "expire" });
      const daily = await seed(c, sid, today, { title: "Daily", daysAgo: 3, missPolicy: "skip", rule: "FREQ=DAILY" });
      const every3 = await seed(c, sid, today, { title: "Every 3 days", daysAgo: 4, missPolicy: "skip", rule: "FREQ=DAILY;INTERVAL=3" });
      const routine = await seed(c, sid, today, { title: "Routine item", daysAgo: 1, routine: true });
      await run(c);
      expect((await task(c, expire)).state).toBe("dropped");
      expect((await task(c, daily)).do_date).toBe(today);
      // anchor 4 days ago, every 3 days → next on/after today is anchor + 6 = today + 2
      const e3 = await task(c, every3);
      expect(e3.state).toBe("active");
      const diff = await c.query<{ d: number }>("select ($1::date - $2::date) as d", [e3.do_date, today]);
      expect(diff.rows[0].d).toBe(2);
      expect((await task(c, routine)).state).toBe("dropped");
      expect((await task(c, routine)).carry_count).toBe(0);
    }));

  it("moves an untouched task to Someday after the configured days, whatever its carry count", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-d@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const stale = await seed(c, sid, today, { title: "Stale", daysAgo: 40, touchedDaysAgo: 31, carryCount: 12, deadlineInDays: null });
      const recent = await seed(c, sid, today, { title: "Recent", daysAgo: 40, touchedDaysAgo: 2 });
      await run(c);
      expect(await task(c, stale)).toMatchObject({ state: "someday", do_date: null, carry_count: 0 });
      expect((await task(c, recent)).state).toBe("active");
    }));

  it("respects the day-rollover hour: before it, yesterday is still today", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-e@contract.test", "UTC");
      // Pretend the day rolls over at 06:00: the local date is now() minus six hours.
      await c.query("update public.user_settings set day_rollover_hour = 6 where user_id = $1", [uid]);
      const expected = (await c.query<{ d: string }>("select to_char((now() at time zone 'UTC' - interval '6 hours')::date, 'YYYY-MM-DD') as d")).rows[0].d;
      expect(await todayFor(c, uid)).toBe(expected);
      await run(c);
      const runs = await c.query("select to_char(local_date, 'YYYY-MM-DD') as d from private.rollover_runs where user_id = $1", [uid]);
      expect(runs.rows[0].d).toBe(expected);
    }));

  it("a skipped occurrence takes its deadline along, at the same offset from the do-date", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-dl@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      // every week from 3 days ago: the next occurrence is today + 4
      const same = await seed(c, sid, today, { title: "Submit timesheet", daysAgo: 3, missPolicy: "skip", rule: "FREQ=WEEKLY", deadlineOffset: 0 });
      const later = await seed(c, sid, today, { title: "Send the report", daysAgo: 3, missPolicy: "skip", rule: "FREQ=WEEKLY", deadlineOffset: 2 });
      const none = await seed(c, sid, today, { title: "No deadline", daysAgo: 3, missPolicy: "skip", rule: "FREQ=WEEKLY", deadlineInDays: null });
      await run(c);
      expect(await task(c, same)).toMatchObject({ do_date: plus(today, 4), deadline: plus(today, 4), state: "active" });
      expect(await task(c, later)).toMatchObject({ do_date: plus(today, 4), deadline: plus(today, 6) });
      expect(await task(c, none)).toMatchObject({ do_date: plus(today, 4), deadline: null });
    }));

  it("honours just-this-once exceptions: a skipped date is passed over, a moved one lands on its new day", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-ex@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const skipped = await seed(c, sid, today, { title: "Daily, today skipped", daysAgo: 1, missPolicy: "skip", rule: "FREQ=DAILY", deadlineInDays: null });
      const moved = await seed(c, sid, today, { title: "Daily, today moved", daysAgo: 1, missPolicy: "skip", rule: "FREQ=DAILY", deadlineOffset: 1 });
      const series = async (id: string) => (await c.query<{ s: string }>("select recurrence_series_id as s from public.tasks where id = $1", [id])).rows[0].s;
      await c.query("insert into public.recurrence_exceptions (space_id, series_id, occurrence_date, kind) values ($1, $2, $3, 'skip')", [sid, await series(skipped), today]);
      await c.query("insert into public.recurrence_exceptions (space_id, series_id, occurrence_date, kind, moved_to) values ($1, $2, $3, 'move', $4)", [sid, await series(moved), today, plus(today, 3)]);
      await run(c);
      expect((await task(c, skipped)).do_date).toBe(plus(today, 1));
      expect(await task(c, moved)).toMatchObject({ do_date: plus(today, 3), deadline: plus(today, 4) });
    }));

  it("a paused series is not rolled: it waits on its pause date, uncounted and not expired", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-pause@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const carry = await seed(c, sid, today, { title: "Paused carry", daysAgo: 2, missPolicy: "carry", rule: "FREQ=DAILY", pausedInDays: 5, deadlineInDays: null });
      const expire = await seed(c, sid, today, { title: "Paused expire", daysAgo: 2, missPolicy: "expire", rule: "FREQ=DAILY", pausedInDays: 5, deadlineInDays: null });
      const skip = await seed(c, sid, today, { title: "Paused skip", daysAgo: 2, missPolicy: "skip", rule: "FREQ=WEEKLY", pausedInDays: 5, deadlineInDays: null });
      const over = await seed(c, sid, today, { title: "Pause over", daysAgo: 2, missPolicy: "carry", rule: "FREQ=DAILY", pausedInDays: -1, deadlineInDays: null });
      await run(c);
      for (const id of [carry, expire, skip]) expect(await task(c, id)).toMatchObject({ state: "active", do_date: plus(today, 5), carry_count: 0, expired: false });
      // a pause that has ended no longer holds the series back
      expect(await task(c, over)).toMatchObject({ do_date: plus(today, -2), carry_count: 1 });
    }));

  it("an after-completion repeat counts its next skip from the day the occurrence closed", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-ac@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const id = await seed(c, sid, today, { title: "Water the plants", daysAgo: 5, missPolicy: "skip", rule: "FREQ=DAILY;INTERVAL=3", mode: "after_completion", deadlineInDays: null });
      await run(c);
      // closed yesterday: yesterday + 3 = today + 2 (a fixed rule from 5 days ago would land on today + 1)
      expect((await task(c, id)).do_date).toBe(plus(today, 2));
    }));

  it("a one-off skip loses its missed date and keeps its carry count; the job does not touch it", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-skip1@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const id = await seed(c, sid, today, { title: "Book the dentist", daysAgo: 2, missPolicy: "skip", carryCount: 2, touchedDaysAgo: 3, doTime: "09:30", deadlineInDays: 10 });
      const before = await task(c, id);
      await run(c);
      expect(await task(c, id)).toMatchObject({ state: "active", do_date: null, do_time: null, carry_count: 2, deadline: plus(today, 10) });
      expect((await task(c, id)).last_touched_at).toBe(before.last_touched_at);
      const runs = await c.query("select stats from private.rollover_runs where user_id = $1", [uid]);
      expect(runs.rows[0].stats).toMatchObject({ unscheduled: 1, carried: 0, skipped: 0 });
    }));

  it("expire drops with a stored reason that a person's own Drop never carries, and reopening clears", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-exp@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const expired = await seed(c, sid, today, { title: "Ticket sale", daysAgo: 1, missPolicy: "expire" });
      const mine = await seed(c, sid, today, { title: "Mine", daysAgo: 0 });
      await run(c);
      expect(await task(c, expired)).toMatchObject({ state: "dropped", expired: true });
      await asUser(c, uid);
      await c.query("update public.tasks set state = 'dropped' where id = $1", [mine]);
      await c.query("update public.tasks set expired_at = now() where id = $1", [mine]);
      await c.query("update public.tasks set title = 'Ticket sale (gone)' where id = $1", [expired]);
      await asAdmin(c);
      expect(await task(c, mine)).toMatchObject({ state: "dropped", expired: false });
      expect((await task(c, expired)).expired).toBe(true);
      await asUser(c, uid);
      await c.query("update public.tasks set state = 'active' where id = $1", [expired]);
      await asAdmin(c);
      expect(await task(c, expired)).toMatchObject({ state: "active", expired: false });
    }));

  it("auto-files only active tasks, and spares the exempt ones", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-af@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const old = { touchedDaysAgo: 31, deadlineInDays: null } as const;
      const filed = await seed(c, sid, today, { ...old, title: "Filed", daysAgo: 40 });
      const undated = await seed(c, sid, today, { ...old, title: "Filed, undated", daysAgo: null, doTime: undefined });
      const inbox = await seed(c, sid, today, { ...old, title: "Inbox", daysAgo: null, state: "inbox" });
      const deadline = await seed(c, sid, today, { ...old, title: "Due today", daysAgo: 40, deadlineInDays: 0 });
      const pastDeadline = await seed(c, sid, today, { ...old, title: "Was due", daysAgo: 40, deadlineInDays: -2 });
      const repeat = await seed(c, sid, today, { ...old, title: "Repeats", daysAgo: 40, rule: "FREQ=WEEKLY", missPolicy: "carry" });
      const pausedRepeat = await seed(c, sid, today, { ...old, title: "Paused repeat", daysAgo: null, rule: "FREQ=WEEKLY", pausedInDays: 60 });
      const top = await seed(c, sid, today, { ...old, title: "Priority one", daysAgo: 40, priority: 3 });
      const ahead = await seed(c, sid, today, { ...old, title: "Planned ahead", daysAgo: -3 });
      const onToday = await seed(c, sid, today, { ...old, title: "Planned today", daysAgo: 0 });
      const blocked = await seed(c, sid, today, { ...old, title: "Blocked next week", daysAgo: 40 });
      const blockedLater = await seed(c, sid, today, { ...old, title: "Blocked in ten days", daysAgo: 40 });
      const block = (taskId: string, startDays: number) =>
        c.query("insert into public.time_blocks (space_id, user_id, task_id, start_at, end_at, push_state) values ($1, $2, $3, now() + make_interval(days => $4::int), now() + make_interval(days => $4::int) + interval '30 minutes', 'local')", [sid, uid, taskId, startDays]);
      await block(blocked, 5);
      await block(blockedLater, 10);
      await run(c);
      for (const id of [filed, undated, pastDeadline, blockedLater]) expect(await task(c, id)).toMatchObject({ state: "someday", do_date: null, carry_count: 0 });
      for (const id of [inbox, deadline, repeat, pausedRepeat, top, ahead, onToday, blocked]) expect((await task(c, id)).auto_filed_at).toBeNull();
      expect((await task(c, inbox)).state).toBe("inbox");
      for (const id of [deadline, repeat, pausedRepeat, top, ahead, onToday, blocked]) expect((await task(c, id)).state).toBe("active");
      // one run is one batch: every task it filed carries the same stamp
      const stamps = new Set<string | null>();
      for (const id of [filed, undated, pastDeadline, blockedLater]) stamps.add((await task(c, id)).auto_filed_at);
      expect(stamps.size).toBe(1);
      expect([...stamps][0]).not.toBeNull();
      const runs = await c.query("select stats from private.rollover_runs where user_id = $1", [uid]);
      expect(runs.rows[0].stats).toMatchObject({ someday: 4 });
    }));

  it("the auto-file stamp is the server's: it clears when a person touches or moves the task, and a manual Someday never stamps", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-mark@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const old = { touchedDaysAgo: 31, deadlineInDays: null, daysAgo: null } as const;
      const untouched = await seed(c, sid, today, { ...old, title: "Left alone" });
      const edited = await seed(c, sid, today, { ...old, title: "Renamed" });
      const moved = await seed(c, sid, today, { ...old, title: "Brought back" });
      const manual = await seed(c, sid, today, { title: "Parked by hand", daysAgo: null, deadlineInDays: null });
      await run(c);
      const stamp = (await task(c, untouched)).auto_filed_at;
      expect(stamp).not.toBeNull();
      await asUser(c, uid);
      // a write that changes nothing a person sees keeps the stamp; a client cannot set or move it
      await c.query("update public.tasks set state = 'someday', auto_filed_at = now() + interval '1 day' where id = $1", [untouched]);
      await c.query("update public.tasks set title = 'Renamed, again' where id = $1", [edited]);
      await c.query("update public.tasks set state = 'active' where id = $1", [moved]);
      await c.query("update public.tasks set state = 'someday', auto_filed_at = now() where id = $1", [manual]);
      await asAdmin(c);
      expect((await task(c, untouched)).auto_filed_at).toBe(stamp);
      // "Keep in Someday": a person may clear the stamp outright, and the task stays parked
      await asUser(c, uid);
      await c.query("update public.tasks set auto_filed_at = null where id = $1", [untouched]);
      await asAdmin(c);
      expect(await task(c, untouched)).toMatchObject({ state: "someday", auto_filed_at: null });
      expect((await task(c, edited)).auto_filed_at).toBeNull();
      expect(await task(c, moved)).toMatchObject({ state: "active", auto_filed_at: null });
      expect(await task(c, manual)).toMatchObject({ state: "someday", auto_filed_at: null });
      // Bring them all back: the touch trigger refreshes last_touched_at, so the task starts aging again
      const touched = await c.query<{ fresh: boolean }>("select last_touched_at > now() - interval '1 minute' as fresh from public.tasks where id = $1", [moved]);
      expect(touched.rows[0].fresh).toBe(true);
    }));

  it("a write that clears the do-date clears the time with it (a timed task parked in Someday)", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-time@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const id = await seed(c, sid, today, { title: "Call the bank", daysAgo: 0, doTime: "15:00" });
      await asUser(c, uid);
      await c.query("update public.tasks set state = 'someday', do_date = null where id = $1", [id]);
      await asAdmin(c);
      expect(await task(c, id)).toMatchObject({ state: "someday", do_date: null, do_time: null });
    }));

  it("completing a repeat starts the next occurrence clean, and undoing the completion puts the count back", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "roll-done@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      const id = await seed(c, sid, today, { title: "Weekly review", daysAgo: 2, rule: "FREQ=WEEKLY", carryCount: 2, lastCarriedDaysAgo: 0 });
      const other = await seed(c, sid, today, { title: "Someone else's", daysAgo: 2, carryCount: 4 });
      await asUser(c, uid);
      // what the client uploads: the completion row (with a forged snapshot, ignored), then the task moved on
      const completion = (
        await c.query<{ id: string }>(
          "insert into public.task_completions (space_id, task_id, occurrence_date, completed_at, carry_count_before) values ($1, $2, $3, now(), 99) returning id",
          [sid, id, plus(today, -2)],
        )
      ).rows[0].id;
      await c.query("update public.tasks set do_date = $2 where id = $1", [id, plus(today, 5)]);
      await asAdmin(c);
      expect(await task(c, id)).toMatchObject({ do_date: plus(today, 5), carry_count: 0, last_carried_at: null });
      expect((await task(c, other)).carry_count).toBe(4);
      const snap = await c.query("select carry_count_before, to_char(last_carried_before, 'YYYY-MM-DD') as last from public.task_completions where id = $1", [completion]);
      expect(snap.rows[0]).toMatchObject({ carry_count_before: 2, last: today });
      // the undo: the completion is soft-deleted, then the task is put back
      await asUser(c, uid);
      await c.query("update public.task_completions set carry_count_before = 50 where id = $1", [completion]);
      await c.query("update public.task_completions set deleted_at = now() where id = $1", [completion]);
      await c.query("update public.tasks set do_date = $2 where id = $1", [id, plus(today, -2)]);
      await asAdmin(c);
      expect(await task(c, id)).toMatchObject({ do_date: plus(today, -2), carry_count: 2, last_carried_at: today });
    }));

  it("the schedule exists", async () => {
    const { rows } = await (admin as Client).query("select schedule, command from cron.job where jobname = 'sparehour_rollover'");
    expect(rows[0]).toMatchObject({ schedule: "*/15 * * * *", command: "select private.run_rollover()" });
  });
});

describe.skipIf(admin === null)("next_occurrence", () => {
  const next = async (rule: string, anchor: string, after: string) =>
    (await (admin as Client).query<{ d: string | null }>("select to_char(private.next_occurrence($1, $2::date, $3::date), 'YYYY-MM-DD') as d", [rule, anchor, after])).rows[0].d;

  it("daily and every-n-days stay on the series' grid", async () => {
    expect(await next("FREQ=DAILY", "2026-09-10", "2026-09-13")).toBe("2026-09-14");
    expect(await next("FREQ=DAILY;INTERVAL=3", "2026-09-10", "2026-09-13")).toBe("2026-09-16");
    expect(await next("FREQ=DAILY;INTERVAL=3", "2026-09-10", "2026-09-15")).toBe("2026-09-16");
  });

  it("weekly with weekdays picks the next listed day, honouring the interval", async () => {
    expect(await next("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-09-14", "2026-09-14")).toBe("2026-09-16"); // Mon → Wed
    expect(await next("FREQ=WEEKLY;BYDAY=MO", "2026-09-14", "2026-09-15")).toBe("2026-09-21");
    expect(await next("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", "2026-09-16", "2026-09-17")).toBe("2026-09-30");
    expect(await next("FREQ=WEEKLY", "2026-09-14", "2026-09-20")).toBe("2026-09-21");
  });

  it("monthly clamps to the last day of short months and yearly steps years", async () => {
    expect(await next("FREQ=MONTHLY", "2026-01-31", "2026-02-01")).toBe("2026-02-28");
    expect(await next("FREQ=MONTHLY", "2026-09-14", "2026-09-14")).toBe("2026-10-14");
    expect(await next("FREQ=YEARLY", "2026-09-14", "2026-09-14")).toBe("2027-09-14");
  });

  it("returns null for a rule it does not understand", async () => {
    expect(await next("FREQ=HOURLY", "2026-09-14", "2026-09-14")).toBeNull();
    expect(await next("nonsense", "2026-09-14", "2026-09-14")).toBeNull();
  });
});
