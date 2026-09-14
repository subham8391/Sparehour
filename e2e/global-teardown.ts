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
    });
  } catch (e) {
    console.warn("e2e teardown skipped:", e instanceof Error ? e.message : e);
  }
}
