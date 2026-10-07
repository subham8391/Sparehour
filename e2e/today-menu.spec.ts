// Today's ⋯ (SCREENS.md §2.1, §2.4, §2.7; PRODUCT_SPEC.md §9.4): Sort is a
// view preference that persists and never rewrites the hand order; Show
// completed adds a Done divider whose rows Reopen; Copy today as text and
// Print; a day over its time names one move in the ribbon, whose sentence
// opens Trim today, which closes itself once the day fits; and finishing
// everything planned says "That's everything you planned." with Pull
// something in and Shutdown. (Clear the slate, the menu's other entry, has
// its own spec: archive.spec.ts.)
//
// Today's lists hold this spec's rows and nothing else: every other open task
// due today or before is stood aside (started tomorrow) for the length of the
// spec, since CI seeds two thousand of them. Trim today needs time left in a
// working day, so the account gets working hours over every hour of every day
// (extra rows beside its own). afterAll restores the stood-aside tasks, the
// two view settings and the hours exactly, and removes this spec's own rows,
// so a later spec never meets a 24-hour task on today.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, isoPlus, putBack, removeOwn, seedKey, standAside, waitForRow, withDb, type DevAccount, type StoodAside } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

test.describe.configure({ mode: "serial" });

// Hand order alpha, bravo, charlie; by estimate bravo, charlie, alpha.
const alpha = uniqueTitle("menu alpha");
const bravo = uniqueTitle("menu bravo");
const charlie = uniqueTitle("menu charlie");
const carriedOne = uniqueTitle("menu carried");
const big = uniqueTitle("trim whole day");
const small = uniqueTitle("trim small");
const own = [alpha, bravo, charlie, carriedOne, big, small];

let me: DevAccount;
let stood: StoodAside[] = [];
let addedHours: string[] = [];
let prefs: { today_sort: string; show_completed: boolean } | null = null;
let trimSkip: string | null = null;

const section = (page: Page, name: RegExp) => page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name }) });
const todayList = (page: Page) => section(page, /^Today/);
const row = (list: Locator, title: string) => list.getByRole("row").filter({ hasText: title });
async function order(list: Locator): Promise<string[]> {
  const texts = await list.getByRole("row").allTextContents();
  return texts.map((t) => own.find((title) => t.includes(title))).filter((t): t is string => Boolean(t));
}
async function openMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Today options" }).click();
  const menu = page.getByRole("menu", { name: "Today options" });
  await expect(menu).toBeVisible();
  return menu;
}
async function sortBy(page: Page, label: string): Promise<void> {
  const menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: /^Sort/ }).click();
  await menu.getByRole("menuitemradio", { name: new RegExp(`^${label}`) }).click();
  await expect(menu).toHaveCount(0);
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    if (me.minute < me.rollover * 60) trimSkip = "before the day rollover: the app's today has already ended";
    else if (me.minute > 22 * 60) trimSkip = "too late in the day for a trim to make the day fit";
    addedHours = await addAllDayHours(c, me);
    stood = await standAside(c, me);
    prefs = (await c.query<{ today_sort: string; show_completed: boolean }>("select today_sort, show_completed from public.user_settings where user_id = $1", [me.uid])).rows[0];
    await c.query("update public.user_settings set today_sort = 'manual', show_completed = false where user_id = $1", [me.uid]);
    for (const [title, estimate, priority, key] of [
      [alpha, 20, 0, "a1"],
      [bravo, 90, 1, "a2"],
      [charlie, 45, 3, "a3"],
    ] as const) {
      await c.query(
        `insert into public.tasks (id, space_id, title, state, priority, do_date, estimate_min, sort_key, day_sort_key)
         values (gen_random_uuid(), $1, $2, 'active', $3, $4::date, $5, $6, $6)`,
        [me.sid, title, priority, me.today, estimate, seedKey(key)],
      );
    }
    await c.query(
      `insert into public.tasks (id, space_id, title, state, do_date, estimate_min, sort_key, carry_count, last_carried_at)
       values (gen_random_uuid(), $1, $2, 'active', $3::date, 15, $5, 1, $4::date)`,
      [me.sid, carriedOne, isoPlus(me.today, -1), me.today, seedKey("c1")],
    );
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await removeOwn(c, own);
    if (prefs) await c.query("update public.user_settings set today_sort = $2, show_completed = $3 where user_id = $1", [me.uid, prefs.today_sort, prefs.show_completed]);
    if (addedHours.length > 0) await c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]);
    await putBack(c, stood);
  });
});

