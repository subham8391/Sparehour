// Quiet hours say what they hold back (docs/product/REMINDERS_AND_AI_SPEC.md §1): a task with a time inside them
// says under its block that no reminder will come, with the way to Settings › Notifications, which names it under
// the two times. For the length of the spec the dev account has quiet hours 21:00–08:00 and reminders five minutes
// before a block; its own settings are put back in afterAll.
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, removeOwn, restoreSettings, saveSettings, withDb, type DevAccount, type SavedSettings } from "./db";
import { clickTitle, DEV_USER, openApp, quickAdd, uniqueTitle } from "./helpers";

let me: DevAccount;
let saved: SavedSettings | null = null;
const titles: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    saved = await saveSettings(c, me, ["quiet_hours_start", "quiet_hours_end", "notify_block_start", "block_start_lead_min"]);
    await c.query("update public.user_settings set quiet_hours_start = '21:00', quiet_hours_end = '08:00', notify_block_start = true, block_start_lead_min = 5 where user_id = $1", [me.uid]);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await removeOwn(c, titles);
    await restoreSettings(c, me, saved);
  });
});

test("a block inside quiet hours says no reminder will come, and Settings names it", async ({ page }) => {
  const title = uniqueTitle("quiet");
  titles.push(title);
  const tomorrow = isoPlus(me.today, 1);
  await openApp(page, `/today?day=${tomorrow}`);
  await quickAdd(page, `${title} tomorrow 23:30 ~15m`);

  const row = page.getByRole("row").filter({ hasText: title });
  await clickTitle(row.getByRole("button", { name: title, exact: true }));
  const note = page.getByTestId("block-held-note");
  await expect(note).toContainText("No reminder: 23:25 is inside quiet hours (21:00–08:00).");

  await note.getByRole("link", { name: "Change quiet hours" }).click();
  await expect(page).toHaveURL(/\/settings#notifications$/);
  const held = page.getByTestId("held-line");
  await expect(held).toContainText("Held back now:");
  await expect(held).toContainText("23:25");
});

test("a block outside quiet hours says nothing", async ({ page }) => {
  const title = uniqueTitle("loud");
  titles.push(title);
  await openApp(page, `/today?day=${isoPlus(me.today, 1)}`);
  await quickAdd(page, `${title} tomorrow 15:00 ~15m`);
  const row = page.getByRole("row").filter({ hasText: title });
  await clickTitle(row.getByRole("button", { name: title, exact: true }));
  await expect(page.getByText("15:00–15:15")).toBeVisible();
  await expect(page.getByTestId("block-held-note")).toHaveCount(0);
});
