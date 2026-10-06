// Upcoming as the week planner (SCREENS.md §3, §6) on a desktop: seven day
// columns, each with its capacity bar and one-line readout, and the week's
// spare total in the header; a task moved to another day — by ← / →, by a
// drag, or by a row's action — changes both days' readouts by its estimate; a
// deadline lists the task in its day's "Due" group; [ and ] step a week,
// never before this one, and T comes back.
//
// Any day of the week may be a weekend or a day off, so for the length of the
// spec the dev account gets working hours over every hour of every day: extra
// rows beside its own, which are never touched, deleted in afterAll. The
// spec's tasks are seeded on days two or more ahead (today's readout follows
// the clock); the account's own tasks on those days stay where they are,
// because every check is a difference the move makes, not an absolute figure.
import { expect, test } from "./fixtures";
import { addAllDayHours, daysWithMeetings, devAccount, isoPlus, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";
import type { Page } from "@playwright/test";

const keyed = uniqueTitle("week keys");
const dragged = uniqueTitle("week drag");
const later = uniqueTitle("week later");
const due = uniqueTitle("week due");
const dueSameDay = uniqueTitle("week due same day");

let me: DevAccount;
let addedHours: string[] = [];
let meetings = new Set<string>();

/** A day's readout: "3h 20m spare", "40m over", "no working hours" (or "out of office"). */
const READOUT = /^((\d+h)?( ?\d+m)? (spare|over)|no working hours|out of office)$/;

/** A readout as signed minutes: spare is positive, over is negative. */
function minutes(text: string | null): number {
  const m = /^(?:(\d+)h)? ?(?:(\d+)m)? (spare|over)$/.exec((text ?? "").trim());
  if (!m) throw new Error(`not a capacity readout: "${text}"`);
  const value = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return m[3] === "over" ? -value : value;
}

/** A day's column in the week (the day's drop zone, not its evening's). */
const column = (page: Page, iso: string) => page.locator(`[data-week] [data-day="${iso}"]:not([data-evening])`);
/** The readout under a column's day heading. */
const columnReadout = (page: Page, iso: string) => column(page, iso).locator("header > span");
const readValue = async (page: Page, iso: string) => minutes(await columnReadout(page, iso).textContent());

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
    meetings = await daysWithMeetings(c, me, Array.from({ length: 15 }, (_, i) => isoPlus(me.today, i)));
    // No day order of their own (null sorts first locally), so each is at the top of its day even in a full column.
    const seed: [string, string | null, string | null, number][] = [
      [keyed, isoPlus(me.today, 2), null, 60],
      [dragged, isoPlus(me.today, 4), null, 45],
      [later, isoPlus(me.today, 9), null, 25],
      [due, null, isoPlus(me.today, 3), 30],
      [dueSameDay, isoPlus(me.today, 3), isoPlus(me.today, 3), 20],
    ];
    for (const [title, doDate, deadline, estimate] of seed) {
      await c.query(
        `insert into public.tasks (id, space_id, title, state, priority, do_date, deadline, estimate_min, sort_key)
         values (gen_random_uuid(), $1, $2, 'active', 0, $3::date, $4::date, $5, 'y0000000000000000000000021')`,
        [me.sid, title, doDate, deadline, estimate],
      );
    }
  });
});

test.afterAll(async () => {
  // Exactly the working hours this spec added; its tasks go in the global teardown.
  if (addedHours.length > 0) await withDb((c) => c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]));
});

test("seven day columns, each with its capacity bar and readout; the header sums the week's spare time", async ({ page }) => {
  await openApp(page, "/upcoming");
  const week = page.locator('[data-week][data-band="wide"]');
  await expect(week).toBeVisible();
  // Seven days from today, today first and marked, and the "Not yet planned" rail beside them.
  await expect(week.locator(":scope > [data-column]")).toHaveCount(7);
  await expect(week.locator(":scope > [data-column]").first()).toHaveAttribute("data-column", me.today);
  await expect(column(page, me.today).locator("header")).toContainText("today");
  await expect(week.locator("[data-rail]")).toBeVisible();
  for (let i = 0; i < 7; i++) {
    const iso = isoPlus(me.today, i);
    await expect(columnReadout(page, iso)).toHaveText(READOUT);
    await expect(column(page, iso).locator("header [data-bar]")).toHaveCount(1);
  }
  // Every day has working hours here, so every bar is drawn rather than greyed.
  await expect(week.locator('[data-bar="off"]')).toHaveCount(0);

  // "Xh Ym spare this week": the spare days' readouts added up (an over day adds nothing), read in one go so
  // today's clock-driven figure and the total come from the same render.
  await expect(page.locator("main p > span.num")).toHaveText(/^((\d+h)?( ?\d+m)?) spare this week$/);
  await expect
    .poll(async () => {
      const { line, readouts } = await page.evaluate(() => ({
        line: document.querySelector("main p > span.num")?.textContent ?? "",
        readouts: [...document.querySelectorAll("[data-week] [data-day]:not([data-evening]) header > span")].map((s) => s.textContent ?? ""),
      }));
      const spare = readouts.filter((t) => /spare$/.test(t)).reduce((sum, t) => sum + minutes(t), 0);
      return minutes(line.replace(/ this week$/, "")) - spare;
    })
    .toBe(0);
});

