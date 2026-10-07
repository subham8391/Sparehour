// The timeline and the morning plan on a phone at 360 px (SCREENS.md §2.6, §2.8 and §14 "Responsive", the
// "As built 2026-10-07" notes; CLAUDE.md "a tap path for every drag", 44 px targets): on Today's Day view a
// selected block's Move… waits for a tap, a tap on an empty time offers "New block here", and the − / + control
// zooms; in the morning plan the summary is pinned at the top of step 2 in the over colour with the Easiest move
// under it, each group folds under a 44 px header with its count, and step 3 places a task with its Block and
// then a tap on the timeline. Every write is read back from Postgres.
//
// Today may be a weekend or a day off, so the dev account gets working hours over every hour of every day for the
// length of the spec (extra rows beside its own, deleted in afterAll). Its open tasks through tomorrow are stood
// aside (they start the day after tomorrow; afterAll puts them back exactly): what is picked is this spec's own,
// and tomorrow keeps room for the Easiest move, however crowded the account is. The blocks go in a stretch of the
// evening clear of the account's own blocks and meetings. Each test's rows are removed as it ends.
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, isoPlus, putBack, removeOwn, standAside, withDb, type DevAccount, type StoodAside } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";
import { blockOn, expectBlockAt, expectOwnBlocks, expectTaskBlocks, hhmm, pointAt, quietStretch, seedBlock, seedTask, showMinute } from "./timeline-helpers";

test.use({ viewport: { width: 360, height: 780 } });

let me: DevAccount;
let S = 19 * 60;
let since = "";
let addedHours: string[] = [];
let stood: StoodAside[] = [];
let mine: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    since = (await c.query<{ t: string }>("select now()::text as t")).rows[0].t;
    addedHours = await addAllDayHours(c, me);
    stood = await standAside(c, me, isoPlus(me.today, 1), 2);
    S = await quietStretch(c, me);
  });
});

test.afterEach(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.time_blocks where user_id = $1 and task_id is null and (title = any($2) or (title = 'Block' and created_at >= $3::timestamptz))", [me.uid, mine, since]);
    await removeOwn(c, mine);
  });
  mine = [];
});

test.afterAll(async () => {
  await withDb(async (c) => {
    if (addedHours.length > 0) await c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]);
    await putBack(c, stood);
  });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sparehour.blockNudge", "dismissed"));
});

const span = (start: number, end: number) => `${hhmm(start)}–${hhmm(end)}`;

