// Offline (PRODUCT_SPEC.md §19.2, SYSTEM_DESIGN.md §12.2 "offline E2E"): a
// write while offline lands locally at once, the chip says so, and the row
// reaches Postgres once the connection is back.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, syncChip, uniqueTitle } from "./helpers";

test("a task added offline shows immediately and syncs on reconnect", async ({ page, context }) => {
  await openApp(page, "/today");
  await expect(syncChip(page)).toHaveAttribute("data-state", /synced|unprotected/, { timeout: 30_000 });

  await context.setOffline(true);
  const title = uniqueTitle("offline");
  await quickAdd(page, `${title} today`);
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
  await expect(syncChip(page)).toHaveAttribute("data-state", "offline", { timeout: 30_000 });
  expect(await waitForRow("select id from public.tasks where title = $1", [title], 3_000)).toBeNull();

  await context.setOffline(false);
  await expect(syncChip(page)).toHaveAttribute("data-state", /synced|unprotected/, { timeout: 60_000 });
  const stored = await waitForRow<{ state: string }>("select state from public.tasks where title = $1", [title], 30_000);
  expect(stored).toMatchObject({ state: "active" });
});
