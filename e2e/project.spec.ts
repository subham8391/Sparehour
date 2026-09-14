// A project (SCREENS.md §9): reached from the sidebar, inline add under a
// section, a heading added and deleted with its tasks kept.
import { expect, test } from "./fixtures";
import { openApp, uniqueTitle } from "./helpers";

test("inline add, a heading, and deleting the heading keeps the task", async ({ page }) => {
  await openApp(page, "/today");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Acme" }).click();
  await expect(page).toHaveURL(/\/project\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acme");

  const title = uniqueTitle("project task");
  const add = page.getByRole("textbox", { name: "Add a task" }).first();
  await add.fill(title);
  await add.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();

  const heading = uniqueTitle("heading");
  const headingBox = page.getByRole("textbox", { name: "Add a heading" });
  await headingBox.fill(heading);
  await headingBox.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();

  await page.getByRole("button", { name: `Delete heading ${heading}` }).click();
  await expect(page.getByRole("heading", { level: 2, name: heading })).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});
