// Finishing the finished-tasks work (DECISIONS.md, amendment 2026-11-15). Two things an older finished task can now
// do. From the Logbook's read-only view it can be deleted for good: the view asks once, in place, and only then is
// the row gone from `finished_tasks`. And Today stepped to the day it was finished on lists it, however old the
// day, each row opening the same read-only view, where the old sentence about the Logbook used to be.
//
// Seeded as logbook-older.spec.ts seeds: done tasks older than the week the device holds, then the nightly job run
// now, so they are in `finished_tasks` and not on the device. Both are finished at midday on one day, twelve days
// back in the account's own zone, so the day's address is known.
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = Date.now().toString(36);
const T = {
  kept: `${E2E_PREFIX}Finished and kept ${n}`,
  gone: `${E2E_PREFIX}Finished and deleted ${n}`,
};
let day = "";
let keptId = "";
let goneId = "";

test.beforeAll(async () => {
  await withDb(async (c) => {
    const me = await devAccount(c, DEV_USER.email);
    day = isoPlus(me.today, -12);
    // Finished at `hour` o'clock on that day, as the account's zone reckons it.
    const done = async (title: string, hour: number) =>
      (
        await c.query<{ id: string }>(
          `insert into public.tasks (space_id, title, sort_key, state, estimate_min, do_date, completed_at)
           values ($1, $2, 'a0', 'done', 45, $3::date, timezone($4::text, $3::date + make_interval(hours => $5::int))) returning id`,
          [me.sid, title, day, me.timezone, hour],
        )
      ).rows[0].id;
    keptId = await done(T.kept, 12);
    goneId = await done(T.gone, 13);
    // The nightly job, now: both leave the synced tables for finished_tasks.
    await c.query("select private.archive_done_tasks()");
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.finished_tasks where title like $1", [`%${n}`]);
    await c.query("delete from public.tasks where title like $1", [`%${n}`]);
  });
});

const finishedRows = (id: string) => withDb(async (c) => (await c.query("select 1 from public.finished_tasks where id = $1", [id])).rows.length);

test("an older finished task is deleted for good from the Logbook, after asking once", async ({ page }) => {
  test.setTimeout(120_000);
  expect(await finishedRows(goneId)).toBe(1);
  // Narrowed to the one day, so the two are on the first older page whatever else the account holds.
  await openApp(page, `/logbook?from=${day}&to=${day}`);
  await page.getByRole("button", { name: "Show older" }).click();
  const gone = page.getByRole("row").filter({ hasText: T.gone });
  const kept = page.getByRole("row").filter({ hasText: T.kept });
  await expect(gone).toBeVisible();
  await expect(kept).toBeVisible();

  await gone.getByRole("button", { name: T.gone }).first().click();
  const peek = page.getByRole("dialog", { name: "Finished task" });
  await expect(peek.getByRole("heading", { name: T.gone })).toBeVisible();
  await expect(peek.getByRole("button", { name: "Reopen" })).toBeVisible();

  // It asks once, in place and in plain words; Keep leaves everything as it was.
  await peek.getByRole("button", { name: "Delete for good" }).click();
  const ask = peek.getByRole("group", { name: "Delete for good? This cannot be undone." });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "Keep" })).toBeFocused();
  await ask.getByRole("button", { name: "Keep" }).click();
  await expect(ask).toHaveCount(0);
  await expect(peek.getByRole("button", { name: "Reopen" })).toBeVisible();
  expect(await finishedRows(goneId)).toBe(1);

  // Confirmed: the view closes, the row leaves the list, and the server has no such row, finished or open.
  await peek.getByRole("button", { name: "Delete for good" }).click();
  await ask.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(peek).toHaveCount(0);
  await expect(gone).toHaveCount(0);
  await expect.poll(() => finishedRows(goneId)).toBe(0);
  expect((await withDb((c) => c.query("select 1 from public.tasks where id = $1", [goneId]))).rows).toEqual([]);
  // Only that one: the other task of the day is still listed and still kept.
  await expect(kept).toBeVisible();
  expect(await finishedRows(keptId)).toBe(1);

  // It stays gone: asked for again, the day has the one task.
  await openApp(page, `/logbook?from=${day}&to=${day}`);
  await page.getByRole("button", { name: "Show older" }).click();
  await expect(page.getByRole("row").filter({ hasText: T.kept })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: T.gone })).toHaveCount(0);
});

test("Today stepped to a day older than the device holds lists what was finished on it, and a row opens read-only", async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page, `/today?day=${day}`);
  await expect(page.getByRole("button", { name: "back to today" })).toBeVisible();
  await expect(page.getByText(/^A day that has passed, as it was/)).toBeVisible();

  // The day's finished tasks come from the server: the row is there, under the day's Done list.
  const done = page.getByRole("region", { name: /^Done on / });
  const kept = done.getByRole("row").filter({ hasText: T.kept });
  await expect(kept).toBeVisible({ timeout: 30_000 });
  // Where the dead end used to be.
  await expect(page.getByText(/Older finished tasks are in the Logbook/)).toHaveCount(0);
  await expect(done.getByText("Looking for what you finished on this day…")).toHaveCount(0);
  // A day that has passed only reads: no Reopen on the row itself.
  await expect(kept.getByRole("button", { name: "Reopen", exact: true })).toHaveCount(0);

  // The row opens the same read-only view the Logbook opens, with its two actions.
  await kept.getByRole("button", { name: T.kept }).first().click();
  const peek = page.getByRole("dialog", { name: "Finished task" });
  await expect(peek.getByRole("heading", { name: T.kept })).toBeVisible();
  await expect(peek).toContainText(/Finished \w+ \d+ \w+( \d{4})? · 12:00/);
  await expect(peek).toContainText("45m");
  await expect(peek.getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(peek.getByRole("button", { name: "Delete for good" })).toBeVisible();
  await peek.getByRole("button", { name: "Close" }).click();
  await expect(peek).toHaveCount(0);
  // Read, not changed: it is still a finished task, and not a task again.
  expect(await finishedRows(keptId)).toBe(1);
  expect((await withDb((c) => c.query("select 1 from public.tasks where id = $1", [keptId]))).rows).toEqual([]);
});
