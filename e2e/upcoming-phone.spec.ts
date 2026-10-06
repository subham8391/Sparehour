// Upcoming on a phone (SCREENS.md §3 "Responsive", DESIGN_SYSTEM.md §4a): the
// week's days stack as an agenda, a run of free days folded into day cells,
// and every day keeps its capacity readout and bar from 412 px down to
// 360 px with nothing scrolling sideways. A row's "More actions" moves a task
// to another day, and both days' readouts change by its estimate.
//
// As in upcoming-week.spec.ts, the dev account gets working hours over every
// hour of every day for the length of the spec (extra rows, deleted in
// afterAll), so no day of the week has to be a working day.
import { expect, test } from "./fixtures";
import { addAllDayHours, daysWithMeetings, devAccount, isoPlus, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";
import type { Page } from "@playwright/test";

const moved = uniqueTitle("phone week");

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
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page, "/upcoming");
  const [from, to] = [isoPlus(me.today, 3), isoPlus(me.today, 1)];
  const row = day(page, from).getByRole("listitem").filter({ hasText: moved });
  await expect(row).toBeVisible();
  await settled(page, from, to);
  const before = { from: await readValue(page, from), to: await readValue(page, to) };

  await row.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Tomorrow" }).click();
  await expect(day(page, to).getByRole("listitem").filter({ hasText: moved })).toBeVisible();
  await expect(day(page, from).getByRole("listitem").filter({ hasText: moved })).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date", [moved, to])).not.toBeNull();
  await expect.poll(() => readValue(page, from)).toBe(before.from + 50);
  await expect.poll(() => readValue(page, to)).toBe(before.to - 50);
});
