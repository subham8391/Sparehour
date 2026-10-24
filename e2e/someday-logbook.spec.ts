// Someday and the Logbook (SCREENS.md §§9–10): a parked task shows up in
// Someday and can come back; a completed one is in the Logbook under today.
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

// This test's own rows, removed whether it passed or not: a retry, or the next spec in the shard, must not meet them
// (a leftover "E2E done …" in the Inbox once matched another spec's "Done" button).
const made: string[] = [];
test.afterEach(async () => {
  const titles = made.splice(0);
  if (titles.length) await withDb((c) => c.query("delete from public.tasks where title = any($1)", [titles]));
});

/**
 * Hovers the row and clicks one of its hover actions, as a person does. The row's actions take pointer events only
 * while it is hovered, so when the list moves under the pointer (a sync re-render on a slow runner), the click lands
 * on a title instead and would wait forever: hover again and retry until it lands.
 */
async function rowAction(row: Locator, name: string, exact = false): Promise<void> {
  await expect(async () => {
    await row.hover();
    await row.getByRole("button", { name, exact }).click({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

test("Someday parks a task and Today brings it back; the Logbook lists what was done", async ({ page }) => {
  await openApp(page, "/inbox");
  const parked = uniqueTitle("park");
  const done = uniqueTitle("done");
  made.push(parked, done);
  await quickAdd(page, parked);
  await quickAdd(page, done);
  const row = page.getByRole("row").filter({ hasText: parked });
  // Both rows in place before pointing at one, so the second does not push the first from under the pointer.
  await expect(page.getByRole("row").filter({ hasText: done })).toBeVisible();
  await expect(row).toBeVisible();
  await rowAction(row, "Someday");
  await expect(row).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'someday'", [parked])).not.toBeNull();

  await page.getByRole("link", { name: "Someday" }).click();
  const parkedRow = page.getByRole("row").filter({ hasText: parked });
  await expect(parkedRow).toBeVisible();
  await rowAction(parkedRow, "Today", true);
  const today = new Date().toISOString().slice(0, 10);
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'active' and do_date = $2", [parked, today])).not.toBeNull();

  await page.getByRole("link", { name: /^Inbox/ }).click();
  const doneRow = page.getByRole("row").filter({ hasText: done });
  await doneRow.getByRole("button", { name: `Complete ${done}` }).click();
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'done'", [done])).not.toBeNull();
  await page.getByRole("link", { name: "Logbook" }).click();
  await expect(page.getByRole("row").filter({ hasText: done })).toBeVisible({ timeout: 30_000 });
});
