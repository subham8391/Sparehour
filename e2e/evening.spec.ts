// This Evening's own budget (PRODUCT_SPEC.md §9.1, SCREENS.md §2.5 as built 2026-10-07): it runs from the end of the
// day's last work segment (the evening start on a day without hours) to Settings › Working hours › "Evening ends
// at", and past it a quiet "That's a full evening." sits under the header, which stays "THIS EVENING 2 · 1h 30m".
// While a row is dragged, an empty This Evening shows where to drop it, and the drop sets the evening flag.
//
// So the budget is known whatever the account's week looks like, the account's own working hours for today's
// weekday are taken off for the length of the spec (a soft delete, put back exactly in afterAll), which makes the
// evening start at the account's evening start. The two settings it reads are put back exactly too. The account's
// other tasks due today or earlier are stood aside (they start tomorrow), so This Evening holds only this spec's
// rows however crowded the account is.
import { expect, test } from "./fixtures";
import {
  devAccount,
  hoursBack,
  hoursOff,
  putBack,
  removeOwn,
  restoreSettings,
  saveSettings,
  standAside,
  waitForRow,
  withDb,
  workWeekday,
  type DevAccount,
  type HoursOff,
  type SavedSettings,
  type StoodAside,
} from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";
import type { Page } from "@playwright/test";

const dragged = uniqueTitle("evening drag");
const long = uniqueTitle("evening long");
const short = uniqueTitle("evening short");

let me: DevAccount;
let saved: SavedSettings | null = null;
let off: HoursOff[] = [];
let aside: StoodAside[] = [];
/** The evening start, in minutes past midnight: where the budget begins on a day without working hours. */
let startMin = 0;

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    saved = await saveSettings(c, me, ["evening_starts_at", "evening_ends_at"]);
    const [h, m] = (saved?.evening_starts_at ?? "18:00").split(":").map(Number);
    startMin = h * 60 + m;
    off = await hoursOff(c, me, workWeekday(me.today));
    aside = await standAside(c, me);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await removeOwn(c, [dragged, long, short]);
    await putBack(c, aside);
    await hoursBack(c, off);
    await restoreSettings(c, me, saved);
  });
});

/** Settings › Working hours › Evening ends at, saved at once; then back to Today by the sidebar (no reload). */
async function eveningEndsAt(page: Page, time: string) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: /^Working hours/ }).click();
  const field = page.getByLabel("Evening ends at");
  await field.fill(time);
  expect(await waitForRow("select 1 from public.user_settings where user_id = $1 and evening_ends_at = $2::time", [me.uid, time])).not.toBeNull();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Today/ }).click();
  await expect(page).toHaveURL(/\/today/);
}

test("while a row is dragged an empty This Evening shows where to drop it, and the drop moves the task into the evening", async ({ page }) => {
  // One task for today, none for the evening.
  await withDb(async (c) => {
    await removeOwn(c, [dragged, long, short]);
    await c.query(
      `insert into public.tasks (id, space_id, title, state, priority, do_date, evening, estimate_min, sort_key, day_sort_key)
       values (gen_random_uuid(), $1, $2, 'active', 0, $3::date, false, 20, 'y0000000000000000000000061', 'y0000000000000000000000061')`,
      [me.sid, dragged, me.today],
    );
  });
  await openApp(page, "/today");
  const row = page.getByRole("row").filter({ hasText: dragged });
  await expect(row).toBeVisible();
  const drop = page.getByTestId("section-drop").filter({ hasText: "Drop here for this evening" });
  await expect(drop).toHaveCount(0);

  const from = (await row.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 4, from.y + from.height / 2 + 24, { steps: 6 });
  await expect(drop).toBeVisible();
  const to = (await drop.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();

  expect(await waitForRow("select 1 from public.tasks where title = $1 and evening and do_date = $2::date", [dragged, me.today])).not.toBeNull();
  await expect(page.getByRole("heading", { name: /^This evening/ })).toHaveText(/This evening\s*1 · 20m/);
  await expect(drop).toHaveCount(0);
});

test("the evening's budget runs from the evening start to the cut-off: under it no line, past it 'That's a full evening.'", async ({ page }) => {
  test.skip(startMin + 120 >= 24 * 60, "the account's evening starts too late for a two-hour evening");
  await withDb(async (c) => {
    await removeOwn(c, [dragged, long, short]);
    for (const [title, estimate, key] of [
      [long, 60, "y0000000000000000000000062"],
      [short, 30, "y0000000000000000000000063"],
    ] as const) {
      await c.query(
        `insert into public.tasks (id, space_id, title, state, priority, do_date, evening, estimate_min, sort_key, day_sort_key)
         values (gen_random_uuid(), $1, $2, 'active', 0, $3::date, true, $4, $5, $5)`,
        [me.sid, title, me.today, estimate, key],
      );
    }
  });
  await openApp(page, "/today");
  const header = page.getByRole("heading", { name: /^This evening/ });
  const full = page.getByText("That’s a full evening.");

  // Two hours of evening for an hour and a half planned: no line.
  await eveningEndsAt(page, hhmm(startMin + 120));
  await expect(header).toHaveText(/This evening\s*2 · 1h 30m/);
  await expect(page.getByRole("row").filter({ hasText: long })).toBeVisible();
  await expect(full).toHaveCount(0);

  // One hour: full. The header keeps its own words; the line is quiet, under it.
  await eveningEndsAt(page, hhmm(startMin + 60));
  await expect(full).toBeVisible();
  await expect(header).toHaveText(/This evening\s*2 · 1h 30m/);
});