test("← and → move the selected task a day; both days' readouts follow, and ⌘Z puts it back", async ({ page }) => {
  await openApp(page, "/upcoming");
  const [from, to] = [isoPlus(me.today, 2), isoPlus(me.today, 3)];
  const row = (iso: string) => column(page, iso).getByRole("listitem").filter({ hasText: keyed });
  await expect(row(from)).toBeVisible();
  await settled(page, from, to);
  const before = { from: await readValue(page, from), to: await readValue(page, to) };

  // The title selects the row and opens the detail; Escape closes it and the selection stays.
  await row(from).getByRole("button", { name: keyed, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(row(from)).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("ArrowRight");
  await expect(row(to)).toBeVisible();
  await expect(row(from)).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date", [keyed, to])).not.toBeNull();
  await expect.poll(() => readValue(page, from)).toBe(before.from + 60);
  await expect.poll(() => readValue(page, to)).toBe(before.to - 60);

  await page.keyboard.press("ArrowLeft");
  await expect(row(from)).toBeVisible();
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date", [keyed, from])).not.toBeNull();
  await expect.poll(() => readValue(page, from)).toBe(before.from);
  await expect.poll(() => readValue(page, to)).toBe(before.to);

  // Each move is one undo: ⌘Z takes back the last (←), so the task is on the later day again.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(row(to)).toBeVisible();
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date", [keyed, to])).not.toBeNull();
  await expect.poll(() => readValue(page, to)).toBe(before.to - 60);
});

test("a task dragged to another day's column lands there; both days' readouts follow", async ({ page }) => {
  await openApp(page, "/upcoming");
  const [from, to] = [isoPlus(me.today, 4), isoPlus(me.today, 5)];
  const row = (iso: string) => column(page, iso).getByRole("listitem").filter({ hasText: dragged });
  await expect(row(from)).toBeVisible();
  await settled(page, from, to);
  const before = { from: await readValue(page, from), to: await readValue(page, to) };

  // Onto the day's heading: the day itself takes the drop, not a row in it.
  await row(from).dragTo(column(page, to).locator("header"));
  await expect(row(to)).toBeVisible();
  await expect(row(from)).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date", [dragged, to])).not.toBeNull();
  await expect.poll(() => readValue(page, from)).toBe(before.from + 45);
  await expect.poll(() => readValue(page, to)).toBe(before.to - 45);
});

test("a later day's row action brings the task into the week; the day it lands on counts it", async ({ page }) => {
  await openApp(page, "/upcoming");
  const [from, to] = [isoPlus(me.today, 9), isoPlus(me.today, 1)];
  // Past the seven columns the agenda goes on by day, each heading with its compact readout out to day 14.
  const laterDay = page.locator(`[data-day="${from}"]`);
  const row = laterDay.getByRole("listitem").filter({ hasText: later });
  await expect(row).toBeVisible();
  await expect(laterDay.locator("h3 > span").filter({ hasText: READOUT })).toHaveCount(1);
  await settled(page, to);
  const before = await readValue(page, to);

  await row.hover();
  await row.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(column(page, to).getByRole("listitem").filter({ hasText: later })).toBeVisible();
  await expect(laterDay.getByRole("listitem").filter({ hasText: later })).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date", [later, to])).not.toBeNull();
  await expect.poll(() => readValue(page, to)).toBe(before - 25);
});

test("a deadline lists the task in its day's Due group; a task due on its own day is listed once", async ({ page }) => {
  await openApp(page, "/upcoming");
  const day = column(page, isoPlus(me.today, 3));
  const dueList = day.locator("p", { hasText: /^Due$/ }).locator("xpath=following-sibling::ul[1]");
  await expect(dueList.getByRole("listitem").filter({ hasText: due })).toBeVisible();
  // Planned for the day it is due: a row of the day, not a second listing under Due.
  await expect(day.getByRole("listitem").filter({ hasText: dueSameDay })).toHaveCount(1);
  await expect(dueList.getByRole("listitem").filter({ hasText: dueSameDay })).toHaveCount(0);
  // The rest of the week has no Due entry for it.
  for (const offset of [0, 1, 2, 4, 5, 6]) await expect(column(page, isoPlus(me.today, offset)).getByRole("listitem").filter({ hasText: due })).toHaveCount(0);
});

test("[ and ] step the week, never before this one; T comes back", async ({ page }) => {
  await openApp(page, "/upcoming");
  const first = page.locator("[data-week] > [data-column]").first();
  const total = page.locator("main p > span.num");
  await expect(first).toHaveAttribute("data-column", me.today);
  await expect(page.getByRole("button", { name: "Previous week" })).toBeDisabled();

  await page.keyboard.press("[");
  await expect(first).toHaveAttribute("data-column", me.today);
  await page.keyboard.press("]");
  await expect(first).toHaveAttribute("data-column", isoPlus(me.today, 7));
  await expect(total).toHaveText(/that week$/);
  await expect(page.getByRole("button", { name: "this week" })).toBeVisible();
  await page.keyboard.press("]");
  await expect(first).toHaveAttribute("data-column", isoPlus(me.today, 14));
  await page.keyboard.press("[");
  await expect(first).toHaveAttribute("data-column", isoPlus(me.today, 7));

  // With nothing selected, T is "back to this week".
  await page.keyboard.press("t");
  await expect(first).toHaveAttribute("data-column", me.today);
  await expect(total).toHaveText(/this week$/);
  await expect(page.getByRole("button", { name: "this week" })).toHaveCount(0);
  await page.keyboard.press("[");
  await expect(first).toHaveAttribute("data-column", me.today);
});