/** At least a 44 px target (DESIGN_SYSTEM.md §4a). */
async function expectTouchTarget(target: import("@playwright/test").Locator) {
  const box = (await target.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
}

test("Today's Day view: Move… then a tap moves a block, a tap on an empty time offers New block here, and − / + zoom", async ({ page }) => {
  const title = uniqueTitle("phone move");
  const named = uniqueTitle("phone own");
  mine.push(title, named);
  await withDb(async (c) => {
    const id = await seedTask(c, me, title, { estimate: 30 });
    await seedBlock(c, me, { taskId: id, title, start: S, end: S + 30 });
  });
  await openApp(page, "/today");
  await page.getByRole("button", { name: "Day", exact: true }).tap();
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toBeVisible();
  const block = blockOn(timeline, title);
  await showMinute(timeline, S + 60);
  await block.tap();
  await expect(block).toHaveAttribute("aria-pressed", "true");

  // Move… on the toolbar, 44 px to the finger; the next tap on the timeline moves the block, keeping its length.
  const moveAction = timeline.getByTestId("block-toolbar").getByRole("button", { name: `Move ${title} to another time` });
  await expectTouchTarget(moveAction);
  await moveAction.tap();
  await expect(page.getByRole("status").filter({ hasText: `Tap a new time for “${title}”` })).toBeVisible();
  let p = await pointAt(timeline, S + 121);
  await page.touchscreen.tap(p.x, p.y);
  await expectBlockAt(block, S + 120, S + 150);
  await expectTaskBlocks(title, [span(S + 120, S + 150)]);

  // A tap on an empty time lets go of the block; the next one offers a block of your own there, half an hour.
  p = await pointAt(timeline, S + 247);
  await page.touchscreen.tap(p.x, p.y);
  await expect(block).toHaveAttribute("aria-pressed", "false");
  p = await pointAt(timeline, S + 247);
  await page.touchscreen.tap(p.x, p.y);
  const offer = timeline.getByRole("button", { name: `New block here ${hhmm(S + 240)}` });
  await expect(offer).toBeVisible();
  await expectTouchTarget(offer);
  await offer.tap();
  const name = timeline.getByRole("textbox", { name: "Block name" });
  await expect(name).toBeFocused();
  await name.fill(named);
  await name.press("Enter");
  await expectBlockAt(blockOn(timeline, named), S + 240, S + 270);
  await expectOwnBlocks(named, [span(S + 240, S + 270)]);

  // The zoom's tap path: − / + over the timeline, 44 px each.
  const zoom = page.getByRole("group", { name: "Timeline zoom" });
  const zoomIn = zoom.getByRole("button", { name: "Zoom in" });
  const zoomOut = zoom.getByRole("button", { name: "Zoom out" });
  for (const b of [zoomIn, zoomOut]) {
    const box = (await b.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
  await expect(timeline).toHaveAttribute("data-zoom", "30");
  await zoomIn.tap();
  await expect(timeline).toHaveAttribute("data-zoom", "15");
  await expect(zoom).toContainText("15m rows");
  await zoomIn.tap();
  await expect(timeline).toHaveAttribute("data-zoom", "5");
  await zoomOut.tap();
  await expect(timeline).toHaveAttribute("data-zoom", "15");
  // The block is drawn at the new scale, on the same minutes.
  await showMinute(timeline, S + 120);
  const box = (await block.boundingBox())!;
  const top = (await timeline.boundingBox())!.y;
  expect(Math.abs(box.y - (top + (S + 120) * 2.2 + 1))).toBeLessThan(3);
});

test("the morning plan: the summary pinned over, the Easiest move under it, groups folding under 44 px headers, and step 3's Block then a tap", async ({ page }) => {
  const huge = uniqueTitle("phone plan huge");
  const small = uniqueTitle("phone plan small");
  const due = uniqueTitle("phone plan due");
  mine.push(huge, small, due);
  await withDb(async (c) => {
    // A whole day's work and half an hour: over, whatever fits, and only the half hour fits tomorrow.
    await seedTask(c, me, huge, { estimate: 24 * 60 });
    await seedTask(c, me, small, { estimate: 30 });
    await seedTask(c, me, due, { doDate: null, deadline: isoPlus(me.today, 2), estimate: 15 });
  });
  await openApp(page, "/plan");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "Pick today’s tasks" })).toBeVisible();

  // Pinned at the top of the step, in the over colour, with the Easiest move directly under it.
  const summary = page.getByTestId("plan-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText(/^(\d+h)?\s?(\d+m)? over · .+ fits today · 24h 30m picked · 2 tasks$/);
  await expect(summary).toHaveClass(/text-over/);
  const easiest = page.locator("p").filter({ hasText: /^Easiest move · / });
  await expect(easiest).toHaveText(`Easiest move · ${small} · 30m`);
  const intro = page.getByText("Tick what you’ll work on.");
  const y = async (l: import("@playwright/test").Locator) => (await l.boundingBox())!.y;
  expect(await y(summary)).toBeLessThan(await y(easiest));
  expect(await y(easiest)).toBeLessThan(await y(intro));

  // Each group folds under its own 44 px header, which carries the count.
  const header = page.getByRole("button", { name: /^Due this week\s*\d+$/ });
  await expectTouchTarget(header);
  await expect(header).toHaveAttribute("aria-expanded", "true");
  const dueRow = page.getByRole("listitem").filter({ hasText: due });
  await expect(dueRow).toBeVisible();
  await header.tap();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(dueRow).toBeHidden();
  await header.tap();
  await expect(dueRow).toBeVisible();
  for (const name of [/^Carried over\s*\d+$/, /^From your projects\s*\d+$/]) await expectTouchTarget(page.getByRole("button", { name }));

  // Still pinned once the step has scrolled.
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(summary).toBeInViewport();

  // Step 3: the task's Block, then a tap on the timeline under it.
  await page.getByRole("button", { name: "Next · Block time" }).tap();
  await expect(page.getByRole("heading", { name: "Block time" })).toBeVisible();
  const toBlock = page.getByRole("region", { name: "To block" });
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toBeVisible();
  // Above the timeline (the box it scrolls in) on a phone.
  const list = (await toBlock.boundingBox())!;
  expect(list.y + list.height).toBeLessThanOrEqual(await y(timeline.locator("xpath=..")));
  const place = toBlock.getByRole("button", { name: `Block ${small}` });
  await expectTouchTarget(place);
  await place.tap();
  await expect(page.getByRole("status").filter({ hasText: `Tap a time for “${small}”` })).toBeVisible();
  const p = await pointAt(timeline, S + 1);
  await page.touchscreen.tap(p.x, p.y);
  await expectTaskBlocks(small, [span(S, S + 30)]);
  await expect(toBlock.getByRole("listitem").filter({ hasText: small })).toHaveCount(0);
});
