// A superuser look at the local Postgres, to prove a write went all the way
// through sync — the contract tests use the same connection.
import { Client } from "pg";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Polls until the statement returns a row, or gives up. */
export async function waitForRow<T extends Record<string, unknown>>(sql: string, params: unknown[], timeoutMs = 15_000): Promise<T | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const row = await withDb(async (c) => (await c.query<T>(sql, params)).rows[0] ?? null);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/** The dev account as its specs need it: its ids, and its day now (its zone, its rollover hour), as the app reckons it. */
export interface DevAccount {
  uid: string;
  sid: string;
  /** ISO date of the app's today. */
  today: string;
  /** Minutes past local midnight now, and the rollover hour, for a spec that needs time left in the day. */
  minute: number;
  rollover: number;
  timezone: string;
}

export async function devAccount(c: Client, email: string): Promise<DevAccount> {
  const { rows } = await c.query<DevAccount>(
    `select u.id as uid, u.personal_space_id as sid,
            (timezone(s.timezone, now()) - make_interval(hours => s.day_rollover_hour))::date::text as today,
            (extract(hour from timezone(s.timezone, now())) * 60 + extract(minute from timezone(s.timezone, now())))::int as minute,
            s.day_rollover_hour as rollover, s.timezone
       from public.users u join public.user_settings s on s.user_id = u.id
      where u.email = $1`,
    [email],
  );
  return rows[0];
}

/** An ISO date `days` after another (calendar days, no zone involved). */
export function isoPlus(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Working hours over every hour of every day, as extra rows beside the account's own (which are never
 * touched), so a spec does not depend on today, or any day of its week, being a working day. Returns the
 * ids to delete afterwards.
 */
