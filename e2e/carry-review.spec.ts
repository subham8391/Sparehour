// The morning review (SCREENS.md §2.3a): the first open of a new day with
// carried-over tasks asks, once, what to do with each. Done writes every
// answer and stamps the day; a fresh device then opens quietly, and the
// review is still there on demand behind "Review carried".
import { expect, test } from "./fixtures";
import { devAccount, freshMorning, morningBack, waitForRow, withDb, type ClosedDay, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

const DIALOG = "Review carried-over tasks";
// The dev account's local day: Europe/London, rolling over at 04:00 (its day_rollover_hour), as the app reckons it.
const LOCAL_TODAY = "(timezone('Europe/London', now()) - interval '4 hours')::date";
const PLAN = `select carry_reviewed_at from public.day_plans p join public.users u on u.id = p.user_id where u.email = $1 and p.date = ${LOCAL_TODAY} and p.carry_reviewed_at is not null`;

const first = uniqueTitle("carried one");
const second = uniqueTitle("carried two");

// The dev account's own carried pile, stood aside while this spec runs. Done writes every row the sheet
// shows, and the seeded rows would be swept into today with the two E2E tasks: their ids are not
// RFC 4122-shaped, so the upload route drops that batch as malformed, and moving them would change the
// account anyway. Starting them tomorrow hides them from Carried over; afterAll puts them back as found.
let stoodAside: { id: string; start_date: string | null; last_touched_at: string }[] = [];
let me: DevAccount;
let closed: ClosedDay[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    await c.query("update public.user_settings s set carry_review = true from public.users u where u.id = s.user_id and u.email = $1", [DEV_USER.email]);
    // Today unplanned and yesterday not shut down: the morning the review asks on.
    closed = await freshMorning(c, me);
    const { rows } = await c.query<{ sid: string }>("select personal_space_id as sid from public.users where email = $1", [DEV_USER.email]);
    const sid = rows[0].sid;
    stoodAside = (
      await c.query<{ id: string; start_date: string | null; last_touched_at: string }>(
        `select id, start_date::text, last_touched_at::text from public.tasks
          where space_id = $1 and deleted_at is null and state in ('inbox', 'active') and routine_run_id is null
            and do_date is not null and do_date < ${LOCAL_TODAY} and (start_date is null or start_date <= ${LOCAL_TODAY}) and title not like 'E2E %'`,
        [sid],
      )
    ).rows;
    await c.query(`update public.tasks set start_date = ${LOCAL_TODAY} + 1 where id = any($1::uuid[])`, [stoodAside.map((r) => r.id)]);
    // Two tasks due yesterday, carried once: the superuser connection may set the rollover's counter.
    for (const [title, key] of [
      [first, "y0000000000000000000000001"],
      [second, "y0000000000000000000000002"],
    ]) {
      await c.query(`insert into public.tasks (space_id, title, state, do_date, estimate_min, sort_key, carry_count, last_carried_at) values ($1, $2, 'active', ${LOCAL_TODAY} - 1, 20, $3, 1, ${LOCAL_TODAY})`, [sid, title, key]);
    }
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    // Two statements per row: the start date first (which the touch trigger counts as a touch), then
    // last_touched_at on its own, which the trigger leaves alone, so the row ages exactly as before.
    for (const r of stoodAside) {
      await c.query("update public.tasks set start_date = $2 where id = $1", [r.id, r.start_date]);
      await c.query("update public.tasks set last_touched_at = $2 where id = $1", [r.id, r.last_touched_at]);
    }
    // Off again, and the day left open, for the rest of the suite; the global teardown removes the E2E tasks.
    await c.query("update public.user_settings s set carry_review = false from public.users u where u.id = s.user_id and u.email = $1", [DEV_USER.email]);
    await morningBack(c, me, closed);
  });
});

test("the first open of the day asks about the carried pile; Done writes each answer and stamps the day; a fresh device opens quietly", async ({ page, browser }) => {
  await openApp(page, "/today");
  const dialog = page.getByRole("dialog", { name: DIALOG });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(first)).toBeVisible();
  await expect(dialog.getByText(second)).toBeVisible();
  await expect(dialog.getByRole("radiogroup", { name: `Choice for ${first}` }).getByRole("radio", { name: "Keep" })).toBeChecked();

  await dialog.getByRole("radiogroup", { name: `Choice for ${second}` }).getByRole("radio", { name: "Someday" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);

  expect(await waitForRow<{ state: string }>("select state from public.tasks where title = $1 and state = 'someday'", [second])).not.toBeNull();
  expect(await waitForRow<{ do_date: string }>(`select do_date from public.tasks where title = $1 and state = 'active' and do_date = ${LOCAL_TODAY}`, [first])).not.toBeNull();
  expect(await waitForRow<{ carry_reviewed_at: string }>(PLAN, [DEV_USER.email])).not.toBeNull();
  // The kept task now sits in today's list, the parked one has left it.
  await expect(page.getByRole("row").filter({ hasText: first })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: second })).toHaveCount(0);

  // Something new carries over before the next open, so there is a pile to see and still nothing to ask about.
  const third = uniqueTitle("carried three");
  await withDb(async (c) => {
    const { rows } = await c.query<{ sid: string }>("select personal_space_id as sid from public.users where email = $1", [DEV_USER.email]);
    await c.query(`insert into public.tasks (space_id, title, state, do_date, estimate_min, sort_key, carry_count, last_carried_at) values ($1, $2, 'active', ${LOCAL_TODAY} - 1, 20, 'y0000000000000000000000003', 1, ${LOCAL_TODAY})`, [rows[0].sid, third]);
  });
  // A second full navigation in one context stalls the sync client, so the "next open" is a fresh context with the same session.
  const context = await browser.newContext({ storageState: "e2e/.auth/user.json" });
  const again = await context.newPage();
  await openApp(again, "/today");
  // The link proves the host has the carried pile in hand: the sheet's decision is made from the same rows, and it stayed closed.
  const link = again.getByRole("button", { name: "Review carried" });
  await expect(link).toBeVisible();
  await expect(again.getByRole("dialog", { name: DIALOG })).toHaveCount(0);
  // On demand it still opens, and Not now leaves every task as it was.
  await link.click();
  const reopened = again.getByRole("dialog", { name: DIALOG });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(third)).toBeVisible();
  await expect(reopened.getByText(second)).toHaveCount(0);
  await reopened.getByRole("button", { name: "Not now" }).click();
  await expect(reopened).toHaveCount(0);
  expect(await waitForRow<{ do_date: string }>(`select do_date from public.tasks where title = $1 and state = 'active' and do_date = ${LOCAL_TODAY} - 1`, [third])).not.toBeNull();
  await context.close();
});
