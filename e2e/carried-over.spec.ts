// Carried over on Today (SCREENS.md §2.3, PRODUCT_SPEC.md §8.3): the
// three-carry ask — Keep today · Someday · Break it down · Drop, in place of
// the row's quick actions — shows on at most two tasks a day and once per
// task per seven days; Break it down converts the task into a project that
// opens with the cursor in its add row, and one Undo puts everything back;
// the ×N chip says "Moved N times since …"; with three or more rows the
// footer moves the whole pile at once, one undo each; above eight rows the
// section folds to one line.
//
// The section has to hold this spec's rows and nothing else (CI seeds
// hundreds of carried tasks, and the account's own carry high counts): every
// other open task due today or before is stood aside (started tomorrow) and
// every recorded ask in the account is cleared, since an ask recorded today on
// any task spends one of the day's two. afterAll puts both back exactly as
// found and removes this spec's own rows (and the project a conversion made),
// so later specs never meet them in their own carried pile.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { clearAsks, devAccount, isoPlus, putBack, removeOwn, restoreAsks, seedKey, standAside, waitForRow, withDb, type AskedAt, type DevAccount, type StoodAside } from "./db";
import { DEV_USER, openApp, shortDay, uniqueTitle } from "./helpers";

test.describe.configure({ mode: "serial" });

/** In carried order: most carried first, then the oldest do-date. */
const recent = uniqueTitle("ask asked three days ago");
const first = uniqueTitle("ask first");
const second = uniqueTitle("ask second");
const older = uniqueTitle("ask older day");
const third = uniqueTitle("ask third");
const steps = [uniqueTitle("break step one"), uniqueTitle("break step two")];
const note = "E2E why this was carried";
const folds = Array.from({ length: 6 }, (_, i) => uniqueTitle(`carried fold ${i + 1}`));
const own = [recent, first, second, older, third, ...steps, ...folds];

let me: DevAccount;
let stood: StoodAside[] = [];
let asked: AskedAt[] = [];

const carried = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: /^Carried over/ }) });
const row = (page: Page, title: string) => carried(page).getByRole("listitem").filter({ hasText: title });
const ask = (page: Page, title: string) => row(page, title).getByRole("group", { name: "Still want this?" });
/** This spec's rows in the order the section draws them. */
async function order(section: Locator): Promise<string[]> {
  const texts = await section.getByRole("listitem").allTextContents();
  return texts.map((t) => own.find((title) => t.includes(title))).filter((t): t is string => Boolean(t));
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    stood = await standAside(c, me, isoPlus(me.today, -1));
    asked = await clearAsks(c, me);
    const seed: [string, number, number, string | null][] = [
      // title, carry count, days behind, when its ask was last shown
      [recent, 9, 2, "3 days"],
      [first, 8, 2, null],
      [second, 7, 2, null],
      [third, 6, 2, null],
      [older, 6, 4, "8 days"],
    ];
    for (const [i, [title, count, behind, askedAgo]] of seed.entries()) {
      await c.query(
        `insert into public.tasks (id, space_id, title, state, do_date, estimate_min, sort_key, day_sort_key, carry_count, last_carried_at, carry_asked_at, notes_md)
         values (gen_random_uuid(), $1, $2, 'active', $3::date, 20, $4, $4, $5, $6::date, now() - $7::interval, $8)`,
        [me.sid, title, isoPlus(me.today, -behind), seedKey(`3${i}`), count, me.today, askedAgo, title === second ? note : null],
      );
    }
    for (const [i, step] of steps.entries()) {
      await c.query(
        `insert into public.checklist_items (id, space_id, task_id, title, done, sort_key)
         select gen_random_uuid(), space_id, id, $2, false, $3 from public.tasks where title = $1`,
        [second, step, `a${i}`],
      );
    }
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await removeOwn(c, own);
    await restoreAsks(c, asked);
    await putBack(c, stood);
  });
});

test("the ask shows on at most two tasks a day, never on one asked this week, with its four answers in place of the quick actions", async ({ page }) => {
  await openApp(page, "/today");
  const section = carried(page);
  await expect(row(page, first)).toBeVisible();
  // Most carried first; between equal counts the older do-date (the day first missed) comes first.
  await expect.poll(() => order(section)).toEqual([recent, first, second, older, third]);

  // The first two eligible in carried order ask; the one asked three days ago waits out its week, and the day's two are spent.
  await expect(ask(page, first)).toBeVisible();
  await expect(ask(page, second)).toBeVisible();
  for (const title of [recent, older, third]) await expect(ask(page, title)).toHaveCount(0);
  await expect(ask(page, first)).toContainText("Carried over 8 times — still want this?");
  expect(await ask(page, first).getByRole("button").allTextContents()).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
  // The ask takes the place of the row's quick actions; a row without one keeps them.
  await expect(row(page, first).getByRole("button", { name: "Tomorrow", exact: true })).toHaveCount(0);
  await expect(row(page, third).getByRole("button", { name: "Tomorrow", exact: true })).toHaveCount(1);
  // ×N names the day it was first missed.
  await expect(row(page, first).getByRole("img", { name: `Moved 8 times since ${shortDay(isoPlus(me.today, -2))}` })).toBeVisible();
  await expect(row(page, older).getByRole("img", { name: `Moved 6 times since ${shortDay(isoPlus(me.today, -4))}` })).toBeVisible();

  // Shown asks are recorded on the tasks (once on screen); the others are left as they were.
  expect(await waitForRow("select 1 from public.tasks where title = any($1) and carry_asked_at > now() - interval '10 minutes' having count(*) = 2", [[first, second]])).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and carry_asked_at is null", [third])).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and carry_asked_at < now() - interval '2 days'", [recent])).not.toBeNull();

  // Keep today answers it: the task joins today's list. The day's two asks are spent, so no other task starts asking.
  await ask(page, first).getByRole("button", { name: "Keep today" }).click();
  await expect(row(page, first)).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date = $2::date and state = 'active'", [first, me.today])).not.toBeNull();
  await page.waitForTimeout(1_000);
  await expect(ask(page, second)).toBeVisible();
  for (const title of [recent, older, third]) await expect(ask(page, title)).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and carry_asked_at is null", [third])).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and carry_asked_at < now() - interval '7 days'", [older])).not.toBeNull();
});

