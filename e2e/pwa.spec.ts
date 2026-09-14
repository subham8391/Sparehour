// The installable shell (SYSTEM_DESIGN.md §10): manifest, a registered service
// worker in the production build, and the offline page.
import { expect, test } from "./fixtures";
import { openApp } from "./helpers";

test("manifest, service worker and the offline page", async ({ page }) => {
  await openApp(page, "/today");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest/);
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ name: expect.stringContaining("Sparehour"), display: "standalone" });

  await expect
    .poll(async () => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration("/"))), { timeout: 30_000 })
    .toBe(true);

  await page.goto("/offline");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
