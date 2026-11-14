// Finished tasks are kept (DECISIONS.md, amendment 2026-11-14). The device holds a week of the Logbook; what was
// finished before that is moved to `finished_tasks` by the nightly job and comes under "Show older": the rows by
// their days, a read-only view with the note and steps, and Reopen, which makes one a task again with its steps
// and takes it out of the finished ones. A filter narrows the older ones too.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, waitForRow, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = Date.now().toString(36);
const T = {
  invoice: `${E2E_PREFIX}Older invoice ${n}`,
  rent: `${E2E_PREFIX}Older rent ${n}`,
  gym: `${E2E_PREFIX}Older gym ${n}`,
};
const project = `${E2E_PREFIX}Older project ${n}`;
const tag = `e2e-older-${n}`;
let invoiceId = "";
let projectId = "";

test.beforeAll(async () => {
  await withDb(async (c) => {
    const me = await devAccount(c, DEV_USER.email);
    projectId = (await c.query<{ id: string }>("insert into public.projects (space_id, name, state, sort_key) values ($1, $2, 'active', 'zz') returning id", [me.sid, project])).rows[0].id;
    const done = async (title: string, daysAgo: number, cols: string, values: unknown[]) =>
      (
        await c.query<{ id: string }>(
          `insert into public.tasks (space_id, title, sort_key, state, completed_at${cols ? `, ${cols}` : ""})
           values ($1, $2, 'zz', 'done', now() - make_interval(days => $3)${values.map((_, i) => `, $${i + 4}`).join("")}) returning id`,
          [me.sid, title, daysAgo, ...values],
        )
      ).rows[0].id;
    invoiceId = await done(T.invoice, 10, "project_id, notes_md, estimate_min", [projectId, "Number 12, to Bea", 45]);
    await done(T.rent, 20, "", []);
    await c.query("insert into public.checklist_items (space_id, task_id, title, done, sort_key) values ($1, $2, 'Attach the PDF', true, 'a0'), ($1, $2, 'Copy Bea', false, 'a1')", [me.sid, invoiceId]);
    const tagId = (await c.query<{ id: string }>("insert into public.tags (space_id, name) values ($1, $2) returning id", [me.sid, tag])).rows[0].id;
    await c.query("insert into public.task_tags (space_id, task_id, tag_id) values ($1, $2, $3)", [me.sid, invoiceId, tagId]);
    // A repeat with one finished day a fortnight back.
    const gym = (
      await c.query<{ id: string }>(
        `insert into public.tasks (space_id, title, sort_key, state, do_date, recurrence_rule, recurrence_mode, estimate_min)
         values ($1, $2, 'zz', 'active', current_date + 30, 'FREQ=WEEKLY', 'fixed', 60) returning id`,
        [me.sid, T.gym],
      )
    ).rows[0].id;
    await c.query("update public.tasks set recurrence_series_id = id where id = $1", [gym]);
    await c.query("insert into public.task_completions (space_id, task_id, occurrence_date, completed_at) values ($1, $2, current_date - 15, now() - interval '15 days')", [me.sid, gym]);
    // The nightly job, now: the three leave the synced tables for finished_tasks.
    await c.query("select private.archive_done_tasks()");
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.finished_tasks where title like $1", [`%${n}`]);
    await c.query("delete from public.tasks where title like $1", [`%${n}`]);
    await c.query("delete from public.projects where id = $1", [projectId]);
    await c.query("delete from public.tags where name = $1", [tag]);
  });
});

