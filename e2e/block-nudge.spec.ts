// The first-block reminder ask (PRODUCT_SPEC.md §14 rule 7, ONBOARDING.md):
// on a device that has not been asked, making a block offers "Want a nudge
// when this starts?" inline on Today; Not now is remembered on the device.
// The browser's permission is pinned to "not asked yet" so the run does not
// depend on how this Chromium answers.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

async function blockOne(page: Page, title: string) {
  await quickAdd(page, `${title} today ~15m`);
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: title, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(row).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("b");
  await expect(page.getByRole("status").filter({ hasText: `Blocked “${title}”` })).toBeVisible();
}

test("the first block asks once; Not now never asks again on this device", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "default" });
  });
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
