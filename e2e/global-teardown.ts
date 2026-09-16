// Removes what the suite created, by its title prefix, so a local run leaves
// the dev account as it found it. Blocks on those tasks go with them.
import { E2E_PREFIX } from "./helpers";
import { withDb } from "./db";

export default async function teardown(): Promise<void> {
  try {
    await withDb(async (c) => {
      await c.query("delete from public.time_blocks where task_id in (select id from public.tasks where title like $1)", [`${E2E_PREFIX}%`]);
      await c.query("delete from public.tasks where title like $1", [`${E2E_PREFIX}%`]);
      await c.query("delete from public.headings where title like $1", [`${E2E_PREFIX}%`]);
      // Accounts the magic-link test created; auth.users cascades through public.users and their space.
      await c.query("delete from auth.users where email like 'e2e-magic-%@sparehour.local'");
      // Tags the detail test attached, and the dev account's day plan a ritual test may have left closed.
      await c.query("delete from public.tags where name like 'e2e%'");
      await c.query("delete from public.day_plans p using public.users u where u.id = p.user_id and u.email = 'dev@sparehour.local' and p.date >= current_date");
    });
  } catch (e) {
    console.warn("e2e teardown skipped:", e instanceof Error ? e.message : e);
  }
}
