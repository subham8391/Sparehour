// The morning plan's last two steps on a desktop (SCREENS.md §14 "As built 2026-10-07"): step 2 is a keyboard
// picker — a click highlights a row, Space ticks it, E opens its estimate presets in place (so does a click on
// the chip) and the one readout follows at once, N adds a task to today, → goes on; step 3 lists the picked
// daytime tasks still without a time beside the timeline, and a drag, a tap on Block then a time, or B each
// block one, through Today's own placing, with the spare line counting down what is left to block.
//
// Today may be a weekend or a day off, so the dev account gets working hours over every hour of every day for the
// length of the spec (extra rows beside its own, deleted in afterAll). The account's open tasks through today are
// stood aside (they start tomorrow; afterAll puts them back exactly), so what is picked, and what is left to
// block, is this spec's own. The blocks go in a stretch of the evening clear of the account's blocks and
// meetings. Each test's rows are removed as it ends.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, isoPlus, putBack, removeOwn, standAside, waitForRow, withDb, type DevAccount, type StoodAside } from "./db";
import { clickTitle, DEV_USER, openApp, uniqueTitle } from "./helpers";
import { blockOn, drag, expectTaskBlocks, hhmm, pointAt, quietStretch, seedBlock, seedTask, showMinute } from "./timeline-helpers";

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
  await page.addInitScript(() => localStorage.setItem("sparehour.blockNudge", "dismissed"));
});

const span = (start: number, end: number) => `${hhmm(start)}–${hhmm(end)}`;

async function toStep(page: Page, step: 2 | 3) {
  await openApp(page, "/plan");
  await expect(page.getByRole("heading", { name: "Here’s your day" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick today’s tasks" })).toBeVisible();
  if (step === 3) {
    await page.getByRole("button", { name: "Next · Block time" }).click();
    await expect(page.getByRole("heading", { name: "Block time" })).toBeVisible();
  }
}

test("step 2: a click highlights a row, Space ticks it, E and the chip edit its estimate in place, N adds to today, → goes on", async ({ page }) => {
  const pick = uniqueTitle("plan pick");
  const added = uniqueTitle("plan added");
  mine.push(pick, added);
  // Due this week, on no day yet: the picker's middle group.
  await withDb((c) => seedTask(c, me, pick, { doDate: null, deadline: isoPlus(me.today, 3), estimate: 25 }));
  await toStep(page, 2);

  const group = page.getByRole("region", { name: "Due this week" });
  const row = group.getByRole("listitem").filter({ hasText: pick });
  await expect(row).toBeVisible();
  const readout = page.getByRole("status").filter({ hasText: "fits today ·" });
  await expect(readout).toContainText("0m picked · 0 tasks");

  // A click beside the chips (not the tick, not the chip) only highlights the row.
  const box = (await row.boundingBox())!;
  await row.click({ position: { x: box.width - 6, y: box.height / 2 } });
  await expect(row).toHaveAttribute("aria-current", "true");
  const tick = row.getByRole("checkbox", { name: `Pick ${pick}` });
  await expect(tick).not.toBeChecked();

  // Space ticks it: on today, and in the readout.
  await page.keyboard.press(" ");
  await expect(tick).toBeChecked();
  await expect(readout).toContainText("25m picked · 1 task");
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date", [pick, me.today])).not.toBeNull();

  // E opens its estimate presets in place.
  await page.keyboard.press("e");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "45m", exact: true }).click();
  await expect(readout).toContainText("45m picked · 1 task");
  await expect(row.getByRole("button", { name: `Estimate for ${pick}` })).toHaveText("45m");
  expect(await waitForRow("select id from public.tasks where title = $1 and estimate_min = 45", [pick])).not.toBeNull();

  // So does a click on the chip.
  await row.getByRole("button", { name: `Estimate for ${pick}` }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "1h", exact: true }).click();
  await expect(readout).toContainText("1h picked · 1 task");
  expect(await waitForRow("select id from public.tasks where title = $1 and estimate_min = 60", [pick])).not.toBeNull();

  // N, with nothing focused: quick add, already saying "today ".
  await page.getByText("Tick what you’ll work on.").click();
  await page.keyboard.press("n");
  const taskBox = page.getByRole("textbox", { name: "Task" });
  await expect(taskBox).toBeFocused();
  await expect(taskBox).toHaveValue("today ");
  await taskBox.press("End");
  await taskBox.pressSequentially(`${added} ~15m`);
  await taskBox.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(taskBox).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date and estimate_min = 15", [added, me.today])).not.toBeNull();
  await expect(readout).toContainText("1h 15m picked · 2 tasks");

  // → goes on to the last step, where both wait for a time.
  await page.getByText("Tick what you’ll work on.").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Block time" })).toBeVisible();
  const toBlock = page.getByRole("region", { name: "To block" });
  await expect(toBlock.getByRole("listitem").filter({ hasText: pick })).toBeVisible();
  await expect(toBlock.getByRole("listitem").filter({ hasText: added })).toBeVisible();
});

