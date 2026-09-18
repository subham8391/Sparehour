// Someday and the Logbook (SCREENS.md §§9–10): a parked task shows up in
// Someday and can come back; a completed one is in the Logbook under today.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

test("Someday parks a task and Today brings it back; the Logbook lists what was done", async ({ page }) => {
  await openApp(page, "/inbox");
  const parked = uniqueTitle("park");
  const done = uniqueTitle("done");
  await quickAdd(page, parked);
  await quickAdd(page, done);
  const row = page.getByRole("listitem").filter({ hasText: parked });
  // The row's actions appear on hover, as they do for a person.
  await row.hover();
  await row.getByRole("button", { name: "Someday" }).click();
  await expect(row).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'someday'", [parked])).not.toBeNull();

  await page.getByRole("link", { name: "Someday" }).click();
  const parkedRow = page.getByRole("listitem").filter({ hasText: parked });
  await expect(parkedRow).toBeVisible();
  await parkedRow.hover();
  await parkedRow.getByRole("button", { name: "Today", exact: true }).click();
  const today = new Date().toISOString().slice(0, 10);
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'active' and do_date = $2", [parked, today])).not.toBeNull();

  await page.getByRole("link", { name: /^Inbox/ }).click();
  const doneRow = page.getByRole("listitem").filter({ hasText: done });
  await doneRow.getByRole("button", { name: `Complete ${done}` }).click();
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'done'", [done])).not.toBeNull();
  await page.getByRole("link", { name: "Logbook" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: done })).toBeVisible({ timeout: 30_000 });
});
