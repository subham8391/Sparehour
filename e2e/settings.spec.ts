// Settings (SCREENS.md §18): a section list with the open section beside it
// from 900 px and a list that pushes into each section on a phone; a change
// saves at once and says so; the notification and data panels are there with
// honest words; the planning defaults and reduce motion take effect.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { DEV_USER, openApp, quickAdd, uniqueTitle } from "./helpers";

const SETTING = (column: string) => `select ${column} as v from public.user_settings s join public.users u on u.id = s.user_id where u.email = $1 and s.${column} = $2`;

async function section(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("region", { name })).toBeVisible();
}

test("a planning default saves immediately, reaches Postgres, and the device panels are present", async ({ page }) => {
  await openApp(page, "/settings");
  await section(page, "Planning");
  const estimate = page.getByLabel("Default estimate");
  await expect(estimate).toBeVisible();
  const before = await estimate.inputValue();
  // A value that differs from whatever a previous run left behind, so the change actually saves.
  const target = before === "35" ? "40" : "35";
  await estimate.fill(target);
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();
  expect(await waitForRow(SETTING("default_estimate_min"), [DEV_USER.email, Number(target)])).not.toBeNull();
  // Leave and come back: the value is read from the local database, not from the form's memory.
  await page.getByRole("link", { name: /^Today/ }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await section(page, "Planning");
  await expect(page.getByLabel("Default estimate")).toHaveValue(target);
  await page.getByLabel("Default estimate").fill(before && before !== target ? before : "30");
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();

  await section(page, "Notifications");
  await expect(page.getByText("Reminders on this device")).toBeVisible();
  await expect(page.getByRole("switch", { name: "A time block is starting" })).toBeVisible();
  await section(page, "Data");
  await expect(page.getByRole("button", { name: "JSON" })).toBeVisible();
  await section(page, "Account");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("two columns from 900 px: the list stays beside the section, and #calendar and #data land on theirs", async ({ page }) => {
  await openApp(page, "/settings#data");
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: /^Data/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "JSON" })).toBeVisible();
  await page.goto("/settings#calendar");
  await expect(page.getByRole("region", { name: "Calendar" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /^Calendar/ })).toHaveAttribute("aria-current", "page");
  // Keyboard: down the list from the open section.
  await nav.getByRole("link", { name: /^Calendar/ }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(nav.getByRole("link", { name: /^Notifications/ })).toBeFocused();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true });

  test("the list is one screen with summaries; a section pushes in and Back returns to the list", async ({ page }) => {
    await openApp(page, "/settings");
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await expect(nav.getByRole("link", { name: /^Working hours/ })).toContainText(/Mon/);
    await nav.getByRole("link", { name: /^Working hours/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Working hours" })).toBeVisible();
    await expect(nav).toBeHidden();
    await page.goBack();
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: /^Notifications/ }).click();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(nav).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Your day" })).toBeVisible();
  });
});

test("a split day saves as two stretches and one undo puts the day back", async ({ page }) => {
  const weekday = 6; // Sunday: the dev account does not work then, so Today's numbers are left alone.
  const rows = () =>
    withDb(async (c) => (await c.query<{ n: number }>("select count(*)::int as n from public.work_hours w join public.users u on u.id = w.user_id where u.email = $1 and w.weekday = $2 and w.deleted_at is null", [DEV_USER.email, weekday])).rows[0].n);
  await openApp(page, "/settings#working-hours");
  const box = page.getByRole("checkbox", { name: "Sunday is a working day" });
  // A run that stopped half-way may have left Sunday on: start from a day off.
  if (await box.isChecked()) await box.uncheck();
  await expect.poll(rows, { timeout: 15_000 }).toBe(0);
  await box.check();
  await expect.poll(rows, { timeout: 15_000 }).toBe(1);
  const sunday = box.locator("xpath=ancestor::div[contains(@class,'border-t')][1]");
  await sunday.getByRole("button", { name: "Add hours" }).click();
  await expect.poll(rows, { timeout: 15_000 }).toBe(2);
  await expect(sunday.getByLabel("Sunday start 2")).toBeVisible();
  // ⌘Z is for the page, not a focused button.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(rows, { timeout: 15_000 }).toBe(1);
  await page.getByRole("checkbox", { name: "Sunday is a working day" }).uncheck();
  await expect.poll(rows, { timeout: 15_000 }).toBe(0);
});

test("the default if missed applies to a new one-off task", async ({ page }) => {
  await openApp(page, "/settings#planning");
  const miss = page.getByRole("radiogroup", { name: "Default if missed" });
  await miss.getByRole("radio", { name: "Expire" }).click();
  expect(await waitForRow(SETTING("default_miss_policy"), [DEV_USER.email, "expire"])).not.toBeNull();
  try {
    await page.getByRole("link", { name: /^Inbox/ }).click();
    const title = uniqueTitle("expire default");
    await quickAdd(page, `${title} today`);
    expect(await waitForRow("select miss_policy from public.tasks where title = $1 and miss_policy = 'expire'", [title])).not.toBeNull();
  } finally {
    await page.goto("/settings#planning");
    await page.getByRole("radiogroup", { name: "Default if missed" }).getByRole("radio", { name: "Carry" }).click();
    expect(await waitForRow(SETTING("default_miss_policy"), [DEV_USER.email, "carry"])).not.toBeNull();
  }
});

test("Remind me and the badge save as their own columns", async ({ page }) => {
  await openApp(page, "/settings#notifications");
  await page.getByLabel("Remind me").selectOption("10");
  expect(await waitForRow(SETTING("block_start_lead_min"), [DEV_USER.email, 10])).not.toBeNull();
  await page.getByLabel("Remind me").selectOption("0");
  expect(await waitForRow(SETTING("block_start_lead_min"), [DEV_USER.email, 0])).not.toBeNull();
  const badge = page.getByRole("switch", { name: "Badge on the app icon" });
  await expect(badge).toHaveAttribute("aria-checked", "true");
  await badge.click();
  expect(await waitForRow(SETTING("badge_enabled"), [DEV_USER.email, false])).not.toBeNull();
  await expect(badge).toHaveAttribute("aria-checked", "false");
  await badge.click();
  expect(await waitForRow(SETTING("badge_enabled"), [DEV_USER.email, true])).not.toBeNull();
});

test("Reduce motion stamps the page before paint and survives a reload; System gives it back to the OS", async ({ page }) => {
  await openApp(page, "/settings#appearance");
  await page.getByRole("radiogroup", { name: "Motion" }).getByRole("radio", { name: "Reduce" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.getByRole("radiogroup", { name: "Motion" }).getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-motion", "reduce");
});
