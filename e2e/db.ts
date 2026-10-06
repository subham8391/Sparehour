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
