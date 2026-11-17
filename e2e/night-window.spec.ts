// Today past midnight, before the day rolls over (DECISIONS.md, amendment 2026-11-17; CLAUDE.md "A day runs from its
// rollover hour"): the day that is ending reads as over, not as a morning with its working hours ahead, and `B`
// blocks the time it is, which is on the next date, instead of a time that has already gone.
//
// The hour is not waited for: for the length of the spec the dev account lives in a zone where it is 01:xx now
// (one without clock changes), and afterAll puts its own zone back exactly. Its today only ever moves back by this,
// never forward, so nothing is carried over early. Working hours cover every hour of every day meanwhile (extra
// rows, deleted in afterAll), so the next date has a timeline whatever day of the week it is.
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, isoPlus, removeOwn, restoreSettings, saveSettings, waitForRow, withDb, type DevAccount, type SavedSettings } from "./db";
import { clickTitle, DEV_USER, openApp, uniqueTitle } from "./helpers";
import { seedTask } from "./timeline-helpers";

/** A fixed-offset zone where the wall clock reads 01:xx at `now`. POSIX names run backwards: Etc/GMT+10 is UTC−10. */
function nightZone(now = new Date()): string {
  let offset = 1 - now.getUTCHours();
  if (offset < -12) offset += 24;
  return `Etc/GMT${offset <= 0 ? `+${-offset}` : `-${offset}`}`;
}

let me: DevAccount;
let saved: SavedSettings | null = null;
let addedHours: string[] = [];
const mine: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    const before = await devAccount(c, DEV_USER.email);
    saved = await saveSettings(c, before, ["timezone"]);
    await c.query("update public.user_settings set timezone = $2 where user_id = $1", [before.uid, nightZone()]);
    me = await devAccount(c, DEV_USER.email);
    addedHours = await addAllDayHours(c, me);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await removeOwn(c, mine);
    if (addedHours.length > 0) await c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]);
    await restoreSettings(c, me, saved);
  });
});

test("past midnight the day that is ending reads as over, and B blocks the time it is, on the next date", async ({ page }) => {
  // The account's clock is past midnight and short of its rollover hour: today is still the date before.
  expect(me.minute).toBeLessThan(me.rollover * 60);
  const title = uniqueTitle("night block");
  mine.push(title);
  await withDb((c) => seedTask(c, me, title, { estimate: 30 }));
  await openApp(page, "/today");
  // Its evening: not "Morning", with the whole working day drawn as still to come.
  await expect(page.getByText("Today · Evening", { exact: true })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: title });
  await clickTitle(row.getByRole("button", { name: title, exact: true }));
  await page.keyboard.press("Escape");
  await expect(row).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("b");

  // The toast names the time: this day's timeline has no such hour to draw the block on.
  await expect(page.getByRole("status").filter({ hasText: new RegExp(`Blocked “${title}” 0[12]:\\d\\d–0[12]:\\d\\d`) })).toBeVisible();
  const block = await waitForRow<{ day: string; off: number; len: number }>(
    `select (b.start_at at time zone s.timezone)::date::text as day, abs(extract(epoch from b.start_at - now()))::int as off,
            (extract(epoch from b.end_at - b.start_at) / 60)::int as len
       from public.time_blocks b join public.tasks t on t.id = b.task_id join public.user_settings s on s.user_id = b.user_id
      where t.title = $1 and b.deleted_at is null`,
    [title],
  );
  // On the next date, at now (snapped to five minutes; the page's clock ticks once a minute), for the estimate.
  expect(block?.day).toBe(isoPlus(me.today, 1));
  expect(block?.off).toBeLessThan(6 * 60);
  expect(block?.len).toBe(30);
  const drawn = page.getByTestId("timeline").getByRole("button", { name: new RegExp(`^Block: ${title}`) });
  await expect(drawn).toHaveCount(0);

  // The next date's timeline is where it is.
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${isoPlus(me.today, 1)}$`));
  await expect(drawn).toBeVisible();
});