test("Break it down makes the task a project, opens it in its add row, and one Undo puts everything back", async ({ page }) => {
  await openApp(page, "/today");
  await ask(page, second).getByRole("button", { name: "Break it down" }).click();

  await expect(page).toHaveURL(/\/project\/[^/?]+\?add=1$/);
  await expect(page.getByRole("textbox", { name: "Add a task" })).toBeFocused();
  for (const step of steps) await expect(page.getByRole("listitem").filter({ hasText: step })).toBeVisible();

  // The project takes the task's name and note; its steps become open tasks in step order; the task is retired, and the server resets its count.
  const project = await waitForRow<{ id: string; notes_md: string | null }>("select id, notes_md from public.projects where name = $1 and deleted_at is null", [second]);
  expect(project).not.toBeNull();
  expect(project!.notes_md).toBe(note);
  expect(
    await waitForRow("select 1 from public.tasks where project_id = $1 and deleted_at is null and state = 'active' having string_agg(title, '|' order by sort_key) = $2", [project!.id, steps.join("|")]),
  ).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'archived' and carry_count = 0", [second])).not.toBeNull();

  await page.getByRole("status").filter({ hasText: "to a project" }).getByRole("button", { name: "Undo" }).click();
  // The removed project is not left open: the app steps back to Today, where the task is carried over again.
  await expect(page).toHaveURL(/\/today/);
  await expect(row(page, second)).toBeVisible();
  expect(await waitForRow("select 1 from public.projects where id = $1 and deleted_at is not null", [project!.id])).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where title = any($1) and deleted_at is not null having count(*) = 2", [steps])).not.toBeNull();
  expect(
    await waitForRow("select 1 from public.tasks where title = $1 and state = 'active' and archive_batch_id is null and do_date = $2::date and deleted_at is null", [second, isoPlus(me.today, -2)]),
  ).not.toBeNull();
  expect(
    await waitForRow("select 1 from public.checklist_items i join public.tasks t on t.id = i.task_id where t.title = $1 and i.deleted_at is null having count(*) = 2", [second]),
  ).not.toBeNull();
});

test("with three or more rows the footer moves the whole pile to tomorrow or Someday, each with one undo", async ({ page }) => {
  const pile = [recent, second, older, third];
  await openApp(page, "/today");
  for (const title of pile) await expect(row(page, title)).toBeVisible();
  const behind = "select 1 from public.tasks where title = any($1) and state = 'active' and do_date < $2::date having count(*) = 4";

  await carried(page).getByRole("button", { name: "Move all to tomorrow" }).click();
  for (const title of pile) await expect(row(page, title)).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = any($1) and do_date = $2::date having count(*) = 4", [pile, isoPlus(me.today, 1)])).not.toBeNull();
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  for (const title of pile) await expect(row(page, title)).toBeVisible();
  expect(await waitForRow(behind, [pile, me.today])).not.toBeNull();

  await carried(page).getByRole("button", { name: "All to Someday" }).click();
  for (const title of pile) await expect(row(page, title)).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = any($1) and state = 'someday' having count(*) = 4", [pile])).not.toBeNull();
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  for (const title of pile) await expect(row(page, title)).toBeVisible();
  expect(await waitForRow(behind, [pile, me.today])).not.toBeNull();
});

test("above eight rows the section starts folded to one line, and opening it holds for the day", async ({ page }) => {
  await withDb(async (c) => {
    for (const [i, title] of folds.entries()) {
      await c.query(
        `insert into public.tasks (id, space_id, title, state, do_date, estimate_min, sort_key, day_sort_key, carry_count, last_carried_at)
         values (gen_random_uuid(), $1, $2, 'active', $3::date, 15, $4, $4, 1, $5::date)`,
        [me.sid, title, isoPlus(me.today, -1), seedKey(`4${i}`), me.today],
      );
    }
  });
  await openApp(page, "/today");
  const fold = page.getByRole("button", { name: /^Carried over/ });
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(fold).toContainText(/10\s*—\s*Expand/);
  await expect(page.getByRole("listitem").filter({ hasText: recent })).toHaveCount(0);

  await fold.click();
  await expect(fold).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: /^Carried over\s*10/ })).toBeVisible();
  for (const title of [recent, folds[5]]) await expect(row(page, title)).toBeVisible();
  // Remembered for the rest of the day on this device.
  expect(await page.evaluate(() => localStorage.getItem("sparehour:carried-open"))).toBe(me.today);
});
