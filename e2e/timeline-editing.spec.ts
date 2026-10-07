// Editing the timeline on Today, on a desktop (SCREENS.md §2.6 "As built 2026-10-07", SYSTEM_DESIGN.md §11.5):
// a drag on empty space draws a block of your own, renamed in place (a double-click, ⋯ Rename); the selected
// block's toolbar Move… then a tap, and its From / To fields (a new start moves, a new end resizes); the top edge
// resizes; Alt+drag and toolbar Duplicate copy; a block dragged onto the list is unblocked with an undo; a task
// takes a second block from its row's Block and from B, and the row chip says "+1"; the task detail's block rows
// move, lock and remove; the selected block's keys; + / - and the − / + control zoom, and a row dropped at
// every zoom lands on the minute under the pointer; the overrun marker under the day's end. Every write is read
// back from Postgres on the account's clock.
//
// Today may be a weekend or a day off, so the dev account gets working hours over every hour of every day for the
// length of the spec (extra rows beside its own, which are never touched, deleted in afterAll). Its other open
// tasks through today are stood aside (they start tomorrow) and put back exactly in afterAll: CI's crowded seed
// would otherwise fill the day, and the overrun marker would never leave. The spec works in a stretch of the
// evening clear of the account's own blocks and meetings (CI's sit inside the working day). Each test's rows are
// removed as it ends.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, putBack, removeOwn, standAside, withDb, type DevAccount, type StoodAside } from "./db";
import { DEV_USER, openApp, uniqueTitle, waitForSync } from "./helpers";
import { blockOn, drag, expectBlockAt, expectOwnBlocks, expectTaskBlocks, hhmm, pointAt, quietStretch, scaleOf, seedBlock, seedTask, showMinute } from "./timeline-helpers";

let me: DevAccount;
/** The start of the stretch the spec works in, in minutes of the day. */
let S = 19 * 60;
let since = "";
let addedHours: string[] = [];
let stood: StoodAside[] = [];
/** The titles the running test made: its tasks and its blocks of your own. */
let mine: string[] = [];

async function removeMine(): Promise<void> {
  if (mine.length === 0 && !since) return;
  await withDb(async (c) => {
    // Blocks of your own: the named ones, and any still called "Block" that this spec drew.
    await c.query("delete from public.time_blocks where user_id = $1 and task_id is null and (title = any($2) or (title = 'Block' and created_at >= $3::timestamptz))", [me.uid, mine, since]);
    await removeOwn(c, mine);
  });
  mine = [];
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    since = (await c.query<{ t: string }>("select now()::text as t")).rows[0].t;
    addedHours = await addAllDayHours(c, me);
    stood = await standAside(c, me);
    S = await quietStretch(c, me);
  });
});

test.afterAll(async () => {
  await removeMine();
  await withDb(async (c) => {
    if (addedHours.length > 0) await c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]);
    await putBack(c, stood);
  });
});

test.beforeEach(async ({ page }) => {
  // This device has answered the first-block reminder ask: it stays out of the list column.
  await page.addInitScript(() => localStorage.setItem("sparehour.blockNudge", "dismissed"));
});

test.afterEach(removeMine);

/** Today with its timeline drawn. */
async function openDay(page: Page) {
  await openApp(page, "/today");
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toBeVisible();
  return timeline;
}

/** A task (and, with `block`, one block for it) made as postgres for the running test. */
async function seed(title: string, estimate: number, block?: [number, number]): Promise<string> {
  mine.push(title);
  return withDb(async (c) => {
    const id = await seedTask(c, me, title, { estimate });
    if (block) await seedBlock(c, me, { taskId: id, title, start: block[0], end: block[1] });
    return id;
  });
}

const span = (start: number, end: number) => `${hhmm(start)}–${hhmm(end)}`;

