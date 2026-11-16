// Upcoming (SCREENS.md §3): a task due tomorrow sits in tomorrow's column;
// T moves the selected row to today, and the write reaches Postgres.
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, waitForRow, withDb } from "./db";
import { clickTitle, DEV_USER, openApp, quickAdd, uniqueTitle } from "./helpers";

/**
 * A day column shows six rows and folds the rest behind "…N more" (SCREENS.md §3); CI's seed fills days, so a
 * task just added can sit behind the fold. Open it when the row isn't there already.
 */
async function rowIn(column: Locator, title: string): Promise<Locator> {
  const row = column.getByRole("listitem").filter({ hasText: title });
  const more = column.getByRole("button", { name: /^Show \d+ more on / });
  await expect(row.or(more).first()).toBeVisible();
  if (!(await row.isVisible())) await more.click();
  await expect(row).toBeVisible();
  return row;
}

test("tomorrow's task is under tomorrow; T brings it to today", async ({ page }) => {
  await openApp(page, "/upcoming");
  const title = uniqueTitle("upcoming");
  await quickAdd(page, `${title} tomorrow`);
  // Days are the account's own: its zone, and a day that starts at its rollover hour, so between midnight and that
  // hour "tomorrow" is still the calendar's today. Read from the account, never from this machine's clock.
  const { today } = await withDb((c) => devAccount(c, DEV_USER.email));
  const label = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return new RegExp(`^${d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}`);
  };
  const dayLabel = label(isoPlus(today, 1));
  const column = page.getByRole("group", { name: dayLabel });
  const row = await rowIn(column, title);

  // Upcoming rows now carry the same actions as every other list, and on a pointer device that zone
  // sits over the chips on hover — so the row is selected the way today.spec does it: the title opens
  // the detail, Escape closes it, and the selection stays.
  await clickTitle(row.getByRole("button", { name: title, exact: true }));
  await page.keyboard.press("Escape");
  await expect(row).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("t");
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2", [title, today])).not.toBeNull();
  const todayLabel = label(today);
  await rowIn(page.getByRole("group", { name: todayLabel }), title);
});
