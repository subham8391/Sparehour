// Plan my day (PRODUCT_SPEC.md §11, SYSTEM_DESIGN.md §5.5): the preview
// proposes blocks with a reason for each and writes nothing; Approve writes the
// chosen ones as one batch with source 'plan'; one ⌘Z takes the batch back.
//
// Today may be a weekend or an evening, so the dev account gets working hours
// covering every hour of every day for the length of this spec. They are extra
// rows beside its own, which are never touched, and afterAll deletes exactly
// the rows it added. The account's other open tasks for today are stood
// aside for the length of the spec (they start tomorrow, so the planner does
// not consider them): CI seeds about two thousand of them, many overdue, and
// they would otherwise outrank this spec's tasks and fill the day. afterAll
// puts every one back exactly as found, and Approve some keeps only this
// spec's two tasks, so nothing of the account's is written.
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

const first = uniqueTitle("plan draft");
const second = uniqueTitle("plan review");
const titles = [first, second];

let addedHours: string[] = [];
let stoodAside: { id: string; start_date: string | null; last_touched_at: string }[] = [];
let skip: string | null = null;

test.beforeAll(async () => {
  await withDb(async (c) => {
    const { rows } = await c.query<{ uid: string; sid: string; minute: number; rollover: number; today: string }>(
      `select u.id as uid, u.personal_space_id as sid,
              (extract(hour from timezone(s.timezone, now())) * 60 + extract(minute from timezone(s.timezone, now())))::int as minute,
              s.day_rollover_hour as rollover,
              (timezone(s.timezone, now()) - make_interval(hours => s.day_rollover_hour))::date::text as today
         from public.users u join public.user_settings s on s.user_id = u.id
        where u.email = $1`,
      [DEV_USER.email],
    );
    const me = rows[0];
    // Before the day rolls over the app is still on yesterday, which is over; late at night two blocks may not fit.
    if (me.minute < me.rollover * 60) skip = "before the day rollover: the app's today has already ended";
    else if (me.minute > 22 * 60) skip = "too late in the day to place two blocks";
    if (skip) return;
    addedHours = (
      await c.query<{ id: string }>(
        `insert into public.work_hours (id, space_id, user_id, weekday, start_time, end_time)
         select gen_random_uuid(), $1, $2, d, '00:00', '23:59' from generate_series(0, 6) d
         returning id`,
        [me.sid, me.uid],
      )
    ).rows.map((r) => r.id);
    stoodAside = (
      await c.query<{ id: string; start_date: string | null; last_touched_at: string }>(
        `select id, start_date::text, last_touched_at::text from public.tasks
          where space_id = $1 and deleted_at is null and state in ('inbox', 'active')
            and do_date is not null and do_date <= $2::date and (start_date is null or start_date <= $2::date) and title not like 'E2E %'`,
        [me.sid, me.today],
      )
    ).rows;
    if (stoodAside.length > 0) await c.query("update public.tasks set start_date = $2::date + 1 where id = any($1::uuid[])", [stoodAside.map((r) => r.id), me.today]);
    // Real fractional-index sort keys (the app computes the next key from the last one), and no day order of their own.
    for (const [title, estimate, key] of [
      [first, 45, "y0000000000000000000000011"],
      [second, 30, "y0000000000000000000000012"],
    ] as const) {
      await c.query(`insert into public.tasks (id, space_id, title, state, priority, do_date, estimate_min, sort_key) values (gen_random_uuid(), $1, $2, 'active', 3, $3::date, $4, $5)`, [me.sid, title, me.today, estimate, key]);
    }
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    // Exactly the rows this spec added; the account's own working hours were never changed. The E2E tasks go in the global teardown.
    if (addedHours.length > 0) await c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]);
    if (stoodAside.length === 0) return;
    // Start dates first (the touch trigger counts that as a touch), then last_touched_at on its own, which the
    // trigger leaves alone, so every row ages exactly as before.
    const ids = stoodAside.map((r) => r.id);
    await c.query("update public.tasks t set start_date = v.sd from unnest($1::uuid[], $2::date[]) as v(id, sd) where t.id = v.id", [ids, stoodAside.map((r) => r.start_date)]);
    await c.query("update public.tasks t set last_touched_at = v.lt from unnest($1::uuid[], $2::timestamptz[]) as v(id, lt) where t.id = v.id", [ids, stoodAside.map((r) => r.last_touched_at)]);
  });
});

const LIVE = `select count(*)::int as n from public.time_blocks b join public.tasks t on t.id = b.task_id
  where t.title = any($1) and b.source = 'plan' and b.deleted_at is null having count(*) = 2`;
const UNDONE = `select count(*)::int as n from public.time_blocks b join public.tasks t on t.id = b.task_id
  where t.title = any($1) and b.source = 'plan' and b.deleted_at is not null
    and not exists (select 1 from public.time_blocks l join public.tasks lt on lt.id = l.task_id where lt.title = any($1) and l.deleted_at is null)
  having count(*) = 2`;

test("the preview explains each block and writes nothing; Approve writes the batch as 'plan' blocks; ⌘Z takes it all back", async ({ page }) => {
  test.skip(skip !== null, skip ?? "");
  await openApp(page, "/today");
  await page.getByRole("button", { name: /^(Plan my day|Re-plan the rest of today)$/ }).click();

  const preview = page.getByTestId("plan-preview");
  await expect(preview).toBeVisible();
  const proposed = preview.getByRole("list", { name: "Proposed blocks" });
  for (const title of titles) {
    const row = proposed.getByRole("listitem").filter({ hasText: title });
    await expect(row).toBeVisible();
    // Time, title, and a sentence about why.
    await expect(row).toContainText(/\d\d:\d\d–\d\d:\d\d/);
    await expect(row.locator("p").nth(1)).toHaveText(/\w+.*\./);
  }
  await expect(page.getByTestId("timeline").getByTestId("plan-ghost").filter({ hasText: first })).toBeVisible();
  // Nothing is written while previewing.
  expect(await waitForRow(LIVE, [titles], 1_500)).toBeNull();

  // Keep only this spec's two tasks: the account's own tasks are left exactly as they are.
  await preview.getByRole("button", { name: "Approve some" }).click();
  const boxes = proposed.getByRole("checkbox");
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    const name = (await box.getAttribute("aria-label")) ?? "";
    if (!titles.some((t) => name.includes(t))) await box.uncheck();
  }
  await preview.getByRole("button", { name: /^Approve( 2 of \d+)?$/ }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Planned 2 blocks" })).toBeVisible();
  expect(await waitForRow(LIVE, [titles])).not.toBeNull();
  for (const title of titles) await expect(page.getByTestId("timeline").getByRole("button", { name: new RegExp(`^Block: ${title}`) })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");
  expect(await waitForRow(UNDONE, [titles])).not.toBeNull();
  await expect(page.getByTestId("timeline").getByRole("button", { name: new RegExp(`^Block: ${first}`) })).toHaveCount(0);
});