export async function addAllDayHours(c: Client, me: DevAccount): Promise<string[]> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.work_hours (id, space_id, user_id, weekday, start_time, end_time)
     select gen_random_uuid(), $1, $2, d, '00:00', '23:59' from generate_series(0, 6) d
     returning id`,
    [me.sid, me.uid],
  );
  return rows.map((r) => r.id);
}

/**
 * Which of these days have a calendar event that counts as busy (src/core/capacity countsAsBusy). The calendar
 * mirror reaches a fresh device on its own stream, after the first sync, so a spec that reads a day's capacity
 * waits for those days' meetings to be drawn before it reads anything.
 */
export async function daysWithMeetings(c: Client, me: DevAccount, days: readonly string[]): Promise<Set<string>> {
  const { rows } = await c.query<{ day: string }>(
    `select d::date::text as day from unnest($2::date[]) d
      where exists (
        select 1 from public.calendar_events e join public.calendars k on k.id = e.calendar_id
         where e.user_id = $1 and e.deleted_at is null and k.deleted_at is null and k.read
           and e.busy and not e.all_day and not coalesce(e.is_ours, false)
           and coalesce(e.status, '') <> 'cancelled' and coalesce(e.self_response, '') <> 'declined'
           and coalesce(e.event_type, 'default') not in ('workingLocation', 'birthday', 'outOfOffice')
           and e.start_at < ((d::date + 1)::timestamp at time zone $3) and e.end_at > (d::date::timestamp at time zone $3))`,
    [me.uid, days, me.timezone],
  );
  return new Set(rows.map((r) => r.day));
}

/** A task a spec stood aside, with what it had before, so afterAll puts it back exactly. */
export interface StoodAside {
  id: string;
  start_date: string | null;
  last_touched_at: string;
}

/**
 * Stands aside the account's open tasks due on or before `through` (default: today), whatever their title, by
 * starting them tomorrow: they leave Today, Carried over and the planner, and CI's crowded seed (or another
 * spec's leftovers) cannot outrank or hide a spec's own rows. Returns what `putBack` needs.
 */
export async function standAside(c: Client, me: DevAccount, through: string = me.today): Promise<StoodAside[]> {
  const { rows } = await c.query<StoodAside>(
    `select id, start_date::text, last_touched_at::text from public.tasks
      where space_id = $1 and deleted_at is null and state in ('inbox', 'active')
        and do_date is not null and do_date <= $2::date and (start_date is null or start_date <= $3::date)`,
    [me.sid, through, me.today],
  );
  if (rows.length > 0) await c.query("update public.tasks set start_date = $2::date + 1 where id = any($1::uuid[])", [rows.map((r) => r.id), me.today]);
  return rows;
}

/**
 * Puts stood-aside tasks back: the start date first (the touch trigger counts that as a touch), then
 * last_touched_at on its own, which the trigger leaves alone, so every row ages exactly as before.
 */
export async function putBack(c: Client, rows: readonly StoodAside[]): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await c.query("update public.tasks t set start_date = v.sd from unnest($1::uuid[], $2::date[]) as v(id, sd) where t.id = v.id", [ids, rows.map((r) => r.start_date)]);
  await c.query("update public.tasks t set last_touched_at = v.lt from unnest($1::uuid[], $2::timestamptz[]) as v(id, lt) where t.id = v.id", [ids, rows.map((r) => r.last_touched_at)]);
}

/** When each task's three-carry ask was last shown, as found. */
export interface AskedAt {
  id: string;
  carry_asked_at: string;
}

/**
 * Clears every recorded three-carry ask in the account (tasks.carry_asked_at, any state), so a spec starts with
 * the day's two asks unspent: an ask recorded today on any task counts toward them. Not a touch (touch_task
 * ignores the column). Returns what `restoreAsks` needs.
 */
export async function clearAsks(c: Client, me: DevAccount): Promise<AskedAt[]> {
  const { rows } = await c.query<AskedAt>("select id, carry_asked_at::text from public.tasks where space_id = $1 and carry_asked_at is not null", [me.sid]);
  if (rows.length > 0) await c.query("update public.tasks set carry_asked_at = null where id = any($1::uuid[])", [rows.map((r) => r.id)]);
  return rows;
}

export async function restoreAsks(c: Client, rows: readonly AskedAt[]): Promise<void> {
  if (rows.length === 0) return;
  await c.query("update public.tasks t set carry_asked_at = v.at from unnest($1::uuid[], $2::timestamptz[]) as v(id, at) where t.id = v.id", [rows.map((r) => r.id), rows.map((r) => r.carry_asked_at)]);
}

/**
 * Removes a spec's own rows by title as soon as it is done with them (the global teardown would, but only after
 * every other spec has run past them): their blocks, the repeat exceptions of their series, the tasks (steps go
 * with them), and any project a conversion made from one of them, with its tasks.
 */
export async function removeOwn(c: Client, titles: readonly string[]): Promise<void> {
  if (titles.length === 0) return;
  await c.query(
    `delete from public.recurrence_exceptions e using public.tasks t
      where t.title = any($1) and e.series_id = coalesce(t.recurrence_series_id, t.id)`,
    [titles],
  );
  await c.query("delete from public.time_blocks where task_id in (select t.id from public.tasks t left join public.projects p on p.id = t.project_id where t.title = any($1) or p.name = any($1))", [titles]);
  await c.query("delete from public.tasks t using public.projects p where p.id = t.project_id and p.name = any($1)", [titles]);
  await c.query("delete from public.tasks where title = any($1)", [titles]);
  await c.query("delete from public.projects where name = any($1)", [titles]);
}

/**
 * A valid fractional-index key for a seeded row (core/ordering): "y" heads a 25-character tail, so a key the app
 * computes next to it (a move, a conversion's next project) never throws. `tail` orders keys among themselves.
 */
export const seedKey = (tail: string): string => `y${tail.padStart(25, "0")}`;

/** A task a spec moved off the slate, with what it had before, so afterAll puts it back exactly. */
export interface OffSlate {
  id: string;
  do_date: string | null;
  start_date: string | null;
  last_touched_at: string;
}

/**
 * Takes every task Clear the slate would archive in either scope (src/data/queries/archive.ts: active, not
 * repeating, not a routine run, dated today or earlier, or undated with nothing ahead) off it, whatever their title:
 * a dated one moves to tomorrow and every one starts tomorrow. A spec's confirmation then counts, and its batch
 * holds, only the spec's own rows, however crowded the account is. Returns what `backOnSlate` needs.
 */
export async function offSlate(c: Client, me: DevAccount): Promise<OffSlate[]> {
  const { rows } = await c.query<OffSlate>(
    `select id, do_date::text, start_date::text, last_touched_at::text from public.tasks
      where space_id = $1 and deleted_at is null and state = 'active' and routine_run_id is null and coalesce(recurrence_rule, '') = ''
        and ((do_date is not null and do_date <= $2::date)
          or (do_date is null and (start_date is null or start_date <= $2::date) and (deadline is null or deadline <= $2::date)))`,
    [me.sid, me.today],
  );
  if (rows.length > 0) {
    await c.query("update public.tasks set do_date = case when do_date is null then null else $2::date + 1 end, start_date = $2::date + 1 where id = any($1::uuid[])", [
      rows.map((r) => r.id),
      me.today,
    ]);
  }
  return rows;
}

/** Puts tasks taken off the slate back: their dates first, then last_touched_at on its own (see `putBack`). */
export async function backOnSlate(c: Client, rows: readonly OffSlate[]): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await c.query("update public.tasks t set do_date = v.dd, start_date = v.sd from unnest($1::uuid[], $2::date[], $3::date[]) as v(id, dd, sd) where t.id = v.id", [
    ids,
    rows.map((r) => r.do_date),
    rows.map((r) => r.start_date),
  ]);
  await c.query("update public.tasks t set last_touched_at = v.lt from unnest($1::uuid[], $2::timestamptz[]) as v(id, lt) where t.id = v.id", [ids, rows.map((r) => r.last_touched_at)]);
}
