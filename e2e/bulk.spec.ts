// Multi-select (SCREENS.md §24): X ticks rows, the bulk bar moves every ticked
// row in one write, and one undo brings them all back.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { clickTitle, openApp, quickAdd, uniqueTitle } from "./helpers";

test("X ticks, the bulk bar moves both to today, one undo puts both back", async ({ page }) => {
  await openApp(page, "/inbox");
  const a = uniqueTitle("bulk a");
  const b = uniqueTitle("bulk b");
  await quickAdd(page, a);
  await quickAdd(page, b);
  const rowA = page.getByRole("row").filter({ hasText: a });
  const rowB = page.getByRole("row").filter({ hasText: b });
  // The title selects the row and opens the detail; Escape closes the detail and keeps the selection (the chips sit under the hover actions).
  await clickTitle(rowA.getByRole("button", { name: a, exact: true }));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await page.keyboard.press("x");
  await expect(rowA).toHaveAttribute("data-ticked", "true");
  await rowB.getByRole("checkbox", { name: `Select ${b}` }).check();

  const bar = page.getByRole("toolbar", { name: "Bulk edit" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Today", exact: true }).click();
  const today = new Date().toISOString().slice(0, 10);
  expect(await waitForRow("select count(*)::int as n from public.tasks where title in ($1, $2) and do_date = $3 having count(*) = 2", [a, b, today])).not.toBeNull();
  await expect(rowA).toHaveCount(0);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await waitForRow("select count(*)::int as n from public.tasks where title in ($1, $2) and do_date is null having count(*) = 2", [a, b])).not.toBeNull();
  await expect(page.getByRole("row").filter({ hasText: a })).toBeVisible();
});
