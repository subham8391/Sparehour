// Search (SCREENS.md §13): `/` opens it, the query lives in the URL, a chip narrows.
import { expect, test } from "./fixtures";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

test("/ opens search; the query finds a task and lands in the URL; a chip narrows", async ({ page }) => {
  await openApp(page, "/today");
  const title = uniqueTitle("findable");
  await quickAdd(page, `${title} today`);
  await page.keyboard.press("/");
  await expect(page).toHaveURL(/\/search/);
  const box = page.getByRole("searchbox", { name: "Search" });
  await expect(box).toBeFocused();
  await box.fill(title);
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(title).replace(/%20/g, "\\+")}`));
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("menuitem", { name: "No estimate" }).click();
  await expect(page).toHaveURL(/noestimate=1/);
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  await page.getByRole("button", { name: "Remove filter no estimate" }).click();
  await expect(page).not.toHaveURL(/noestimate=1/);
});
