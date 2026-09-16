// The two rituals (SCREENS.md §§7–8): the morning plan stamps planned_at and
// returns to Today; the shutdown records a rating and a highlight, closes the
// day, and Today shows the closing card.
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { DEV_USER, openApp } from "./helpers";

const PLAN = "select planned_at, shutdown_at, day_rating, highlights from public.day_plans p join public.users u on u.id = p.user_id where u.email = $1 and p.date = current_date";

test.afterEach(async () => {
  // Leave the dev account's day open for whoever uses it next.
  await withDb((c) => c.query("delete from public.day_plans p using public.users u where u.id = p.user_id and u.email = $1 and p.date >= current_date", [DEV_USER.email]));
});

test("morning plan: three steps, Done stamps the day plan and lands on Today", async ({ page }) => {
  await openApp(page, "/plan");
  await expect(page.getByRole("heading", { name: "Here’s your day" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick today’s tasks" })).toBeVisible();
  await page.getByRole("button", { name: "Next · Block time" }).click();
  await expect(page.getByRole("heading", { name: "Block time" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/today/);
  const plan = await waitForRow<{ planned_at: string | null }>(PLAN, [DEV_USER.email]);
  expect(plan?.planned_at).not.toBeNull();
});

test("shutdown: rating and highlight are kept, the day closes, Today shows the card", async ({ page }) => {
  await openApp(page, "/shutdown");
  // Steps vary with the day (carry-over first when there is anything to carry); walk until the rating.
  for (let i = 0; i < 4; i++) {
    if (await page.getByRole("radiogroup", { name: "Day rating" }).isVisible()) break;
    await page.getByRole("button", { name: /^Next/ }).first().click();
  }
  await page.getByRole("radiogroup", { name: "Day rating" }).getByRole("radio").nth(3).click();
  await page.getByRole("button", { name: /^Next/ }).first().click();
  const highlight = page.getByLabel("Highlight");
  await highlight.fill("Shipped the thing");
  await highlight.press("Enter");
  // Tomorrow's preview sits between the highlight and the last step; walk to the end.
  // Exact: the step strip also has a button whose name ends in "Close the day".
  const close = page.getByRole("button", { name: "Close the day", exact: true });
  for (let i = 0; i < 3 && !(await close.isVisible()); i++) await page.getByRole("button", { name: /^Next/ }).first().click();
  await close.click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText("That’s the day.")).toBeVisible();
  await expect(page.getByText(/Worth it: Shipped the thing/)).toBeVisible();
  const plan = await waitForRow<{ shutdown_at: string | null; day_rating: number | null; highlights: string | null }>(`${PLAN} and shutdown_at is not null`, [DEV_USER.email]);
  expect(plan).toMatchObject({ day_rating: 4, highlights: "Shipped the thing" });
});