test("a drag on empty space draws a block of your own, named in place; a double-click and ⋯ Rename rename it", async ({ page }) => {
  const named = uniqueTitle("own block");
  const renamed = `${named} renamed`;
  const again = `${named} again`;
  mine.push(named, renamed, again);
  const timeline = await openDay(page);

  // Snapped to fifteen minutes: pressed five past, let go at ten to the hour, it is the whole hour.
  const from = await pointAt(timeline, S + 5);
  const to = await pointAt(timeline, S + 50, false);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(timeline.getByTestId("timeline-ghost")).toContainText(`${span(S, S + 60)}New block`);
  await page.mouse.up();
  const name = timeline.getByRole("textbox", { name: "Block name" });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Block");
  await expect(page.getByRole("status").filter({ hasText: "Added a block" })).toBeVisible();
  await name.fill(named);
  await name.press("Enter");
  await expectBlockAt(blockOn(timeline, named), S, S + 60);
  await expectOwnBlocks(named, [span(S, S + 60)]);

  // A double-click renames in place.
  await blockOn(timeline, named).dblclick();
  await expect(name).toBeFocused();
  await name.fill(renamed);
  await name.press("Enter");
  await expect(blockOn(timeline, renamed)).toBeVisible();
  await expectOwnBlocks(renamed, [span(S, S + 60)]);

  // So does the toolbar's ⋯ Rename, with an undo.
  await blockOn(timeline, renamed).click();
  await timeline.getByTestId("block-toolbar").getByRole("button", { name: "More block actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect(name).toBeFocused();
  await name.fill(again);
  await name.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: `Renamed the block to “${again}”` })).toBeVisible();
  await expectOwnBlocks(again, [span(S, S + 60)]);
});

test("Move… then a tap moves a block keeping its length; From moves it, To resizes it; the top edge resizes with a mouse", async ({ page }) => {
  const title = uniqueTitle("move block");
  await seed(title, 45, [S, S + 45]);
  const timeline = await openDay(page);
  const block = blockOn(timeline, title);
  await showMinute(timeline, S);
  await expectBlockAt(block, S, S + 45);
  const toolbar = timeline.getByTestId("block-toolbar");
  const moveAction = toolbar.getByRole("button", { name: `Move ${title} to another time` });

  // Move…: the timeline waits for a tap, and the block keeps its 45 minutes wherever it lands.
  await block.click();
  await moveAction.click();
  await expect(page.getByRole("status").filter({ hasText: `Tap a new time for “${title}”` })).toBeVisible();
  await expect(timeline).toHaveAttribute("data-placing", "true");
  const at = await pointAt(timeline, S + 121);
  await page.mouse.click(at.x, at.y);
  await expectBlockAt(block, S + 120, S + 165);
  await expectTaskBlocks(title, [span(S + 120, S + 165)]);

  // A new start alone moves it, still 45 minutes.
  await moveAction.click();
  await expect(toolbar.getByLabel("Start time")).toBeFocused();
  await toolbar.getByLabel("Start time").fill(hhmm(S + 30));
  await toolbar.getByRole("button", { name: "Move", exact: true }).click();
  await expectBlockAt(block, S + 30, S + 75);
  await expectTaskBlocks(title, [span(S + 30, S + 75)]);

  // A new end resizes it from the start shown.
  await moveAction.click();
  await toolbar.getByLabel("End time").fill(hhmm(S + 90));
  await toolbar.getByLabel("End time").press("Enter");
  await expectBlockAt(block, S + 30, S + 90);
  await expectTaskBlocks(title, [span(S + 30, S + 90)]);

  // The top edge, with a mouse: the start moves, the end stays.
  const id = (await block.locator("xpath=..").getAttribute("data-block"))!;
  await showMinute(timeline, S + 30);
  const edge = (await timeline.getByTestId(`resize-top-${id}`).boundingBox())!;
  const target = await pointAt(timeline, S + 16, false);
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2, target.y, { steps: 6 });
  await page.mouse.up();
  await expectBlockAt(block, S + 15, S + 90);
  await expectTaskBlocks(title, [span(S + 15, S + 90)]);
});

