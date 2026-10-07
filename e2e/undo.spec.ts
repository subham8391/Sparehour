// Undo for every action (FEATURES.md §8): completing a task from the list is
// one ⌘Z away, and the reversal reaches Postgres like the action did.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

test("complete from the list, then ⌘Z: the task is back, active in Postgres", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("undo");
  await quickAdd(page, title);
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: `Complete ${title}` }).click();
  await expect(row).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'done'", [title])).not.toBeNull();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  // An Inbox task is `inbox` again, not `active`: the undo restores exactly what was there.
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'inbox' and completed_at is null", [title])).not.toBeNull();
});

// Redo (SCREENS.md §24 "Cmd+Z · Cmd+Shift+Z", §12 App "Undo · Redo"; DECISIONS.md "Redo": the undo's toast offers it).
test("⇧⌘Z, the undo's toast and the palette's Redo each complete it again, and Postgres follows every step", async ({ page }) => {
  const DONE = "select id from public.tasks where title = $1 and state = 'done' and completed_at is not null";
  const OPEN = "select id from public.tasks where title = $1 and state = 'inbox' and completed_at is null";
  await openApp(page, "/inbox");
  const title = uniqueTitle("redo");
  await quickAdd(page, title);
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: `Complete ${title}` }).click();
  await expect(row).toHaveCount(0);
  expect(await waitForRow(DONE, [title])).not.toBeNull();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(row).toBeVisible();
  expect(await waitForRow(OPEN, [title])).not.toBeNull();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(row).toHaveCount(0);
  expect(await waitForRow(DONE, [title])).not.toBeNull();

  // The touch path: the toast that confirms the undo carries Redo.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(row).toBeVisible();
  await page.getByRole("status").filter({ hasText: `Undone: Completed “${title}”` }).getByRole("button", { name: "Redo" }).click();
  await expect(row).toHaveCount(0);
  expect(await waitForRow(DONE, [title])).not.toBeNull();

  // The palette's App group.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(row).toBeVisible();
  expect(await waitForRow(OPEN, [title])).not.toBeNull();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox", { name: "Search or run a command" }).fill("Redo");
  await expect(palette.getByRole("option", { selected: true })).toHaveText(/^Redo/);
  await page.keyboard.press("Enter");
  await expect(row).toHaveCount(0);
  expect(await waitForRow(DONE, [title])).not.toBeNull();
});
