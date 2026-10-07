// Swipe actions on a phone (SCREENS.md §2.8, §5, §7, §8, §13, §22; DESIGN_SYSTEM.md §5 "right = advance, left = push
// away; Drop never on a full swipe"; DECISIONS.md, M1 gap rulings "Long-press", "Swipes on Someday and the
// Logbook"): one swipe per list with real touches (Chromium's touch input, so `touch-action` and the browser's own
// scrolling take part), Drop only from a tap, the long-press still ticking a row, a vertical drag left to the page,
// and quick-add's suggestion chips in one sideways-scrolling row at 360 px.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, putBack, removeOwn, seedKey, standAside, waitForRow, withDb, type DevAccount, type StoodAside } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `s${Date.now().toString(36)}`;
const T = {
  today: `${E2E_PREFIX}swipe today ${n}`,
  done: `${E2E_PREFIX}swipe done ${n}`,
  carried: `${E2E_PREFIX}swipe carried ${n}`,
  inbox: `${E2E_PREFIX}swipe inbox ${n}`,
  someday: `${E2E_PREFIX}swipe someday ${n}`,
  logbook: `${E2E_PREFIX}swipe logbook ${n}`,
  found: `${E2E_PREFIX}swipe found ${n}`,
  held: `${E2E_PREFIX}swipe held ${n}`,
};
let me: DevAccount;
let stood: StoodAside[] = [];
const TASK = "select id from public.tasks where title = $1";

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    // The account's own open tasks through today stand aside (they start tomorrow; afterAll puts them back exactly):
    // above eight rows Carried over starts folded, and this spec's own carried row would be out of sight.
    stood = await standAside(c, me);
    const add = (title: string, state: string, doDate: string | null, completed = false) =>
      c.query(
        `insert into public.tasks (id, space_id, title, state, priority, do_date, estimate_min, sort_key, day_sort_key, completed_at)
         values (gen_random_uuid(), $1, $2, $3, 0, $4, 20, $5, $5, case when $6 then now() else null end)`,
        [me.sid, title, state, doDate, seedKey("0"), completed],
      );
    await add(T.today, "active", me.today);
    await add(T.done, "active", me.today);
    await add(T.held, "active", me.today);
    await add(T.carried, "active", isoPlus(me.today, -2));
    await add(T.inbox, "inbox", null);
    await add(T.someday, "someday", null);
    await add(T.logbook, "done", isoPlus(me.today, -1), true);
    await add(T.found, "active", isoPlus(me.today, 3));
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await removeOwn(c, Object.values(T));
    await putBack(c, stood);
  });
});

/**
 * A real one-finger drag across a row, `dx` sideways and `dy` down: from near the edge it moves away from (so a full
 * swipe fits on the screen), a first small move, a pause in which the row's swipe (lazy, brought in by the touch)
 * mounts, then the rest in small steps.
 */
async function drag(page: Page, target: Locator, dx: number, dy = 0): Promise<void> {
  await toMiddle(target);
  const box = (await target.boundingBox())!;
  const x = dx < 0 ? box.x + box.width - 12 : dx > 0 ? box.x + 12 : box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 28);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + Math.sign(dx), y: y + Math.sign(dy) }] });
  await page.waitForTimeout(300);
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/**
 * Touches land where the row is on screen, so it is brought to the middle of it first: a row merely "in view" can sit
 * under the tab bar or the + button, which then take the touch (a long-press on the Week tab opens Upcoming).
 */
async function toMiddle(target: Locator): Promise<void> {
  await target.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
}

const row = (page: Page, title: string) => page.getByRole("row").filter({ hasText: title });
async function swipe(page: Page, title: string, dx: number): Promise<void> {
  const r = row(page, title);
  await expect(r).toBeVisible();
  await drag(page, r, dx);
}
const strip = (page: Page, title: string) => row(page, title).locator("[data-swipe-actions]");

test("Today: a full swipe left moves a row to tomorrow, a full swipe right completes one, a carried row goes to Today", async ({ page }) => {
  await openApp(page, "/today");
  await swipe(page, T.today, -340);
  expect(await waitForRow(`${TASK} and do_date = $2`, [T.today, isoPlus(me.today, 1)])).not.toBeNull();
  await swipe(page, T.done, 340);
  expect(await waitForRow(`${TASK} and state = 'done'`, [T.done])).not.toBeNull();
  // Carried over: right is Today · Tomorrow; a partial swipe leaves both open as named buttons.
  await swipe(page, T.carried, 90);
  await expect(strip(page, T.carried).getByRole("button")).toHaveText(["Today", "Tomorrow"]);
  await strip(page, T.carried).getByRole("button", { name: "Today" }).click();
  expect(await waitForRow(`${TASK} and do_date = $2`, [T.carried, me.today])).not.toBeNull();
});

test("Inbox: swipe right is Today; Someday: a full swipe left never drops, the revealed Drop does", async ({ page }) => {
  await openApp(page, "/inbox");
  await swipe(page, T.inbox, 340);
  expect(await waitForRow(`${TASK} and state = 'active' and do_date = $2`, [T.inbox, me.today])).not.toBeNull();

  await openApp(page, "/someday");
  await swipe(page, T.someday, -350);
  await expect(strip(page, T.someday).getByRole("button", { name: "Drop" })).toBeVisible();
  expect(await waitForRow(`${TASK} and state = 'dropped'`, [T.someday], 1_000)).toBeNull();
  await strip(page, T.someday).getByRole("button", { name: "Drop" }).click();
  expect(await waitForRow(`${TASK} and state = 'dropped'`, [T.someday])).not.toBeNull();
});

test("Logbook: swipe right reopens; Search: a result swipes as its state's list does", async ({ page }) => {
  await openApp(page, "/logbook");
  await swipe(page, T.logbook, 340);
  expect(await waitForRow(`${TASK} and state <> 'done'`, [T.logbook])).not.toBeNull();

  await openApp(page, `/search?q=${encodeURIComponent(T.found)}`);
  await swipe(page, T.found, -110);
  await expect(strip(page, T.found).getByRole("button")).toHaveText(["Tomorrow", "Someday"]);
  await strip(page, T.found).getByRole("button", { name: "Someday" }).click();
  expect(await waitForRow(`${TASK} and state = 'someday'`, [T.found])).not.toBeNull();
});

test("a vertical drag scrolls and swipes nothing; a long-press still ticks the row", async ({ page }) => {
  await openApp(page, "/today");
  const r = row(page, T.held);
  await expect(r).toBeVisible();
  await drag(page, r, 8, 120);
  await expect(page.locator("[data-swipe-actions]")).toHaveCount(0);
  expect(await waitForRow(`${TASK} and (state <> 'active' or do_date <> $2)`, [T.held, me.today], 1_000)).toBeNull();

  await toMiddle(r);
  const box = (await r.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 28) }] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await expect(r.getByRole("checkbox", { name: `Select ${T.held}` })).toBeChecked();
});

test("quick-add's suggestion chips sit in one sideways-scrolling row at 360 px, with no page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await openApp(page, "/today");
  await page.getByRole("button", { name: "Add a task" }).click();
  const chips = page.getByRole("group", { name: "Suggestions" });
  await expect(chips).toBeVisible();
  const tops = await chips.getByRole("button").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
  expect(tops).toHaveLength(1);
  expect(await chips.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
  for (const b of await chips.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