const HAND_ORDER = "select 1 from public.tasks where title = any($1) having string_agg(title, '|' order by day_sort_key) = $2";

test("Sort orders Today by estimate as a view, saved on the account; the hand order is never rewritten", async ({ page }) => {
  await openApp(page, "/today");
  const list = todayList(page);
  await expect.poll(() => order(list)).toEqual([alpha, bravo, charlie]);

  await sortBy(page, "Estimate");
  await expect.poll(() => order(list)).toEqual([bravo, charlie, alpha]);
  // A sorted list is not the hand order: Move up / Move down wait for Manual.
  await expect(row(list, alpha).getByRole("button", { name: "Move up" })).toHaveCount(0);
  expect(await waitForRow("select 1 from public.user_settings where user_id = $1 and today_sort = 'estimate'", [me.uid])).not.toBeNull();
  expect(await waitForRow(HAND_ORDER, [[alpha, bravo, charlie], [alpha, bravo, charlie].join("|")])).not.toBeNull();
});

test("the sort holds on another device, and Manual brings the hand order straight back", async ({ page }) => {
  await openApp(page, "/today");
  const list = todayList(page);
  await expect.poll(() => order(list)).toEqual([bravo, charlie, alpha]);
  const menu = await openMenu(page);
  await expect(menu.getByRole("menuitem", { name: /^Sort/ })).toContainText("Estimate");
  await page.keyboard.press("Escape");

  await sortBy(page, "Priority");
  await expect.poll(() => order(list)).toEqual([charlie, bravo, alpha]);
  await sortBy(page, "Manual");
  await expect.poll(() => order(list)).toEqual([alpha, bravo, charlie]);
  await expect(row(list, alpha).getByRole("button", { name: "Move up" })).toHaveCount(1);
  expect(await waitForRow("select 1 from public.user_settings where user_id = $1 and today_sort = 'manual'", [me.uid])).not.toBeNull();
  expect(await waitForRow(HAND_ORDER, [[alpha, bravo, charlie], [alpha, bravo, charlie].join("|")])).not.toBeNull();
});

test("Show completed lists today's finished tasks under a Done divider, and Reopen brings one back", async ({ page }) => {
  await openApp(page, "/today");
  const list = todayList(page);
  await row(list, alpha).getByRole("button", { name: `Complete ${alpha}` }).click();
  await expect(row(list, alpha)).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'done'", [alpha])).not.toBeNull();
  const done = page.getByRole("region", { name: "Done today" });
  await expect(done).toHaveCount(0);

  const menu = await openMenu(page);
  await menu.getByRole("menuitemcheckbox", { name: /^Show completed/ }).click();
  const finished = row(done, alpha);
  await expect(finished).toBeVisible();
  expect(await waitForRow("select 1 from public.user_settings where user_id = $1 and show_completed", [me.uid])).not.toBeNull();

  await finished.hover();
  await finished.getByRole("button", { name: "Reopen" }).click();
  await expect(row(list, alpha)).toBeVisible();
  await expect(finished).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'active' and completed_at is null", [alpha])).not.toBeNull();

  const again = await openMenu(page);
  await expect(again.getByRole("menuitemcheckbox", { name: /^Show completed/ })).toHaveAttribute("aria-checked", "true");
  await again.getByRole("menuitemcheckbox", { name: /^Show completed/ }).click();
  expect(await waitForRow("select 1 from public.user_settings where user_id = $1 and not show_completed", [me.uid])).not.toBeNull();
});

