// Settings (SCREENS.md §18): a section list with the open section beside it
// from 900 px and a list that pushes into each section on a phone; a change
// saves at once and says so; the notification and data panels are there with
// honest words; the planning defaults and reduce motion take effect; a day
// takes up to three stretches of working hours and Today's day follows them;
// the icon badge follows its switch.
//
// These tests change the dev account's own settings and working hours. The
// settings columns they touch and every working-hours row are read in
// beforeAll and put back exactly in afterAll (a raw write, so the triggers do
// not move updated_at), and the rows the tests added are deleted.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, quickAdd, uniqueTitle } from "./helpers";

const SETTING = (column: string) => `select ${column} as v from public.user_settings s join public.users u on u.id = s.user_id where u.email = $1 and s.${column} = $2`;

/** The user_settings columns these tests write. */
const COLUMNS = ["default_estimate_min", "default_miss_policy", "block_start_lead_min", "badge_enabled"] as const;
interface HoursRow {
  id: string;
  start_time: string;
  end_time: string;
  deleted_at: string | null;
  updated_at: string;
}

let me: DevAccount;
let settingsBefore: Record<string, unknown> | null = null;
let hoursBefore: HoursRow[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    settingsBefore = (await c.query(`select ${COLUMNS.join(", ")}, updated_at::text from public.user_settings where user_id = $1`, [me.uid])).rows[0] ?? null;
    hoursBefore = (await c.query<HoursRow>("select id, start_time::text, end_time::text, deleted_at::text, updated_at::text from public.work_hours where user_id = $1", [me.uid])).rows;
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("begin");
    try {
      await c.query("set local session_replication_role = replica");
      await c.query("delete from public.work_hours where user_id = $1 and not (id = any($2::uuid[]))", [me.uid, hoursBefore.map((r) => r.id)]);
      if (hoursBefore.length > 0) {
        await c.query(
          `update public.work_hours w set start_time = v.st, end_time = v.et, deleted_at = v.da, updated_at = v.ua
             from unnest($1::uuid[], $2::time[], $3::time[], $4::timestamptz[], $5::timestamptz[]) as v(id, st, et, da, ua) where w.id = v.id`,
          [hoursBefore.map((r) => r.id), hoursBefore.map((r) => r.start_time), hoursBefore.map((r) => r.end_time), hoursBefore.map((r) => r.deleted_at), hoursBefore.map((r) => r.updated_at)],
        );
      }
      if (settingsBefore) {
        const values = COLUMNS.map((col) => settingsBefore![col]);
        await c.query(`update public.user_settings set ${COLUMNS.map((col, i) => `${col} = $${i + 2}`).join(", ")}, updated_at = $${COLUMNS.length + 2} where user_id = $1`, [
          me.uid,
          ...values,
          settingsBefore.updated_at,
        ]);
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
});

async function section(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: new RegExp(`^${name}`) }).click();
  // Exact: Account holds a "Delete account" region of its own.
  await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
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

