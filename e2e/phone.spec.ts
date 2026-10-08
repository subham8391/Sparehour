// The phone band (DESIGN_SYSTEM.md §4a, SCREENS.md §22): tab bar and FAB
// instead of the sidebar, the List · Day toggle on Today, quick-add as a sheet,
// and the morning review as a bottom sheet.
import { expect, test } from "./fixtures";
import { devAccount, freshMorning, morningBack, waitForRow, withDb, type ClosedDay, type DevAccount } from "./db";
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
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
});

test("an Inbox row's ⋯ sheet starts with Today · Tomorrow · Someday · Project…, and Select shows the checkboxes", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("phone triage");
  const add = page.getByRole("textbox", { name: "Add to Inbox" });
  await add.fill(title);
  await add.press("Enter");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "More actions" }).click();
  const menu = page.getByRole("menu", { name: "More actions" });
  await expect(menu.getByRole("separator")).toBeAttached();
  const items = menu.getByRole("menuitem");
  for (const [i, name] of ["Today", "Tomorrow", "Someday", "Project…"].entries()) await expect(items.nth(i)).toHaveText(name);
  // Project…: the project picker, then the estimate and the deadline behind it. No project keeps it in the Inbox.
  await items.nth(3).click();
  const picker = page.getByRole("dialog", { name: "Move this task to a project" });
  await picker.getByRole("option", { name: "No project" }).click();
  const details = page.getByRole("dialog", { name: "Estimate and deadline" });
  await details.getByRole("button", { name: "15m", exact: true }).click();
  await details.getByRole("button", { name: "Done" }).click();
  expect(await waitForRow("select id from public.tasks where title = $1 and estimate_min = 15 and state = 'inbox'", [title])).not.toBeNull();

  await page.getByRole("button", { name: "Select" }).click();
  await expect(row.getByRole("checkbox", { name: `Select ${title}` })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(row.getByRole("checkbox")).toHaveCount(0);
});

test.describe("morning review", () => {
  // The dev account always has carried-over tasks; the review only needs the switch on, an unreviewed day and a
  // yesterday the shutdown did not close.
  let me: DevAccount;
  let closed: ClosedDay[] = [];
  test.beforeAll(async () => {
    await withDb(async (c) => {
      me = await devAccount(c, DEV_USER.email);
      await c.query("update public.user_settings s set carry_review = true from public.users u where u.id = s.user_id and u.email = $1", [DEV_USER.email]);
      closed = await freshMorning(c, me);
    });
  });
  test.afterAll(async () => {
    await withDb(async (c) => {
      await c.query("update public.user_settings s set carry_review = false from public.users u where u.id = s.user_id and u.email = $1", [DEV_USER.email]);
      await morningBack(c, me, closed);
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
      "select p.id from public.day_plans p where p.user_id = $1 and p.date = $2::date and p.carry_reviewed_at is not null and p.planned_at is null and p.shutdown_at is null",
      [me.uid, me.today],
    );
    expect(stamped).not.toBeNull();
  });
});
