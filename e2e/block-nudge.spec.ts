// The first-block reminder ask (PRODUCT_SPEC.md §14 rule 7, ONBOARDING.md):
// on a device that has not been asked, making a block offers "Want a nudge
// when this starts?" inline on Today; Not now is remembered on the device;
// where reminders are already allowed it never asks. The browser's permission
// is pinned so the run does not depend on how this Chromium answers.
//
// Today may be a weekend or a day off, so for the length of the spec the dev
// account gets working hours over every hour of every day: extra rows beside
// its own, which are never touched, deleted in afterAll.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, withDb } from "./db";
import { clickTitle, DEV_USER, openApp, quickAdd, uniqueTitle } from "./helpers";

let addedHours: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    addedHours = await addAllDayHours(c, await devAccount(c, DEV_USER.email));
  });
});

test.afterAll(async () => {
  if (addedHours.length > 0) await withDb((c) => c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]));
});

/** Pins the browser's notification permission before the app reads it. */
async function permission(page: Page, value: NotificationPermission) {
  await page.addInitScript((v) => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => v });
  }, value);
}

async function blockOne(page: Page, title: string) {
  await quickAdd(page, `${title} today ~15m`);
  const row = page.getByRole("row").filter({ hasText: title });
  await clickTitle(row.getByRole("button", { name: title, exact: true }));
  await page.keyboard.press("Escape");
  await expect(row).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("b");
  await expect(page.getByRole("status").filter({ hasText: `Blocked “${title}”` })).toBeVisible();
}

test("the first block asks once; Not now never asks again on this device", async ({ page }) => {
  await permission(page, "default");
  await openApp(page, "/today");
  test.skip((await page.getByTestId("timeline").count()) === 0, "not a working day: no timeline to block on");
  await page.evaluate(() => localStorage.removeItem("sparehour.blockNudge"));
  // The ask needs a service worker to subscribe with; the production build registers one.
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker?.getRegistration("/")), null, { timeout: 30_000 });

  await blockOne(page, uniqueTitle("nudge one"));
  const ask = page.getByRole("status").filter({ hasText: "Want a nudge when this starts?" });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "Yes" })).toBeVisible();
  await ask.getByRole("button", { name: "Not now" }).click();
  await expect(ask).toHaveCount(0);

  await openApp(page, "/today");
  await blockOne(page, uniqueTitle("nudge two"));
  await expect(page.getByText("Want a nudge when this starts?")).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("sparehour.blockNudge"));
});

test("where reminders are already allowed, a first block never asks", async ({ page }) => {
  await permission(page, "granted");
  await openApp(page, "/today");
  test.skip((await page.getByTestId("timeline").count()) === 0, "not a working day: no timeline to block on");
  // Not because of an earlier "Not now": this device has never answered.
  await page.evaluate(() => localStorage.removeItem("sparehour.blockNudge"));
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker?.getRegistration("/")), null, { timeout: 30_000 });
  const title = uniqueTitle("nudge granted");
  await blockOne(page, title);
  await expect(page.getByTestId("timeline").getByRole("button", { name: new RegExp(`^Block: ${title}`) })).toBeVisible();
  // The ask would have come with the block; give it the beat it would have taken, then make sure it did not.
  await page.waitForTimeout(1_500);
  await expect(page.getByText("Want a nudge when this starts?")).toHaveCount(0);
});