test("Copy today as text puts the day on the clipboard; Print prints the day list without the app around it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await openApp(page, "/today");
  await expect(row(todayList(page), charlie)).toBeVisible();

  const menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: "Copy today as text" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied today as text" })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(`Carried over\n- ${carriedOne} · 15m`);
  expect(text).toContain(`Today\n- ${alpha} · 20m\n- ${bravo} · 1h 30m\n- ${charlie} · 45m`);

  const again = await openMenu(page);
  await again.getByRole("menuitem", { name: "Print" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  // On paper: the day list, and nothing of the app's chrome.
  await page.emulateMedia({ media: "print" });
  await expect(row(todayList(page), charlie)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Today options" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});

test("finishing everything planned says so, with Pull something in and Shutdown", async ({ page }) => {
  await openApp(page, "/today");
  const list = todayList(page);
  for (const title of [alpha, bravo, charlie]) {
    await row(list, title).getByRole("button", { name: `Complete ${title}` }).click();
    await expect(row(list, title)).toHaveCount(0);
  }
  await expect(list.getByText(/^That.s everything you planned\./)).toBeVisible();
  await expect(list.getByRole("link", { name: "Shutdown ›" })).toHaveAttribute("href", "/shutdown");
  const pull = list.getByRole("button", { name: "Pull something in" });
  await pull.click();
  await expect(pull).toHaveAttribute("aria-expanded", "true");
  expect(await waitForRow("select 1 from public.tasks where title = any($1) and state = 'done' having count(*) = 3", [[alpha, bravo, charlie]])).not.toBeNull();
});

test("over the day, the ribbon names a move and opens Trim today, which lists by estimate and closes itself once the day fits", async ({ page }) => {
  test.skip(trimSkip !== null, trimSkip ?? "");
  // A whole day's task (24h: more than any day has left) and a small one, on a day with nothing else planned.
  await withDb(async (c) => {
    for (const [title, estimate] of [
      [big, 1440],
      [small, 5],
    ] as const) {
      await c.query(
        `insert into public.tasks (id, space_id, title, state, do_date, estimate_min, sort_key, day_sort_key) values (gen_random_uuid(), $1, $2, 'active', $3::date, $4, $5, $5)`,
        [me.sid, title, me.today, estimate, seedKey(`t${estimate}`)],
      );
    }
  });
  await openApp(page, "/today");
  await expect(row(todayList(page), big)).toBeVisible();
  const trim = page.getByRole("dialog", { name: "Trim today" });

  // From the ⋯, and from the well-over line under the ribbon.
  await (await openMenu(page)).getByRole("menuitem", { name: "Trim today" }).click();
  await expect(trim).toBeVisible();
  await trim.getByRole("button", { name: "Done", exact: true }).click();
  await expect(trim).toHaveCount(0);
  await expect(page.getByText(/more than fits — want help trimming\?/)).toBeVisible();
  await page.getByRole("button", { name: "Trim today", exact: true }).click();
  await expect(trim).toBeVisible();
  await trim.getByRole("button", { name: "Done", exact: true }).click();

  // The ribbon's over sentence is the way in that names one move.
  await page.getByRole("button", { name: /(spills past \d\d:\d\d|more than fits)/ }).click();
  await expect(trim).toBeVisible();
  await expect(trim.getByRole("status")).toHaveText(/more than fits$/);
  const items = await trim.getByRole("listitem").allTextContents();
  expect(items.map((t) => own.find((title) => t.includes(title))).filter(Boolean)).toEqual([big, small]);
  await trim.getByRole("button", { name: `Move ${big} to tomorrow` }).click();
  await expect(trim.getByRole("status")).toHaveText("Now fits");
  await expect(trim).toHaveCount(0);
  await expect(row(todayList(page), big)).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date = $2::date", [big, isoPlus(me.today, 1)])).not.toBeNull();
});
