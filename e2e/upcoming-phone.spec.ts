// Upcoming on a phone (SCREENS.md §3 "Responsive", DESIGN_SYSTEM.md §4a): the
// week's days stack as an agenda, a run of free days folded into day cells,
// and every day keeps its capacity readout and bar from 412 px down to
// 360 px with nothing scrolling sideways. A row's "More actions" moves a task
// to another day, and both days' readouts change by its estimate. The 7-day
// strip pinned over the agenda names each day with its readout and jumps to
// it; "Not yet planned · N" opens a sheet where a day's cell places a task.
//
// As in upcoming-week.spec.ts, the dev account gets working hours over every
// hour of every day for the length of the spec (extra rows, deleted in
// afterAll), so no day of the week has to be a working day.
import { expect, test } from "./fixtures";
import { addAllDayHours, daysWithMeetings, devAccount, isoPlus, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";
import type { Page } from "@playwright/test";

const moved = uniqueTitle("phone week");
const unplanned = uniqueTitle("phone unplanned");

let me: DevAccount;
let addedHours: string[] = [];
let meetings = new Set<string>();

const READOUT = /^((\d+h)?( ?\d+m)? (spare|over)|no working hours|out of office)$/;

function minutes(text: string | null): number {
  const m = /^(?:(\d+)h)? ?(?:(\d+)m)? (spare|over)$/.exec((text ?? "").trim());
  if (!m) throw new Error(`not a capacity readout: "${text}"`);
  const value = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return m[3] === "over" ? -value : value;
}

/** A stacked day (or its cell in a run of free days), and its readout. */
const day = (page: Page, iso: string) => page.locator(`[data-day="${iso}"]`).first();
const readout = (page: Page, iso: string) => day(page, iso).locator("span").filter({ hasText: READOUT }).first();
const readValue = async (page: Page, iso: string) => minutes(await readout(page, iso).textContent());

/**
 * The calendar mirror reaches a fresh device on its own stream, after the first sync: until a day's meetings are
 * drawn its readout is not final, so a day with meetings is read only once they are on its bar.
 */
async function settled(page: Page, ...days: string[]): Promise<void> {
  for (const iso of days) if (meetings.has(iso)) await expect(page.locator(`[data-day="${iso}"] [data-segment="meeting"]`).first()).toBeAttached({ timeout: 30_000 });
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    addedHours = await addAllDayHours(c, me);
    meetings = await daysWithMeetings(c, me, Array.from({ length: 7 }, (_, i) => isoPlus(me.today, i)));
    await c.query(
      `insert into public.tasks (id, space_id, title, state, priority, do_date, estimate_min, sort_key)
       values (gen_random_uuid(), $1, $2, 'active', 0, $3::date, 50, 'y0000000000000000000000031')`,
      [me.sid, moved, isoPlus(me.today, 3)],
    );
    // No day yet: it waits in "Not yet planned".
    await c.query(
      `insert into public.tasks (id, space_id, title, state, priority, do_date, estimate_min, sort_key)
       values (gen_random_uuid(), $1, $2, 'active', 0, null, 40, 'y0000000000000000000000032')`,
      [me.sid, unplanned],
    );
  });
});

test.afterAll(async () => {
  if (addedHours.length > 0) await withDb((c) => c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]));
});