/** The seed may hold more than a page of older tasks: keeps asking until the row is in. */
async function showOlderUntil(page: Page, row: Locator): Promise<void> {
  await expect(async () => {
    if ((await row.count()) === 0) await page.getByRole("button", { name: "Show older" }).click({ timeout: 2_000 });
    await expect(row).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

test("Show older brings what was finished before this week; a row opens read-only and Reopen makes it a task again", async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page, "/logbook");
  // Not on the device: the week it holds has none of them.
  await expect(page.getByRole("row").filter({ hasText: T.invoice })).toHaveCount(0);

  // Under a filter the older ones are asked for with it: the project's one comes, the other does not.
  await openApp(page, `/logbook?project=${projectId}`);
  await page.getByRole("button", { name: "Show older" }).click();
  await expect(page.getByRole("row").filter({ hasText: T.invoice })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: T.rent })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "That is everything." })).toBeVisible();

  await openApp(page, "/logbook");
  const invoice = page.getByRole("row").filter({ hasText: T.invoice });
  await showOlderUntil(page, page.getByRole("row").filter({ hasText: T.rent }));
  await expect(invoice).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: T.gym })).toBeVisible();
  await expect(page.getByText("The last week and older")).toBeVisible();

  // The read-only view: when, where it was filed, its tag, steps and note.
  await invoice.getByRole("button", { name: T.invoice }).first().click();
  const peek = page.getByRole("dialog", { name: "Finished task" });
  await expect(peek.getByRole("heading", { name: T.invoice })).toBeVisible();
  await expect(peek).toContainText(/Finished \w+ \d+ \w+ · \d{2}:\d{2}/);
  await expect(peek).toContainText(`${project} · 45m`);
  await expect(peek).toContainText(`@${tag}`);
  await expect(peek).toContainText("Attach the PDF");
  await expect(peek).toContainText("Number 12, to Bea");

  // Reopen: a task again, with its steps and tag; no longer a finished one.
  await peek.getByRole("button", { name: "Reopen" }).click();
  await expect(peek).toHaveCount(0);
  await expect(invoice).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where id = $1 and state = 'active' and completed_at is null and notes_md = 'Number 12, to Bea'", [invoiceId])).not.toBeNull();
  expect(await waitForRow("select 1 from public.checklist_items where task_id = $1 group by task_id having count(*) = 2", [invoiceId])).not.toBeNull();
  expect(await waitForRow("select 1 from public.task_tags where task_id = $1", [invoiceId])).not.toBeNull();
  expect((await withDb((c) => c.query("select 1 from public.finished_tasks where id = $1", [invoiceId]))).rows).toEqual([]);
  // It is on the device as any task is: its project page has it.
  await openApp(page, `/project/${projectId}`);
  await expect(page.getByRole("row").filter({ hasText: T.invoice })).toBeVisible();

  // A repeat's finished day has no Reopen: it is one day of a task that is still running.
  await openApp(page, "/logbook");
  const gym = page.getByRole("row").filter({ hasText: T.gym });
  await showOlderUntil(page, gym);
  await gym.getByRole("button", { name: T.gym }).first().click();
  await expect(peek).toContainText("One day of a repeating task.");
  await expect(peek.getByRole("button", { name: "Reopen" })).toHaveCount(0);
  await peek.getByRole("button", { name: "Close" }).click();
});

test("search finds an older finished task when asked, and it opens read-only from there", async ({ page }) => {
  await openApp(page, `/search?q=${encodeURIComponent(`Older rent ${n}`)}`);
  // The device's own search has no such task: it was finished before the week it holds.
  await expect(page.getByRole("row").filter({ hasText: T.rent })).toHaveCount(0);
  await page.getByRole("button", { name: "Search older finished tasks" }).click();
  const older = page.getByRole("region", { name: "Finished earlier" });
  const rent = older.getByRole("row").filter({ hasText: T.rent });
  await expect(rent).toBeVisible();
  await expect(older.getByRole("row")).toHaveCount(1);
  await rent.getByRole("button", { name: T.rent }).first().click();
  const peek = page.getByRole("dialog", { name: "Finished task" });
  await expect(peek.getByRole("heading", { name: T.rent })).toBeVisible();
  await expect(peek.getByRole("button", { name: "Reopen" })).toBeVisible();
  await peek.getByRole("button", { name: "Close" }).click();

  // Words nothing older holds: said plainly.
  await openApp(page, `/search?q=${encodeURIComponent(`no such thing ${n}`)}`);
  await page.getByRole("button", { name: "Search older finished tasks" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nothing older matches." })).toBeVisible();
});