test("Account shows the initials and how the account signs in; Delete account waits for the typed word, and Cancel keeps it", async ({ page }) => {
  // Never the dev account: the deletion request is refused here whatever happens (e2e/account-delete.spec.ts deletes a throwaway one).
  await page.route("**/api/account/delete", (route) => route.abort());
  await openApp(page, "/settings#account");
  const account = page.getByRole("region", { name: "Account", exact: true });
  await expect(account).toBeVisible();
  // The dev account has no picture, so its initials stand in; it signs in with an emailed code (the "email" identity).
  await expect(account.getByTestId("avatar-initials")).toHaveText("DU");
  await expect(account.getByText("Signed in with")).toBeVisible();
  await expect(account.getByText(/Email code/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/^Every task, step, project, area and tag/)).toBeVisible();
  await expect(sheet.getByText(/30 days to change your mind/)).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Export your data first" })).toBeVisible();
  const go = sheet.getByRole("button", { name: "Delete account", exact: true });
  await expect(go).toBeDisabled();
  const word = sheet.getByLabel(/to confirm/);
  await word.fill("delet");
  await expect(go).toBeDisabled();
  await word.fill("delete");
  await expect(go).toBeEnabled();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  expect(await waitForRow("select 1 from public.users where email = $1 and deleted_at is not null", [DEV_USER.email], 1_000)).toBeNull();
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

test.describe("at exactly 900 px", () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test("two columns begin here: the list stays beside the open section, with no Back", async ({ page }) => {
    await openApp(page, "/settings#planning");
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("region", { name: "Planning" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Planning/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeHidden();
  });
});

test.describe("one pixel narrower", () => {
  test.use({ viewport: { width: 899, height: 800 } });

  test("a section pushes in over the list, and Back brings the list back", async ({ page }) => {
    await openApp(page, "/settings");
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await nav.getByRole("link", { name: /^Planning/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Planning" })).toBeVisible();
    await expect(nav).toBeHidden();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(nav).toBeVisible();
    await expect(page).not.toHaveURL(/#planning/);
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

test("a day takes up to three stretches, and Today's day follows them at once", async ({ page }) => {
  test.skip(me.minute < me.rollover * 60, "before the day rollover the app's Today is yesterday, a different weekday");
  // Today's weekday, whatever it is: working hours are 0 = Monday, Postgres' isodow is 1 = Monday.
  const weekday = (new Date(`${me.today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const name = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][weekday];
  const stretches = () =>
    withDb(
      async (c) =>
        (
          await c.query<{ s: string }>(
            "select coalesce(string_agg(to_char(start_time, 'HH24:MI') || '–' || to_char(end_time, 'HH24:MI'), ', ' order by start_time), '') as s from public.work_hours where user_id = $1 and weekday = $2 and deleted_at is null",
            [me.uid, weekday],
          )
        ).rows[0].s,
    );

  await openApp(page, "/settings#working-hours");
  const box = page.getByRole("checkbox", { name: `${name} is a working day` });
  if (!(await box.isChecked())) await box.check();
  const day = box.locator("xpath=ancestor::div[contains(@class,'border-t')][1]");
  // Down to one stretch, whatever the day had, then 08:00–10:00.
  const remove = day.getByRole("button", { name: new RegExp(`^Remove ${name} `) });
  while ((await remove.count()) > 0) await remove.first().click();
  await day.getByLabel(`${name} end`, { exact: true }).fill("10:00");
  await day.getByLabel(`${name} start`, { exact: true }).fill("08:00");
  await expect.poll(stretches, { timeout: 15_000 }).toBe("08:00–10:00");

  // A second stretch after a gap, and a third: each saves the whole day.
  const add = day.getByRole("button", { name: "Add hours" });
  await add.click();
  await day.getByLabel(`${name} end 2`).fill("13:00");
  await expect(day.getByLabel(`${name} start 2`)).toHaveValue("11:00");
  await expect.poll(stretches, { timeout: 15_000 }).toBe("08:00–10:00, 11:00–13:00");
  await add.click();
  await day.getByLabel(`${name} end 3`).fill("16:00");
  await expect(day.getByLabel(`${name} start 3`)).toHaveValue("14:00");
  await expect.poll(stretches, { timeout: 15_000 }).toBe("08:00–10:00, 11:00–13:00, 14:00–16:00");
  // Three is the most a day takes.
  await expect(add).toHaveCount(0);

  // Today reads the same hours: the day runs 08:00–16:00 and both gaps are outside the working day on the timeline.
  await page.getByRole("link", { name: /^Today/ }).click();
  const yourDay = page.getByRole("complementary", { name: "Your day" });
  await expect(yourDay).toContainText("08:00 – 16:00");
  // Outside the hours: before the day, the two gaps, after it.
  await expect(yourDay.getByTestId("outside-hours")).toHaveCount(4);
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
    // Back to what it was (afterAll restores the column exactly too).
    const was = typeof settingsBefore?.default_miss_policy === "string" ? settingsBefore.default_miss_policy : "carry";
    await page.goto("/settings#planning");
    await page.getByRole("radiogroup", { name: "Default if missed" }).getByRole("radio", { name: was[0].toUpperCase() + was.slice(1) }).click();
    expect(await waitForRow(SETTING("default_miss_policy"), [DEV_USER.email, was])).not.toBeNull();
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

test("with reminders allowed, the icon badge shows Today's count; its switch clears it at once and brings it back", async ({ page }) => {
  // Reminders allowed, and a Badging API that records what it is asked: the browser's own answers vary by platform.
  await page.addInitScript(() => {
    const calls: number[] = [];
    Object.assign(window, { __badge: calls });
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
    Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: (n?: number) => (calls.push(n ?? 0), Promise.resolve()) });
    Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: () => (calls.push(0), Promise.resolve()) });
  });
  // Something on Today, so the count is not zero.
  await withDb((c) =>
    c.query("insert into public.tasks (id, space_id, title, state, priority, do_date, estimate_min, sort_key) values (gen_random_uuid(), $1, $2, 'active', 0, $3::date, 15, 'y0000000000000000000000051')", [
      me.sid,
      uniqueTitle("badge count"),
      me.today,
    ]),
  );
  const lastBadge = () => page.evaluate(() => (window as unknown as { __badge: number[] }).__badge.at(-1) ?? null);
  await openApp(page, "/today");
  // The sidebar's Today count is the badge's number.
  const todayCount = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Today/ }).getByLabel(/remaining$/);
  await expect(todayCount).toHaveText(/^\d+$/);
  const count = async () => Number(await todayCount.textContent());
  await expect.poll(async () => (await lastBadge()) === (await count()), { timeout: 15_000 }).toBe(true);
  expect(await lastBadge()).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Settings" }).click();
  await section(page, "Notifications");
  const badge = page.getByRole("switch", { name: "Badge on the app icon" });
  await expect(badge).toHaveAttribute("aria-checked", "true");
  await badge.click();
  await expect.poll(lastBadge).toBe(0);
  expect(await waitForRow(SETTING("badge_enabled"), [DEV_USER.email, false])).not.toBeNull();
  await badge.click();
  await expect.poll(async () => (await lastBadge()) === (await count()), { timeout: 15_000 }).toBe(true);
  expect(await lastBadge()).toBeGreaterThan(0);
  expect(await waitForRow(SETTING("badge_enabled"), [DEV_USER.email, true])).not.toBeNull();
});

test.describe("reduce motion", () => {
  // The app's scripts are held back below to show the head script alone stamps the page; a service worker would serve them past the route.
  test.use({ serviceWorkers: "block" });

  test("Reduce motion stamps the page before paint and survives a reload; System gives it back to the OS", async ({ page }) => {
    await openApp(page, "/settings#appearance");
    await page.getByRole("radiogroup", { name: "Motion" }).getByRole("radio", { name: "Reduce" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");

    // With none of the app's own scripts loaded (no React, no hydration), the inline head script has already
    // stamped <html>, and the reduced rules are in force: nothing waits for the app to start.
    await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.abort());
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    expect(await page.evaluate(() => getComputedStyle(document.body).animationDuration)).toBe("1e-05s");
    await page.unroute(/\/_next\/static\/.*\.js(\?.*)?$/);

    await openApp(page, "/settings#appearance");
    await page.getByRole("radiogroup", { name: "Motion" }).getByRole("radio", { name: "System" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-motion", "reduce");
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-motion", "reduce");
  });
});
