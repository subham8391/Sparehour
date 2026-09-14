// Inbox (SCREENS.md §5): a quick-add with no day lands here; Today moves it out.
import { expect, test } from "./fixtures";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

test("a task without a day goes to the Inbox, and Today moves it to the day", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("inbox");
  await quickAdd(page, title);
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Today", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("link", { name: /^Today/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});
