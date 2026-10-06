// The expired digest (PRODUCT_SPEC.md §8.2 rule 5, SCREENS.md §19): after a
// rollover drops a time-sensitive task, Today says so once — "1
// time-sensitive task expired overnight" — with Review, which opens the
// Logbook's expired view, and a dismiss that holds for good.
//
// The task is expired the way the rollover job expires one (migration
// 20261006001100, run_rollover step 1): as postgres, with the job's session
// flag on so the move is not a touch, state dropped and a server-owned
// expired_at. The line counts every expired task newer than the settings
// row's expired_seen_at, so for the length of the spec every expired task
// already there (the account's own, or an earlier run's not yet torn down)
// counts as seen; afterAll puts that row back exactly as found.
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle, waitForSync } from "./helpers";
import type { Page } from "@playwright/test";

const expired = uniqueTitle("expired");

let me: DevAccount;
let settings: { expired_seen_at: string | null; updated_at: string } | null = null;
/** expired_seen_at with the account's own expired tasks already told: each test starts from it. */
let baseline: string | null = null;

const line = (page: Page) => page.getByRole("status").filter({ hasText: /time-sensitive tasks? expired overnight/ });

async function resetSeen(): Promise<void> {
  await withDb((c) => c.query("update public.user_settings set expired_seen_at = $2 where user_id = $1", [me.uid, baseline]));
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    settings = (await c.query("select expired_seen_at::text, updated_at::text from public.user_settings where user_id = $1", [me.uid])).rows[0];
    const newest = (
      await c.query<{ at: string | null }>(
        "select max(expired_at)::text as at from public.tasks where space_id = $1 and expired_at is not null",
        [me.sid],
      )
    ).rows[0].at;
    baseline = settings?.expired_seen_at ?? null;
    if (newest && (!baseline || new Date(newest) > new Date(baseline))) baseline = newest;

    // Missed yesterday with the expire policy, then dropped the way run_rollover's step 1 drops it.
    const id = (
      await c.query<{ id: string }>(
        `insert into public.tasks (id, space_id, title, state, priority, do_date, miss_policy, estimate_min, sort_key)
         values (gen_random_uuid(), $1, $2, 'active', 0, $3::date, 'expire', 30, 'y0000000000000000000000051')
         returning id`,
        [me.sid, expired, isoPlus(me.today, -1)],
      )
    ).rows[0].id;
    await c.query("begin");
    try {
      await c.query("select set_config('sparehour.rollover', 'on', true)");
      await c.query("update public.tasks set state = 'dropped', expired_at = now(), updated_at = now() where id = $1", [id]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
});

test.beforeEach(resetSeen);

test.afterAll(async () => {
  if (!settings) return;
  const { expired_seen_at, updated_at } = settings;
  await withDb(async (c) => {
    await c.query("begin");
    try {
      // Exactly as found, updated_at included (a raw write: the trigger would stamp it again).
      await c.query("set local session_replication_role = replica");
      await c.query("update public.user_settings set expired_seen_at = $2, updated_at = $3 where user_id = $1", [me.uid, expired_seen_at, updated_at]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
});

const SEEN = "select s.id from public.user_settings s, public.tasks t where s.user_id = $1 and t.title = $2 and s.expired_seen_at >= t.expired_at";

test("Today says once that a task expired; Review opens the Logbook's expired view", async ({ page }) => {
  await openApp(page, "/today");
  await expect(line(page)).toHaveText(/^1 time-sensitive task expired overnight/);

  await line(page).getByRole("link", { name: "Review" }).click();
  await expect(page).toHaveURL(/\/logbook\?show=expired$/);
  await expect(page.getByRole("heading", { level: 1, name: "Expired" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: expired });
  await expect(row).toBeVisible();
  await expect(row.getByText("Expired", { exact: true })).toBeVisible();
  // Reviewing is being told: the batch is recorded as seen.
  expect(await waitForRow(SEEN, [me.uid, expired])).not.toBeNull();

  await page.getByRole("link", { name: /^Today/ }).first().click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The digest is a lazy island; give it the time it takes to load before trusting its absence.
  await page.waitForTimeout(2_000);
  await expect(line(page)).toHaveCount(0);
});

test("dismissing the line hides it for good, on this device and after a reload", async ({ page }) => {
  await openApp(page, "/today");
  await expect(line(page)).toBeVisible();
  await line(page).getByRole("button", { name: "Dismiss" }).click();
  await expect(line(page)).toHaveCount(0);
  expect(await waitForRow(SEEN, [me.uid, expired])).not.toBeNull();

  await page.reload();
  await waitForSync(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(2_000);
  await expect(line(page)).toHaveCount(0);
});
