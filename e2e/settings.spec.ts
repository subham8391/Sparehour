// Settings (SCREENS.md §18): a change saves at once and says so; the
// notification and data panels are there with honest words.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp } from "./helpers";

test("a planning default saves immediately, reaches Postgres, and the device panels are present", async ({ page }) => {
  await openApp(page, "/settings");
  const estimate = page.getByLabel("Default estimate");
  await expect(estimate).toBeVisible();
  const before = await estimate.inputValue();
  await estimate.fill("35");
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();
  expect(await waitForRow<{ n: number }>("select default_estimate_min as n from public.user_settings s join public.users u on u.id = s.user_id where u.email = $1 and s.default_estimate_min = 35", ["dev@sparehour.local"])).not.toBeNull();
  // Leave and come back: the value is read from the local database, not from the form's memory.
  await page.getByRole("link", { name: /^Today/ }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByLabel("Default estimate")).toHaveValue("35");
  await page.getByLabel("Default estimate").fill(before || "30");
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();

  await expect(page.getByText("Reminders on this device")).toBeVisible();
  await expect(page.getByRole("switch", { name: "A time block is starting" })).toBeVisible();
  await expect(page.getByRole("button", { name: "JSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