test("step 3: the picked tasks without a time sit beside the timeline; a drag, Block then a tap, and B each block one", async ({ page }) => {
  const dragged = uniqueTitle("plan drag");
  const tapped = uniqueTitle("plan tap");
  const keyed = uniqueTitle("plan key");
  const blocked = uniqueTitle("plan blocked");
  const evening = uniqueTitle("plan evening");
  mine.push(dragged, tapped, keyed, blocked, evening);
  await withDb(async (c) => {
    await seedTask(c, me, dragged, { estimate: 30 });
    await seedTask(c, me, tapped, { estimate: 45 });
    await seedTask(c, me, keyed, { estimate: 25 });
    const id = await seedTask(c, me, blocked, { estimate: 30 });
    await seedBlock(c, me, { taskId: id, title: blocked, start: S + 200, end: S + 230 });
    const ev = await seedTask(c, me, evening, { estimate: 30 });
    await c.query("update public.tasks set evening = true where id = $1", [ev]);
  });
  await toStep(page, 3);

  const toBlock = page.getByRole("region", { name: "To block" });
  const rowOf = (title: string) => toBlock.getByRole("listitem").filter({ hasText: title });
  for (const t of [dragged, tapped, keyed]) await expect(rowOf(t)).toBeVisible();
  // Already blocked, or an evening task: nothing to place.
  await expect(rowOf(blocked)).toHaveCount(0);
  await expect(rowOf(evening)).toHaveCount(0);
  const left = page.getByText(/ (spare|over) · /);
  await expect(left).toContainText("3 to block");
  // Beside the timeline, on its left.
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toBeVisible();
  const listBox = (await toBlock.boundingBox())!;
  expect(listBox.x + listBox.width).toBeLessThanOrEqual((await timeline.boundingBox())!.x);
  await expect(blockOn(timeline, blocked)).toBeAttached();

  // A drag onto the timeline: a block of its estimate where it is dropped.
  await showMinute(timeline, S);
  const handle = rowOf(dragged).getByRole("button", { name: dragged, exact: true });
  const grab = (await handle.boundingBox())!;
  await drag(page, { x: grab.x + 20, y: grab.y + grab.height / 2 }, () => pointAt(timeline, S + 2, false), {
    beforeDrop: () => expect(timeline.getByTestId("timeline-ghost")).toContainText(`${hhmm(S)}${dragged}`),
  });
  await expectTaskBlocks(dragged, [span(S, S + 30)]);
  await expect(rowOf(dragged)).toHaveCount(0);
  await expect(left).toContainText("2 to block");

  // Block, then a tap on a time.
  await rowOf(tapped).getByRole("button", { name: `Block ${tapped}` }).click();
  await expect(page.getByRole("status").filter({ hasText: `Tap a time for “${tapped}”` })).toBeVisible();
  const slot = await pointAt(timeline, S + 61);
  await page.mouse.click(slot.x, slot.y);
  await expectTaskBlocks(tapped, [span(S + 60, S + 105)]);
  await expect(rowOf(tapped)).toHaveCount(0);
  await expect(left).toContainText("1 to block");

  // B on the selected one: the next free gap, its estimate long. (A tap on its title selects it and waits for a
  // time; B lets go of the wait and places it.)
  await clickTitle(rowOf(keyed).getByRole("button", { name: keyed, exact: true }));
  await expect(rowOf(keyed)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("b");
  await expect(page.getByRole("status").filter({ hasText: `Tap a time for “${keyed}”` })).toHaveCount(0);
  await expect(blockOn(timeline, keyed)).toBeAttached();
  await expect
    .poll(async () => (await withDb((c) => c.query<{ n: number }>("select count(*)::int as n from public.time_blocks b join public.tasks t on t.id = b.task_id where t.title = $1 and b.deleted_at is null and b.end_at - b.start_at = interval '25 minutes'", [keyed]))).rows[0].n)
    .toBe(1);
  await expect(toBlock).toHaveCount(0);
  await expect(left).toContainText("everything picked has a time");

  // The timeline is Today's: L locks the selected block here too.
  const placed = blockOn(timeline, dragged);
  await showMinute(timeline, S);
  await placed.click();
  await page.keyboard.press("l");
  await expect(placed).toHaveAttribute("aria-label", /, locked$/);
  await expect.poll(async () => (await withDb((c) => c.query<{ locked: boolean }>("select b.locked from public.time_blocks b join public.tasks t on t.id = b.task_id where t.title = $1 and b.deleted_at is null", [dragged]))).rows[0]?.locked).toBe(true);
});
