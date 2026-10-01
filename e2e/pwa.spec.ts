// The installable shell (SYSTEM_DESIGN.md §10): manifest, a registered service
// worker in the production build, and the offline page.
import { expect, test } from "./fixtures";
import { openApp, waitForSync } from "./helpers";

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

// Found by the end-to-end walkthrough: once the service worker controlled the page, it answered the request for
// Turbopack's worker bootstrap from its cache, the bootstrap lost its #params fragment, the local database never
// opened, and every reload (or new tab, or reopened app) stayed on "Opening…". Each test here opens a fresh
// context, which is why the rest of the suite never saw it.
test("after the service worker takes over, a reload opens the local database and syncs again", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /worker bootstrap|database or sync worker/i.test(m.text())) errors.push(m.text());
  });
  await openApp(page, "/inbox");
  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 }).toBe(true);
  for (let n = 0; n < 2; n++) {
    await page.reload();
    await waitForSync(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
