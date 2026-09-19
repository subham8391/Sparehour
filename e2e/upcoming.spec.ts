// Upcoming (SCREENS.md §3): a task due tomorrow sits in tomorrow's column;
// T moves the selected row to today, and the write reaches Postgres.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

const ZONE = "Europe/London";

test("tomorrow's task is under tomorrow; T brings it to today", async ({ page }) => {
  await openApp(page, "/upcoming");
  const title = uniqueTitle("upcoming");
  await quickAdd(page, `${title} tomorrow`);
  // Day labels follow the account's zone (Europe/London), not the machine's: late in the evening they differ.
  const label = (d: Date) => new RegExp(`^${d.toLocaleDateString("en-GB", { weekday: "short", timeZone: ZONE })} ${d.toLocaleDateString("en-GB", { day: "numeric", timeZone: ZONE })}`);
  const tomorrow = new Date(Date.now() + 86_400_000);
  const dayLabel = label(tomorrow);
  const column = page.getByRole("group", { name: dayLabel });
  await expect(column.getByRole("listitem").filter({ hasText: title })).toBeVisible();

  // Upcoming rows now carry the same actions as every other list, and on a pointer device that zone
  // sits over the chips on hover — so the row is selected the way today.spec does it: the title opens
  // the detail, Escape closes it, and the selection stays.
  const row = column.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: title, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(row).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("t");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2", [title, today])).not.toBeNull();
  const todayLabel = label(new Date());
  await expect(page.getByRole("group", { name: todayLabel }).getByRole("listitem").filter({ hasText: title })).toBeVisible();
});
