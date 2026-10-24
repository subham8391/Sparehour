// Today on another day (SCREENS.md §2.1, §12 Day, §24; DECISIONS.md "Today on another day"): `]` steps Today to
// tomorrow, whose header reads "Tomorrow · ← back to today", whose list holds its own tasks and whose timeline
// takes a block; the day lives in the address, so a reload keeps it; `T` with nothing selected and "back to today"
// come home; the palette's Go to tomorrow gets there from anywhere.
//
// The timeline is drawn only on a working day, so the dev account gets working hours over every hour of every day
// for the length of the spec (extra rows beside its own, deleted in afterAll).
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, isoPlus, waitForRow, withDb, type DevAccount } from "./db";
import { clickTitle, DEV_USER, openApp, quickAdd, uniqueTitle, waitForSync } from "./helpers";

let me: DevAccount;
let addedHours: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    addedHours = await addAllDayHours(c, me);
  });
});

test.afterAll(async () => {
  if (addedHours.length > 0) await withDb((c) => c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]));
});

test("] shows tomorrow — its tasks and timeline, blockable — the address keeps it, and back to today returns", async ({ page }) => {
  const tomorrow = isoPlus(me.today, 1);
  await openApp(page, "/today");
  // No day word in the title itself: quick-add would read it as the day and take it out of the title.
  const title = uniqueTitle("stepped ahead");
  await quickAdd(page, `${title} tomorrow ~30m`);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toHaveCount(0);

  await page.keyboard.press("]");
  await expect(page).toHaveURL(new RegExp(`/today\\?day=${tomorrow}$`));
  const back = page.getByRole("button", { name: "back to today" });
  await expect(back).toBeVisible();
  await expect(back.locator("..")).toContainText("Tomorrow");
  await expect(row).toBeVisible();
  // No rituals on another day.
  await expect(page.getByRole("link", { name: /^Morning plan/ })).toHaveCount(0);

  // The day is in the address: a reload opens on it.
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`day=${tomorrow}$`));
  // A reload opens the local database and syncs again (pwa.spec.ts): the list is drawn after that.
  await waitForSync(page);
  await expect(row).toBeVisible();

  // B blocks it on tomorrow's timeline.
  await clickTitle(row.getByRole("button", { name: title, exact: true }));
  await page.keyboard.press("Escape");
  await expect(row).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("b");
  await expect(page.getByTestId("timeline").getByRole("button", { name: new RegExp(`^Block: ${title}`) })).toBeVisible();
  const block = await waitForRow<{ day: string }>(
    `select (b.start_at at time zone s.timezone)::date::text as day
       from public.time_blocks b join public.tasks t on t.id = b.task_id join public.user_settings s on s.user_id = b.user_id
      where t.title = $1 and b.deleted_at is null`,
    [title],
  );
  expect(block?.day).toBe(tomorrow);

  await back.click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("button", { name: "back to today" })).toHaveCount(0);
  await expect(row).toHaveCount(0);
});

test("T with nothing selected comes back to today; [ steps to yesterday, read-only", async ({ page }) => {
  const yesterday = isoPlus(me.today, -1);
  await openApp(page, `/today?day=${isoPlus(me.today, 2)}`);
  await expect(page.getByRole("button", { name: "back to today" })).toBeVisible();
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/today$/);

  await page.keyboard.press("[");
  await expect(page).toHaveURL(new RegExp(`/today\\?day=${yesterday}$`));
  await expect(page.getByText(/^A day that has passed|^Finished tasks are kept for a week/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Today options" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reopen", exact: true })).toHaveCount(0);
});

test("the palette's Go to tomorrow opens Today on tomorrow from anywhere", async ({ page }) => {
  await openApp(page, "/inbox");
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByPlaceholder("Search or run a command…").fill("Go to tomorrow");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/today\\?day=${isoPlus(me.today, 1)}$`));
  await expect(page.getByRole("button", { name: "back to today" })).toBeVisible();
});
