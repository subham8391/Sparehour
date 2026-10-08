// The Calendar on a phone at 360 px (SCREENS.md §4 "Responsive"; CLAUDE.md "a tap path for every drag", 44 px
// targets): the Day mode only, whatever the device remembers, with day stepping; today's tasks behind a `Tasks`
// button whose sheet arms tap-to-schedule — tap a task, then a time — and a block's toolbar Move… then a tap moves
// it. Every write is read back from Postgres.
//
// Today may be a day off, so the dev account gets working hours over every hour of every day for the length of the
// spec (extra rows beside its own, deleted in afterAll). Its open tasks through today are stood aside (they start
// tomorrow; afterAll puts them back exactly), so the sheet is this spec's own. The blocks go in a stretch of the
// evening clear of the account's own blocks and meetings. Each test's rows are removed as it ends.
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, isoPlus, putBack, removeOwn, standAside, withDb, type DevAccount, type StoodAside } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";
import { blockOn, expectBlockAt, expectTaskBlocks, hhmm, pointAt, quietStretch, seedBlock, seedTask } from "./timeline-helpers";

test.use({ viewport: { width: 360, height: 780 } });

let me: DevAccount;
let S = 19 * 60;
let addedHours: string[] = [];
let stood: StoodAside[] = [];
let mine: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    addedHours = await addAllDayHours(c, me);
    stood = await standAside(c, me);
    S = await quietStretch(c, me);
  });
});

test.afterEach(async () => {
  await withDb((c) => removeOwn(c, mine));
  mine = [];
});

test.afterAll(async () => {
  await withDb(async (c) => {
    if (addedHours.length > 0) await c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]);
    await putBack(c, stood);
  });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sparehour.blockNudge", "dismissed");
    // Remembered from a wider screen: the phone still shows one day.
    localStorage.setItem("sparehour.calendar.mode", "week");
  });
});

/** At least a 44 px target (DESIGN_SYSTEM.md §4a). */
async function expectTouchTarget(target: Locator) {
  const box = (await target.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
}

test("the Day mode only, stepped a day at a time with 44 px controls, and back to today", async ({ page }) => {
  await openApp(page, "/calendar");
  const columns = page.locator("[data-calendar-grid] [data-day]");
  await expect(columns).toHaveCount(1);
  await expect(columns.first()).toHaveAttribute("data-day", me.today);
  await expect(page.getByRole("radiogroup", { name: "Calendar mode" })).toHaveCount(0);
  await expect(page.getByText(/^Calendar · Today$/)).toBeVisible();
  const next = page.getByRole("button", { name: "Next day" });
  await expectTouchTarget(next);
  await expectTouchTarget(page.getByRole("button", { name: /^Tasks/ }));
  await next.click();
  await expect(columns.first()).toHaveAttribute("data-day", isoPlus(me.today, 1));
  await expect(page.getByText(/^Calendar · Tomorrow$/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?day=${isoPlus(me.today, 1)}$`));
  const back = page.getByRole("button", { name: "Today", exact: true });
  await expectTouchTarget(back);
  await back.click();
  await expect(columns.first()).toHaveAttribute("data-day", me.today);
});

test("Tasks opens today's tasks as a sheet; a tap on one, then on a time, blocks it there", async ({ page }) => {
  const title = uniqueTitle("Cal phone");
  mine.push(title);
  await withDb((c) => seedTask(c, me, title, { estimate: 30 }));
  await openApp(page, "/calendar");
  await page.getByRole("button", { name: /^Tasks/ }).click();
  const sheet = page.getByRole("dialog", { name: "Today's tasks" });
  const pick = sheet.getByRole("button", { name: `Block ${title}` });
  await expectTouchTarget(pick);
  await pick.click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: `Tap a time for “${title}”` })).toBeVisible();
  const timeline = page.locator(`[data-calendar-grid] [data-day="${me.today}"]`).getByTestId("timeline");
  const at = await pointAt(timeline, S + 2);
  await page.mouse.click(at.x, at.y);
  await expectTaskBlocks(title, [`${hhmm(S)}–${hhmm(S + 30)}`]);
});

test("a block's toolbar Move… waits for a tap on its new time", async ({ page }) => {
  const title = uniqueTitle("Cal phone move");
  mine.push(title);
  await withDb(async (c) => {
    const id = await seedTask(c, me, title, { estimate: 30 });
    await seedBlock(c, me, { taskId: id, title, start: S, end: S + 30 });
  });
  await openApp(page, "/calendar");
  const timeline = page.locator(`[data-calendar-grid] [data-day="${me.today}"]`).getByTestId("timeline");
  const block = blockOn(timeline, title);
  await block.scrollIntoViewIfNeeded();
  await block.click();
  await timeline.getByTestId("block-toolbar").getByRole("button", { name: `Move ${title} to another time` }).click();
  const at = await pointAt(timeline, S + 92);
  await page.mouse.click(at.x, at.y);
  await expectBlockAt(blockOn(timeline, title), S + 90, S + 120);
  await expectTaskBlocks(title, [`${hhmm(S + 90)}–${hhmm(S + 120)}`]);
});
