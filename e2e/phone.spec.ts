// The phone band (DESIGN_SYSTEM.md §4a, SCREENS.md §22): tab bar and FAB
// instead of the sidebar, the List · Day toggle on Today, quick-add as a sheet,
// and the morning review as a bottom sheet.
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

test("Today on a phone: tab bar, List · Day toggle, and the FAB adds a task", async ({ page }) => {
  await openApp(page, "/today");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  const tabs = page.getByRole("link", { name: /Inbox/ }).first();
  await expect(tabs).toBeVisible();

  const day = page.getByRole("button", { name: "Day", exact: true });
  test.skip((await day.count()) === 0, "not a working day: no Day view");
  await day.click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByTestId("timeline")).toBeHidden();

  const title = uniqueTitle("phone");
  await page.getByRole("button", { name: "Add a task" }).click();
  const box = page.getByRole("textbox", { name: "Task" });
  await box.fill(`${title} today`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  // The sheet's own Close (the scrim is a second, unnamed-in-the-UI way out).
  await page.getByRole("dialog", { name: "Add a task" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});

test.describe("morning review", () => {
  // The dev account always has carried-over tasks; the review only needs the switch on and an unreviewed day.
  test.beforeAll(async () => {
    await withDb(async (c) => {
      await c.query("update public.user_settings s set carry_review = true from public.users u where u.id = s.user_id and u.email = $1", [DEV_USER.email]);
      await c.query("delete from public.day_plans p using public.users u where u.id = p.user_id and u.email = $1 and p.date = current_date", [DEV_USER.email]);
    });
  });
  test.afterAll(async () => {
    await withDb(async (c) => {
      await c.query("update public.user_settings s set carry_review = false from public.users u where u.id = s.user_id and u.email = $1", [DEV_USER.email]);
      await c.query("delete from public.day_plans p using public.users u where u.id = p.user_id and u.email = $1 and p.date >= current_date", [DEV_USER.email]);
    });
  });

  test("the first open of the day asks as a bottom sheet, and Not now stamps the day without touching a task", async ({ page }) => {
    await openApp(page, "/today");
    const dialog = page.getByRole("dialog", { name: "Review carried-over tasks" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radiogroup").first().getByRole("radio", { name: "Keep" })).toBeChecked();
    await dialog.getByRole("button", { name: "Not now" }).click();
    await expect(dialog).toHaveCount(0);
    const stamped = await waitForRow<{ id: string }>(
      "select p.id from public.day_plans p join public.users u on u.id = p.user_id where u.email = $1 and p.date >= current_date - 1 and p.carry_reviewed_at is not null and p.planned_at is null and p.shutdown_at is null",
      [DEV_USER.email],
    );
    expect(stamped).not.toBeNull();
  });
});
