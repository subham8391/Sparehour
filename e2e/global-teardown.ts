// Removes what the suite created, by its title prefix, so a local run leaves
// the dev account as it found it. Blocks on those tasks go with them.
import { E2E_PREFIX } from "./helpers";
import { withDb } from "./db";

export default async function teardown(): Promise<void> {
  try {
    await withDb(async (c) => {
      await c.query("delete from public.time_blocks where task_id in (select id from public.tasks where title like $1)", [`${E2E_PREFIX}%`]);
      // Blocks of your own (no task) a spec drew and named.
      await c.query("delete from public.time_blocks where task_id is null and title like $1", [`${E2E_PREFIX}%`]);
      // A repeat's one-off changes (Just this once, Skip this occurrence) name its series, not the task: no key takes them with it.
      await c.query("delete from public.recurrence_exceptions e using public.tasks t where t.title like $1 and e.series_id = coalesce(t.recurrence_series_id, t.id)", [`${E2E_PREFIX}%`]);
      await c.query("delete from public.tasks where title like $1", [`${E2E_PREFIX}%`]);
      await c.query("delete from public.headings where title like $1", [`${E2E_PREFIX}%`]);
      // Projects and areas a spec made for itself (each spec also removes its own in afterAll).
      await c.query("delete from public.projects where name like $1", [`${E2E_PREFIX}%`]);
      await c.query("delete from public.areas where name like $1", [`${E2E_PREFIX}%`]);
      // Accounts the magic-link and account-deletion tests created; auth.users cascades through public.users and
      // their space, after the ledgers that name a user without a key (as private.purge_deleted_accounts does).
      const made = "select id from auth.users where email like 'e2e-magic-%@sparehour.local' or email like 'e2e-delete-%@sparehour.local'";
      await c.query(`delete from private.mutations where user_id in (${made})`);
      await c.query(`delete from private.rollover_runs where user_id in (${made})`);
      await c.query(`delete from auth.users where id in (${made})`);
      // Tags the detail test attached, and the dev account's day plan a ritual test may have left closed.
      await c.query("delete from public.tags where name like 'e2e%'");
      // The app's today is the account's (its zone, its rollover hour), not the server's calendar date.
      await c.query(
        "delete from public.day_plans p using public.user_settings s, public.users u where s.user_id = p.user_id and u.id = p.user_id and u.email = 'dev@sparehour.local' and p.date >= (timezone(s.timezone, now()) - make_interval(hours => s.day_rollover_hour))::date",
      );
    });
  } catch (e) {
    console.warn("e2e teardown skipped:", e instanceof Error ? e.message : e);
  }
}
