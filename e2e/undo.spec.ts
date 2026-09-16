// Undo for every action (FEATURES.md §8): completing a task from the list is
// one ⌘Z away, and the reversal reaches Postgres like the action did.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

test("complete from the list, then ⌘Z: the task is back, active in Postgres", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("undo");
  await quickAdd(page, title);
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: `Complete ${title}` }).click();
  await expect(row).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'done'", [title])).not.toBeNull();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
  // An Inbox task is `inbox` again, not `active`: the undo restores exactly what was there.
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'inbox' and completed_at is null", [title])).not.toBeNull();
});
