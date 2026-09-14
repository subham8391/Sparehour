// The phone band (DESIGN_SYSTEM.md §4a, SCREENS.md §22): tab bar and FAB
// instead of the sidebar, the List · Day toggle on Today, quick-add as a sheet.
import { expect, test } from "./fixtures";
import { openApp, uniqueTitle } from "./helpers";

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
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});
