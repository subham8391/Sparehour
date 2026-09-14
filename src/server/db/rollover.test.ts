// The rollover job (SYSTEM_DESIGN.md §5.3) against the real database:
// idempotent per local date, the four policies, aging, and the next-
// occurrence rules the job uses for "skip".
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { inTx as inTxOn, newUser, spaceOf, tryConnect } from "./test-db";

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
  daysAgo: number;
  missPolicy?: "carry" | "skip" | "expire";
  rule?: string;
  carryCount?: number;
  lastCarriedDaysAgo?: number | null;
  touchedDaysAgo?: number;
  routine?: boolean;
  state?: string;
}

async function seed(c: Client, sid: string, today: string, t: TaskSeed): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.tasks (space_id, title, state, do_date, miss_policy, recurrence_rule, recurrence_mode, recurrence_series_id,
                               carry_count, last_carried_at, last_touched_at, routine_run_id, sort_key, day_sort_key, deadline)
     values ($1, $2, $3, $4::date - $5::int, $6, $7::text, case when $7::text is null then null else 'fixed' end, case when $7::text is null then null else gen_random_uuid() end,
             $8::int, case when $9::int is null then null else $4::date - $9::int end, now() - make_interval(days => $10::int), case when $11::boolean then gen_random_uuid() else null end, 'a0', 'a0', $4::date + 30)
     returning id`,
    [sid, t.title, t.state ?? "active", today, t.daysAgo, t.missPolicy ?? "carry", t.rule ?? null, t.carryCount ?? 0, t.lastCarriedDaysAgo ?? null, t.touchedDaysAgo ?? 0, t.routine ?? false],
  );
  return rows[0].id;
}

const run = (c: Client) => c.query("select private.run_rollover()");
const task = async (c: Client, id: string) => (await c.query(`select state, to_char(do_date, 'YYYY-MM-DD') as do_date, carry_count, to_char(last_carried_at, 'YYYY-MM-DD') as last_carried_at, to_char(deadline, 'YYYY-MM-DD') as deadline from public.tasks where id = $1`, [id])).rows[0];

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
      const stale = await seed(c, sid, today, { title: "Stale", daysAgo: 40, touchedDaysAgo: 31, carryCount: 12 });
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