test("Alt+drag copies a block, toolbar Duplicate then a tap copies it again, and a block dragged onto the list is unblocked with an undo", async ({ page }) => {
  const title = uniqueTitle("copy block");
  await seed(title, 30, [S, S + 30]);
  const timeline = await openDay(page);
  const row = page.getByRole("row").filter({ hasText: title });
  const at = (start: number) => timeline.getByRole("button", { name: `Block: ${title}, ${hhmm(start)} to ${hhmm(start + 30)}` });
  await showMinute(timeline, S + 40);
  await expect(at(S)).toBeVisible();

  // Alt held through the drag: the original stays and a copy lands an hour later.
  const box = (await at(S).boundingBox())!;
  const grab = { x: box.x + box.width / 2, y: box.y + 10 };
  const scale = await scaleOf(timeline);
  await drag(page, grab, async () => ({ x: grab.x, y: grab.y + 60 * scale }), {
    alt: true,
    beforeDrop: () => expect(timeline.getByTestId("timeline-ghost")).toContainText(`${hhmm(S + 60)}Copy`),
  });
  await expect(page.getByRole("status").filter({ hasText: `Copied “${title}”` })).toBeVisible();
  await expect(at(S + 60)).toBeVisible();
  await expect(at(S)).toBeVisible();
  await expectTaskBlocks(title, [span(S, S + 30), span(S + 60, S + 90)]);

  // Duplicate (behind ⋯) waits for a tap like Move… does. Escape first lets go of the copy, whose toolbar covers the original.
  await page.keyboard.press("Escape");
  await expect(timeline.getByTestId("block-toolbar")).toHaveCount(0);
  await at(S).click();
  await timeline.getByTestId("block-toolbar").getByRole("button", { name: "More block actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Tap a time for a copy of “${title}”` })).toBeVisible();
  const slot = await pointAt(timeline, S + 121);
  await page.mouse.click(slot.x, slot.y);
  await expect(at(S + 120)).toBeVisible();
  await expectTaskBlocks(title, [span(S, S + 30), span(S + 60, S + 90), span(S + 120, S + 150)]);
  // Three blocks: the row's chip shows the first start and "+2".
  await expect(row).toContainText(`${hhmm(S)}+2`);

  // Dragged off the timeline onto the list, a block goes and its task stays, with an undo.
  await showMinute(timeline, S + 120);
  const last = (await at(S + 120).boundingBox())!;
  const drop = page.getByTestId("section-drop").filter({ hasText: "Drop here to remove the block — the task stays" });
  await drag(page, { x: last.x + last.width / 2, y: last.y + 10 }, async () => {
    await expect(drop).toBeVisible();
    const d = (await drop.boundingBox())!;
    return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
  });
  const toast = page.getByRole("status").filter({ hasText: `Removed the block for “${title}”` });
  await expect(toast).toBeVisible();
  await expect(at(S + 120)).toHaveCount(0);
  await expect(row).toBeVisible();
  await expectTaskBlocks(title, [span(S, S + 30), span(S + 60, S + 90)]);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(at(S + 120)).toBeVisible();
  await expectTaskBlocks(title, [span(S, S + 30), span(S + 60, S + 90), span(S + 120, S + 150)]);
});

test("a task takes a second block from its row's Block and from B; the chip says +1; the detail moves, locks and removes each block", async ({ page }) => {
  const twice = uniqueTitle("two blocks");
  const half = uniqueTitle("half blocked");
  await seed(twice, 60);
  await seed(half, 60, [S + 200, S + 230]);
  const timeline = await openDay(page);
  const row = page.getByRole("row").filter({ hasText: twice });
  await expect(row).toBeVisible();

  // The row's Block, then a tap: an hour, the whole estimate.
  const placeFromRow = async (minute: number) => {
    await row.hover();
    await row.getByRole("button", { name: `Block ${twice}` }).click();
    await expect(page.getByRole("status").filter({ hasText: `Tap a time for “${twice}”` })).toBeVisible();
    const p = await pointAt(timeline, minute);
    await page.mouse.click(p.x, p.y);
  };
  await placeFromRow(S + 1);
  await expectTaskBlocks(twice, [span(S, S + 60)]);
  // Block stays on the row once blocked: a second block, and the chip counts it.
  await placeFromRow(S + 71);
  await expectTaskBlocks(twice, [span(S, S + 60), span(S + 70, S + 130)]);
  await expect(row).toContainText(`${hhmm(S)}+1`);

  // B on a task half covered: the next free gap gets what the estimate still needs, half an hour.
  const halfRow = page.getByRole("row").filter({ hasText: half });
  await halfRow.getByRole("button", { name: half, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(halfRow).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("b");
  await expect(page.getByRole("status").filter({ hasText: `Blocked “${half}”` })).toBeVisible();
  await expect.poll(async () => (await withDb((c) => c.query<{ n: number }>("select count(*)::int as n from public.time_blocks b join public.tasks t on t.id = b.task_id where t.title = $1 and b.deleted_at is null and b.end_at - b.start_at = interval '30 minutes'", [half]))).rows[0].n).toBe(2);
  await expect(halfRow).toContainText("+1");

  // The detail lists each block, says the two hours are an hour over the estimate, and edits them.
  await row.getByRole("button", { name: twice, exact: true }).click();
  const detail = page.getByRole("complementary", { name: "Task" });
  await expect(detail).toBeVisible();
  const first = detail.getByRole("button", { name: new RegExp(`^Blocked\\s*${span(S, S + 60)}$`) });
  await expect(first).toBeVisible();
  await expect(detail.getByRole("button", { name: new RegExp(`^Blocked\\s*${span(S + 70, S + 130)}$`) })).toBeVisible();
  await expect(detail.getByTestId("block-estimate-hint")).toHaveText("2h blocked · 1h over the 1h estimate");

  // Starts: a new start keeps the end.
  await first.click();
  const panel = detail.getByRole("dialog", { name: "Blocked" });
  await panel.getByLabel("Block starts").fill(hhmm(S + 15));
  await panel.getByRole("button", { name: "Save" }).click();
  await expectTaskBlocks(twice, [span(S + 15, S + 60), span(S + 70, S + 130)]);
  // Ends: a new end keeps the start.
  await detail.getByRole("button", { name: new RegExp(`^Blocked\\s*${span(S + 15, S + 60)}$`) }).click();
  await panel.getByLabel("Block ends").fill(hhmm(S + 45));
  await panel.getByRole("button", { name: "Save" }).click();
  await expectTaskBlocks(twice, [span(S + 15, S + 45), span(S + 70, S + 130)]);

  // Lock: the fields wait for Unlock; Remove block takes it away, and the task keeps the other.
  const moved = detail.getByRole("button", { name: new RegExp(`^Blocked\\s*${span(S + 15, S + 45)}`) });
  await moved.click();
  await panel.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(panel.getByText("Locked — unlock it to change the time.")).toBeVisible();
  await expect(panel.getByLabel("Block starts")).toBeDisabled();
  await expect(moved).toHaveAccessibleName(/· locked$/);
  await expect
    .poll(async () => (await withDb((c) => c.query<{ locked: boolean }>("select b.locked from public.time_blocks b join public.tasks t on t.id = b.task_id where t.title = $1 and b.deleted_at is null order by b.start_at limit 1", [twice]))).rows[0]?.locked)
    .toBe(true);
  await panel.getByRole("button", { name: "Remove block" }).click();
  await expect(detail.getByRole("button", { name: /^Blocked/ })).toHaveCount(1);
  await expectTaskBlocks(twice, [span(S + 70, S + 130)]);
});

test("keys on a selected block: Shift+↓/↑ resize by five minutes, L locks, Enter opens its task, Backspace removes it", async ({ page }) => {
  const title = uniqueTitle("keys block");
  await seed(title, 30, [S, S + 30]);
  const timeline = await openDay(page);
  const block = blockOn(timeline, title);
  await showMinute(timeline, S);
  await block.click();
  await expect(block).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Shift+ArrowDown");
  await expectBlockAt(block, S, S + 35);
  await page.keyboard.press("Shift+ArrowDown");
  await expectBlockAt(block, S, S + 40);
  await page.keyboard.press("Shift+ArrowUp");
  await expectBlockAt(block, S, S + 35);
  await expectTaskBlocks(title, [span(S, S + 35)]);

  await page.keyboard.press("l");
  await expect(block).toHaveAttribute("aria-label", /, locked$/);
  await expect.poll(async () => (await withDb((c) => c.query<{ locked: boolean }>("select b.locked from public.time_blocks b join public.tasks t on t.id = b.task_id where t.title = $1 and b.deleted_at is null", [title]))).rows[0]?.locked).toBe(true);
  // Locked, it keeps its length.
  await page.keyboard.press("Shift+ArrowDown");
  await expectBlockAt(block, S, S + 35);
  await page.keyboard.press("l");
  await expect(block).not.toHaveAttribute("aria-label", /, locked$/);

  // Enter opens the block's task.
  await page.keyboard.press("Enter");
  const detail = page.getByRole("complementary", { name: "Task" });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("textbox", { name: "Title" })).toHaveValue(title);
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);

  // Backspace removes it, with an undo.
  await block.click();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("status").filter({ hasText: `Removed the block for “${title}”` })).toBeVisible();
  await expect(block).toHaveCount(0);
  await expectTaskBlocks(title, []);
});

test("+ and - and the − / + control zoom between 30-, 15- and 5-minute rows; a row dropped at each zoom lands on the minute under it", async ({ page }) => {
  const fifteen = uniqueTitle("zoom fifteen");
  const five = uniqueTitle("zoom five");
  await seed(fifteen, 30);
  await seed(five, 45);
  const timeline = await openDay(page);
  const zoom = page.getByRole("group", { name: "Timeline zoom" });
  await expect(timeline).toHaveAttribute("data-zoom", "30");
  await expect(zoom).toContainText("30m rows");

  await page.keyboard.press("+");
  await expect(timeline).toHaveAttribute("data-zoom", "15");
  await page.keyboard.press("+");
  await expect(timeline).toHaveAttribute("data-zoom", "5");
  await expect(zoom.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  await page.keyboard.press("-");
  await expect(timeline).toHaveAttribute("data-zoom", "15");
  await zoom.getByRole("button", { name: "Zoom out" }).click();
  await expect(timeline).toHaveAttribute("data-zoom", "30");
  await expect(zoom.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await expect(timeline).toHaveAttribute("data-zoom", "15");
  await expect(zoom).toContainText("15m rows");

  // A row dragged on at 15-minute rows: the ghost and the block start on the minute under the pointer.
  const dropAt = async (title: string, minute: number) => {
    const handle = page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: title, exact: true });
    await expect(handle).toBeVisible();
    await showMinute(timeline, minute);
    const grab = (await handle.boundingBox())!;
    await drag(page, { x: grab.x + 20, y: grab.y + grab.height / 2 }, () => pointAt(timeline, minute + 2, false), {
      beforeDrop: () => expect(timeline.getByTestId("timeline-ghost")).toContainText(`${hhmm(minute)}${title}`),
    });
  };
  await dropAt(fifteen, S + 35);
  await expectBlockAt(blockOn(timeline, fifteen), S + 35, S + 65);
  await expectTaskBlocks(fifteen, [span(S + 35, S + 65)]);

  // And at 5-minute rows.
  await page.keyboard.press("Escape");
  await page.keyboard.press("+");
  await expect(timeline).toHaveAttribute("data-zoom", "5");
  await dropAt(five, S + 125);
  await expectBlockAt(blockOn(timeline, five), S + 125, S + 170);
  await expectTaskBlocks(five, [span(S + 125, S + 170)]);
  // Remembered on the device.
  await page.reload();
  await waitForSync(page);
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-zoom", "5");
});

test("when the plan runs past the day, a marker pinned under the day's end says by how much", async ({ page }) => {
  const title = uniqueTitle("overrun");
  // A whole day's work on what is left of today: it cannot fit, whatever the time.
  await seed(title, 24 * 60);
  const timeline = await openDay(page);
  const marker = timeline.getByTestId("overrun");
  await expect(marker).toHaveText(/^(\d+h)?\s?(\d+m)? past the end of your day$/);
  // Pinned under the day's end (the extra hours run to 23:59).
  await showMinute(timeline, 23 * 60 + 59);
  const scale = await scaleOf(timeline);
  const top = (await timeline.boundingBox())!.y;
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.y - (top + (23 * 60 + 59) * scale + 4))).toBeLessThan(3);

  // Moved to tomorrow, the day fits again and the marker goes.
  const row = page.getByRole("row").filter({ hasText: title });
  await row.hover();
  await row.getByRole("button", { name: "Tomorrow" }).click();
  await expect(marker).toHaveCount(0);
});