test("from 412 to 360 px the days stack, each with its readout and bar, and nothing scrolls sideways", async ({ page }) => {
  await openApp(page, "/upcoming");
  await expect(day(page, me.today)).toBeVisible();
  for (const width of [412, 375, 360]) {
    await page.setViewportSize({ width, height: 800 });
    // Stacked days, not columns.
    await expect(page.locator("[data-week]")).toHaveCount(0);
    for (let i = 0; i < 7; i++) {
      const iso = isoPlus(me.today, i);
      const text = readout(page, iso);
      await text.scrollIntoViewIfNeeded();
      // Whole, not clipped at the edge.
      await expect(text).toBeInViewport({ ratio: 1 });
      await expect(day(page, iso).locator("[data-bar]")).toHaveCount(1);
      const bar = await day(page, iso).locator("[data-bar]").boundingBox();
      expect(bar && bar.width > 0 && bar.x >= 0 && bar.x + bar.width <= width).toBe(true);
    }
    // Neither the page nor any scroller inside it is wider than the screen.
    const sideways = await page.evaluate(() => {
      const out: string[] = [];
      const doc = document.scrollingElement ?? document.documentElement;
      if (doc.scrollWidth > window.innerWidth) out.push(`document ${doc.scrollWidth} > ${window.innerWidth}`);
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const x = getComputedStyle(el).overflowX;
        if ((x === "auto" || x === "scroll") && el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth} > ${el.clientWidth}`);
      }
      return out;
    });
    expect(sideways, `at ${width} px`).toEqual([]);
  }
});

test("a row's More actions moves the task to tomorrow; both days' readouts follow", async ({ page }) => {
  // Three days out to start from (run once or again).
  await withDb((c) => c.query("update public.tasks set do_date = $2::date where title = $1", [moved, isoPlus(me.today, 3)]));
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page, "/upcoming");
  const [from, to] = [isoPlus(me.today, 3), isoPlus(me.today, 1)];
  const row = day(page, from).getByRole("row").filter({ hasText: moved });
  await expect(row).toBeVisible();
  await settled(page, from, to);
  const before = { from: await readValue(page, from), to: await readValue(page, to) };

  await row.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Tomorrow" }).click();
  await expect(day(page, to).getByRole("row").filter({ hasText: moved })).toBeVisible();
  await expect(day(page, from).getByRole("row").filter({ hasText: moved })).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date", [moved, to])).not.toBeNull();
  await expect.poll(() => readValue(page, from)).toBe(before.from + 50);
  await expect.poll(() => readValue(page, to)).toBe(before.to - 50);
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Thu 8" for an ISO date, as a strip cell names its day. */
const cellDay = (iso: string) => `${WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${Number(iso.slice(8))}`;
/** A spoken readout: "3 hours 20 minutes spare", "20 minutes over", "no working hours". */
const SPOKEN = "((\\d+ hours?)? ?(\\d+ minutes?)? (spare|over)|no working hours|out of office)";

test("the 7-day strip stays pinned, names each day with its readout in words, and a tap brings that day's header into view, focused", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page, "/upcoming");
  const strip = page.getByRole("group", { name: "Jump to a day" });
  await expect(strip.getByRole("button")).toHaveCount(7);
  for (let i = 0; i < 7; i++) {
    const iso = isoPlus(me.today, i);
    const cell = strip.locator(`[data-strip-day="${iso}"]`);
    await expect(cell).toHaveAccessibleName(new RegExp(`^${cellDay(iso)}${i === 0 ? ", today" : ""}, ${SPOKEN}$`));
    if (i === 0) await expect(cell).toHaveAttribute("aria-current", "date");
    const box = (await cell.boundingBox())!;
    expect(box.width, `${iso} is a 44 px target`).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  // The last day: its header (unfolded, if it sat in a run of free days) comes up under the strip, focused.
  const last = isoPlus(me.today, 6);
  await strip.locator(`[data-strip-day="${last}"]`).click();
  const header = page.locator(`#agenda-${last}`);
  await expect(header).toBeFocused();
  await expect(header).toBeInViewport();
  await expect(strip).toBeInViewport();
  // And back to today.
  await strip.locator(`[data-strip-day="${me.today}"]`).click();
  await expect(page.locator(`#agenda-${me.today}`)).toBeFocused();
});

test("Not yet planned · N opens a sheet where a day's cell places a task at the end of that day; the count and the day's readout follow", async ({ page }) => {
  // No day yet (run once or again).
  await withDb((c) => c.query("update public.tasks set do_date = null where title = $1", [unplanned]));
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page, "/upcoming");
  const to = isoPlus(me.today, 4);
  await settled(page, to);
  const before = await readValue(page, to);

  const open = page.getByRole("button", { name: /^Not yet planned · \d+$/ });
  await expect(open).toBeVisible();
  const count = Number(/(\d+)$/.exec((await open.textContent())!.trim())![1]);
  await open.click();
  const sheet = page.getByRole("dialog", { name: "Not yet planned" });
  await expect(sheet.getByRole("heading", { name: /^Not yet planned/ })).toHaveText(`Not yet planned · ${count}`);
  const task = sheet.getByRole("listitem").filter({ hasText: unplanned });
  const cells = task.getByRole("group", { name: `Move “${unplanned}” to` }).getByRole("button");
  await expect(cells).toHaveCount(7);
  // Nothing scrolls sideways with the sheet open.
  expect(await page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollWidth <= window.innerWidth)).toBe(true);

  await task.locator(`[data-strip-day="${to}"]`).click();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date = $2::date", [unplanned, to])).not.toBeNull();
  await expect(task).toHaveCount(0);
  await expect(sheet.getByRole("heading", { name: /^Not yet planned/ })).toHaveText(`Not yet planned · ${count - 1}`);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(day(page, to).getByRole("listitem").filter({ hasText: unplanned })).toBeVisible();
  await expect.poll(() => readValue(page, to)).toBe(before - 40);
});
