// The Calendar view on a desktop (SCREENS.md §4; DECISIONS.md "`Cmd+1/2/3` in a browser tab", "Calendar rail in
// week modes"): Day · Work week · Week from the control and the palette, while Cmd/Ctrl+1–3 stay the browser's in a
// tab; each day's header readout is Upcoming's; `[` / `]` step a day or a week and `T` comes back, the day kept in
// the address; a range with nothing on says how blocks get there; a task dragged from the rail onto another day's
// slot moves there with its block, and one undo puts both back; a block dragged onto another day moves there; a
// right-click locks a block; `B` places a selected rail task on today. Every write is read back from Postgres.
//
// Any day may be a day off, so the dev account gets working hours over every hour of every day for the length of
// the spec (extra rows beside its own, deleted in afterAll). Its open tasks through today are stood aside (they
// start tomorrow; afterAll puts them back exactly), so the rail is this spec's own. The blocks go in a stretch of the
// evening clear of the account's own blocks and meetings on the day used. Each test's rows are removed as it ends.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, isoPlus, putBack, removeOwn, standAside, withDb, type DevAccount, type StoodAside } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";
import { blockOn, drag, hhmm, pointAt, quietStretch, seedBlock, seedTask, showMinute } from "./timeline-helpers";

let me: DevAccount;
let weekStart = 0;
/** A day after today, not the last of its week, so it and the day after it share one week on screen. */
let D = "";
let D1 = "";
let S = 19 * 60;
let since = "";
let addedHours: string[] = [];
let stood: StoodAside[] = [];
let mine: string[] = [];

/** Monday = 0 … Sunday = 6, as user_settings.week_start counts. */
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    since = (await c.query<{ t: string }>("select now()::text as t")).rows[0].t;
    weekStart = Number((await c.query<{ w: number | null }>("select week_start as w from public.user_settings where user_id = $1", [me.uid])).rows[0]?.w ?? 0);
    D = isoPlus(me.today, 1);
    if (weekday(D) === (weekStart + 6) % 7) D = isoPlus(D, 1);
    D1 = isoPlus(D, 1);
    addedHours = await addAllDayHours(c, me);
    stood = await standAside(c, me);
    // A stretch clear on both days the spec blocks on.
    const a = await quietStretch(c, { ...me, today: D });
    S = a === (await quietStretch(c, { ...me, today: D1 })) ? a : 20 * 60;
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

/** The Calendar in a mode, anchored on a day (none: today). */
async function openCalendar(page: Page, mode: "day" | "workweek" | "week", day?: string) {
  await page.addInitScript((m) => localStorage.setItem("sparehour.calendar.mode", m), mode);
  await openApp(page, day ? `/calendar?day=${day}` : "/calendar");
  await expect(page.locator("[data-calendar-grid]")).toBeVisible();
}
const columns = (page: Page) => page.locator("[data-calendar-grid] [data-day]");
const timelineOn = (page: Page, iso: string): Locator => page.locator(`[data-calendar-grid] [data-day="${iso}"]`).getByTestId("timeline");
const rail = (page: Page) => page.getByRole("region", { name: "Today's tasks without a time" });

/** A task's live blocks as Postgres has them: the task's do-date and each block's day and times on the account's clock. */
async function stored(title: string): Promise<{ doDate: string; blocks: string[] }> {
  return withDb(async (c) => {
    const t = await c.query<{ d: string }>("select do_date::text as d from public.tasks where title = $1 and deleted_at is null", [title]);
    const b = await c.query<{ s: string }>(
      `select to_char(b.start_at at time zone s.timezone, 'YYYY-MM-DD HH24:MI') || '–' || to_char(b.end_at at time zone s.timezone, 'HH24:MI') as s
         from public.time_blocks b join public.tasks t on t.id = b.task_id join public.user_settings s on s.user_id = b.user_id
        where t.title = $1 and b.deleted_at is null order by b.start_at`,
      [title],
    );
    return { doDate: t.rows[0]?.d ?? "", blocks: b.rows.map((r) => r.s) };
  });
}

