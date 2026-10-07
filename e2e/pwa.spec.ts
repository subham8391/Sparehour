// The installable shell (SYSTEM_DESIGN.md §10): manifest, a registered service
// worker in the production build, and the offline page; the forced update
// (§10.2) and the storage error state (§10.3).
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { openApp, quickAdd, uniqueTitle, waitForSync } from "./helpers";

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

// The forced update (SYSTEM_DESIGN.md §10.2): private.app_config's min_client_version above this build closes
// "Update required" over the app, which lets the queued change upload and only then reloads. The reload brings back
// this same build here, so the screen says to close and reopen Sparehour, with Reload, instead of looping.
test.describe("forced update", () => {
  // Above any build. Every other spec runs without a gate: it is always taken away again.
  const GATE = "9999.01.01.0000";
  const setGate = (value: string | null) =>
    withDb(async (c) => {
      if (value === null) await c.query("delete from private.app_config where key = 'min_client_version'");
      else await c.query("insert into private.app_config (key, value) values ('min_client_version', $1) on conflict (key) do update set value = excluded.value", [value]);
    });

  test.afterEach(async () => {
    await setGate(null);
  });

  test("a build below the gate blocks with Update required, uploads the queued change first, then reloads, and does not loop", async ({ page, context }) => {
    test.setTimeout(180_000);
    await openApp(page, "/inbox");
    // Uploads fail until the reload, so the change is still queued when the gate closes; after it each one is held a
    // moment, and the time it went through is noted.
    let armed = false;
    let uploadedAt = 0;
    await context.route("**/api/sync/upload", async (route) => {
      if (!armed) return route.abort("internetdisconnected");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      try {
        await route.continue();
        uploadedAt ||= Date.now();
      } catch {
        // the page moved on: this one never went
      }
    });
    const title = uniqueTitle("forced update");
    await quickAdd(page, title);
    expect(await waitForRow("select 1 from public.tasks where title = $1", [title], 2_000)).toBeNull();

    await setGate(GATE);
    await page.reload();
    armed = true;
    // The app reloads by itself once the queue is empty, and not before: the change goes up first.
    const reloaded = page.waitForEvent("load", { timeout: 90_000 });
    reloaded.catch(() => undefined); // awaited below; a test that fails first leaves it unhandled otherwise
    const dialog = page.getByRole("alertdialog", { name: "Update required" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("status")).toContainText(/still to upload/);
    await reloaded;
    const reloadedAt = Date.now();
    expect(uploadedAt).toBeGreaterThan(0);
    expect(uploadedAt).toBeLessThan(reloadedAt);
    expect(await waitForRow("select 1 from public.tasks where title = $1", [title])).not.toBeNull();

    // Still this build after the reload: no second round, the way out instead.
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole("status")).toHaveText("It opened the old version again. Close Sparehour completely, then open it again.", { timeout: 30_000 });
    await expect(dialog.getByRole("button", { name: "Reload" })).toBeVisible();
  });
});

// A window whose storage will not open (a private window, most often; SYSTEM_DESIGN.md §10.3, no in-memory fallback
// at M1) shows the inline error state with Try again and Copy details, never a blank screen or "Opening…" forever.
test("storage that will not open shows the inline error state", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(StorageManager.prototype, "getDirectory", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Security error when calling GetDirectory", "SecurityError")),
    });
  });
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1, name: "Sparehour can’t open its storage in this window." })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.getByRole("button", { name: "Copy details" }).click();
  // Copied, or shown in place where the clipboard refuses.
  await expect(page.getByRole("status").filter({ hasText: /Copied\.|Couldn’t copy/ })).toBeVisible();
});
