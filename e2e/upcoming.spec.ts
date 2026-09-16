// Upcoming (SCREENS.md §3): a task due tomorrow sits in tomorrow's column;
// T moves the selected row to today, and the write reaches Postgres.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

test("tomorrow's task is under tomorrow; T brings it to today", async ({ page }) => {
  await openApp(page, "/upcoming");
  const title = uniqueTitle("upcoming");
  await quickAdd(page, `${title} tomorrow`);
  const tomorrow = new Date(Date.now() + 86_400_000);
  const dayLabel = new RegExp(`^${tomorrow.toLocaleDateString("en-GB", { weekday: "short" })} ${tomorrow.getDate()}`);
  const column = page.getByRole("group", { name: dayLabel });
  await expect(column.getByRole("listitem").filter({ hasText: title })).toBeVisible();

  await column.getByRole("listitem").filter({ hasText: title }).getByText("30m?", { exact: true }).click();
  await page.keyboard.press("t");
  const today = new Date().toISOString().slice(0, 10);
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2", [title, today])).not.toBeNull();
  const todayLabel = new RegExp(`^${new Date().toLocaleDateString("en-GB", { weekday: "short" })} ${new Date().getDate()}`);
  await expect(page.getByRole("group", { name: todayLabel }).getByRole("listitem").filter({ hasText: title })).toBeVisible();
});