test("Day, Work week and Week from the control and the palette; Cmd/Ctrl+1–3 stay the browser's in a tab", async ({ page }) => {
  await openCalendar(page, "week");
  await expect(columns(page)).toHaveCount(7);
  await page.getByRole("radio", { name: "Work week" }).click();
  await expect(columns(page)).toHaveCount(5);
  await page.getByRole("radio", { name: "Day" }).click();
  await expect(columns(page)).toHaveCount(1);
  await expect(page.getByText(/^Calendar · Today$/)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByPlaceholder("Search or run a command…").fill("Calendar: Week");
  await page.keyboard.press("Enter");
  await expect(columns(page)).toHaveCount(7);
  // Remembered on the device: a reload opens on the week.
  await page.reload();
  await expect(columns(page)).toHaveCount(7);
  // A browser tab keeps Cmd/Ctrl+1 for its own tabs (the installed app takes it): the mode stays.
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+1");
  await expect(columns(page)).toHaveCount(7);
});

test("each day's header readout is Upcoming's figure for that day", async ({ page }) => {
  await openCalendar(page, "day");
  const readout = (await page.locator(`[data-day-header="${me.today}"]`).innerText()).match(/\d+h(?: \d+m)? (?:spare|over)|\d+m (?:spare|over)|no working hours|out of office/)?.[0];
  expect(readout).toBeTruthy();
  await page.goto("/upcoming");
  await expect(page.locator(`[data-column="${me.today}"]`).first()).toContainText(readout!);
});

test("[ and ] step a day in the Day mode and a week in the Week mode; T comes back; the day stays in the address", async ({ page }) => {
  await openCalendar(page, "day");
  await page.keyboard.press("]");
  await expect(page).toHaveURL(new RegExp(`/calendar\\?day=${isoPlus(me.today, 1)}$`));
  await expect(columns(page)).toHaveCount(1);
  await expect(columns(page).first()).toHaveAttribute("data-day", isoPlus(me.today, 1));
  await page.reload();
  await expect(columns(page).first()).toHaveAttribute("data-day", isoPlus(me.today, 1));
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(columns(page).first()).toHaveAttribute("data-day", me.today);

  await page.getByRole("radio", { name: "Week" }).click();
  const first = await columns(page).first().getAttribute("data-day");
  await page.keyboard.press("]");
  await expect(columns(page).first()).toHaveAttribute("data-day", isoPlus(first!, 7));
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(columns(page).first()).toHaveAttribute("data-day", first!);
});

test("a range with nothing on says how blocks get there", async ({ page }) => {
  await openCalendar(page, "day", isoPlus(me.today, 400));
  await expect(page.getByText("Nothing on. Drag a task in, or drag on the grid to block time.")).toBeVisible();
});

test("a rail task dragged onto another day's slot moves there with its block; one undo puts both back", async ({ page }) => {
  const title = uniqueTitle("Cal rail drop");
  mine.push(title);
  await withDb((c) => seedTask(c, me, title, { estimate: 45 }));
  await openCalendar(page, "week", D);
  const row = rail(page).getByRole("row").filter({ hasText: title });
  const handle = row.getByRole("button", { name: title, exact: true });
  await expect(handle).toBeVisible();
  await showMinute(timelineOn(page, D), S);
  const grab = (await handle.boundingBox())!;
  await drag(page, { x: grab.x + 20, y: grab.y + grab.height / 2 }, () => pointAt(timelineOn(page, D), S + 2, false), {
    beforeDrop: () => expect(timelineOn(page, D).getByTestId("timeline-ghost")).toContainText(`${hhmm(S)}${title}`),
  });
  await expect.poll(() => stored(title), { timeout: 15_000 }).toEqual({ doDate: D, blocks: [`${D} ${hhmm(S)}–${hhmm(S + 45)}`] });
  // It has a time now, on another day: it leaves today's rail.
  await expect(row).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => stored(title), { timeout: 15_000 }).toEqual({ doDate: me.today, blocks: [] });
  await expect(rail(page).getByRole("row").filter({ hasText: title })).toBeVisible();
});

test("a block dragged onto the next day moves there, keeping its length", async ({ page }) => {
  const title = uniqueTitle("Cal move");
  mine.push(title);
  await withDb((c) => seedBlock(c, { ...me, today: D }, { taskId: null, title, start: S, end: S + 60 }));
  await openCalendar(page, "week", D);
  const block = blockOn(timelineOn(page, D), title);
  await expect(block).toBeVisible();
  await showMinute(timelineOn(page, D), S);
  const from = (await block.boundingBox())!;
  // Straight across: the two days share one scroll, so the same height is the same minute on the next day.
  const grab = { x: from.x + from.width / 2, y: from.y + 10 };
  await drag(page, grab, async () => {
    const next = (await timelineOn(page, D1).boundingBox())!;
    return { x: next.x + next.width * 0.6, y: grab.y };
  });
  await expect
    .poll(
      () =>
        withDb(async (c) =>
          (
            await c.query<{ s: string }>(
              `select to_char(b.start_at at time zone s.timezone, 'YYYY-MM-DD HH24:MI') || '–' || to_char(b.end_at at time zone s.timezone, 'HH24:MI') as s
                 from public.time_blocks b join public.user_settings s on s.user_id = b.user_id where b.title = $1 and b.deleted_at is null`,
              [title],
            )
          ).rows.map((r) => r.s),
        ),
      { timeout: 15_000 },
    )
    .toEqual([`${D1} ${hhmm(S)}–${hhmm(S + 60)}`]);
});

test("a right-click on a block opens its menu: Lock locks it", async ({ page }) => {
  const title = uniqueTitle("Cal lock");
  mine.push(title);
  await withDb((c) => seedBlock(c, { ...me, today: D }, { taskId: null, title, start: S, end: S + 30 }));
  await openCalendar(page, "week", D);
  const block = blockOn(timelineOn(page, D), title);
  await block.scrollIntoViewIfNeeded();
  await block.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "More block actions" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Lock", "Delete", "Rename", "Duplicate"]);
  await menu.getByRole("menuitem", { name: "Lock" }).click();
  await expect
    .poll(() => withDb(async (c) => (await c.query<{ locked: boolean }>("select locked from public.time_blocks where title = $1 and deleted_at is null", [title])).rows[0]?.locked), { timeout: 15_000 })
    .toBe(true);
  await expect(blockOn(timelineOn(page, D), title)).toHaveAttribute("aria-label", /, locked/);
});

test("B places the selected rail task in the next free gap of today", async ({ page }) => {
  const title = uniqueTitle("Cal B");
  mine.push(title);
  await withDb((c) => seedTask(c, me, title, { estimate: 30 }));
  await openCalendar(page, "week");
  const row = rail(page).getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: title, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("b");
  await expect.poll(async () => (await stored(title)).blocks.map((b) => b.slice(0, 10)), { timeout: 15_000 }).toEqual([me.today]);
  expect((await stored(title)).doDate).toBe(me.today);
});
