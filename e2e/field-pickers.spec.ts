// The detail's field pickers from the keyboard (SCREENS.md §10, §12, §24):
// with a task selected, D opens the Do popover with its "In words" field
// focused ("fri 3pm" sets the day and the time), ⇧D Deadline, ⇧S Starts, E
// Estimate and R Repeat open theirs, and the palette's "Set start date" does
// what ⇧S does; Esc closes the popover first, then the panel. With two rows
// ticked, E opens one picker for both and one ⌘Z takes both back. A deadline
// before the do-date says so, and "Do it by then" moves the day.
//
// The tasks live in a project of their own, so the list holds only them
// however crowded the account is. Typed words are read against the calendar
// day in the account's zone (the app's Today waits for the rollover hour).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

const keyed = uniqueTitle("pick keys");
const bulkOne = uniqueTitle("pick bulk one");
const bulkTwo = uniqueTitle("pick bulk two");
const early = uniqueTitle("pick due early");
const projectName = uniqueTitle("pickers");

let me: DevAccount;
/** The calendar date in the account's zone: what typed words like "today" mean. */
let calendarToday = "";
let projectId = "";

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    calendarToday = (await c.query<{ d: string }>("select timezone($1, now())::date::text as d", [me.timezone])).rows[0].d;
    projectId = (await c.query<{ id: string }>("insert into public.projects (id, space_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, 'active', 'y0000000000000000000000051') returning id", [me.sid, projectName])).rows[0].id;
    const seed: [string, number | null, string | null, string | null, string][] = [
      [keyed, null, null, null, "a0"],
      [bulkOne, 15, null, null, "a1"],
      [bulkTwo, 20, null, null, "a2"],
      // Due the day after tomorrow, planned for three days later: due before you plan to do it.
      [early, 30, isoPlus(me.today, 5), isoPlus(me.today, 2), "a3"],
    ];
    for (const [title, estimate, doDate, deadline, key] of seed) {
      await c.query(
        `insert into public.tasks (id, space_id, project_id, title, state, priority, estimate_min, do_date, deadline, sort_key)
         values (gen_random_uuid(), $1, $2, $3, 'active', 0, $4, $5::date, $6::date, $7)`,
        [me.sid, projectId, title, estimate, doDate, deadline, key],
      );
    }
  });
});

test.afterAll(async () => {
  // The tasks go in the global teardown; the project is this spec's own.
  if (projectId) await withDb((c) => c.query("delete from public.projects where id = $1", [projectId]));
});

const TASK = "select t.* from public.tasks t where t.title = $1";

/** Selects a row the way a person does: its title opens the detail, Esc closes it and the selection stays. */
async function select(page: Page, title: string) {
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: title, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-current", "true");
  return row;
}

test("D, ⇧D, ⇧S, E and R open their pickers focused; 'fri 3pm' sets the day and time; Esc closes the popover, then the panel", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  await select(page, keyed);
  const panel = page.getByRole("complementary", { name: "Task" });

  // D: the detail opens on this task with the Do popover open and its typed field focused.
  await page.keyboard.press("d");
  await expect(panel.getByRole("textbox", { name: "Title" })).toHaveValue(keyed);
  const doPicker = page.getByRole("dialog", { name: "Do" });
  const words = doPicker.getByRole("textbox", { name: "In words" });
  await expect(words).toBeFocused();
  await words.pressSequentially("fri 3pm");
  // The day it resolves to shows as it is typed; Enter applies it and closes the popover.
  await expect(doPicker).toContainText("15:00");
  await words.press("Enter");
  await expect(doPicker).toHaveCount(0);
  expect(
    await waitForRow(`${TASK} and t.do_time = '15:00' and extract(isodow from t.do_date) = 5 and t.do_date between $2::date and $2::date + 7`, [keyed, calendarToday]),
  ).not.toBeNull();
  await expect(panel.getByRole("button", { name: /^Do/ })).toContainText("15:00");

  // ⇧D: the Deadline popover. Words that are not a date say so and change nothing.
  await page.keyboard.press("Shift+D");
  const deadline = page.getByRole("dialog", { name: "Deadline" });
  await expect(deadline.getByRole("textbox", { name: "In words" })).toBeFocused();
  await page.keyboard.type("blorp");
  await page.keyboard.press("Enter");
  await expect(deadline.getByText("Didn't catch that")).toBeVisible();
  // Esc closes the popover and leaves the panel open…
  await page.keyboard.press("Escape");
  await expect(deadline).toHaveCount(0);
  await expect(panel).toBeVisible();
  // …and a second Esc closes the panel.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  expect(await waitForRow(`${TASK} and t.deadline is null`, [keyed])).not.toBeNull();

  // ⇧S from the list (it no longer types an "S" into quick-add): the Starts popover.
  await page.keyboard.press("Shift+S");
  const starts = page.getByRole("dialog", { name: "Starts" });
  await expect(starts.getByRole("textbox", { name: "In words" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Task", exact: true })).toHaveCount(0);
  await page.keyboard.type("today");
  await page.keyboard.press("Enter");
  await expect(starts).toHaveCount(0);
  expect(await waitForRow(`${TASK} and t.start_date = $2::date`, [keyed, calendarToday])).not.toBeNull();

  // E: the Estimate popover with the minutes field focused.
  await page.keyboard.press("e");
  const estimate = page.getByRole("dialog", { name: "Estimate" });
  await expect(estimate.getByRole("spinbutton", { name: "Minutes" })).toBeFocused();
  await page.keyboard.type("25");
  await page.keyboard.press("Enter");
  await expect(estimate).toHaveCount(0);
  expect(await waitForRow(`${TASK} and t.estimate_min = 25`, [keyed])).not.toBeNull();

  // R: the Repeat popover with its rule field focused.
  await page.keyboard.press("r");
  const repeat = page.getByRole("dialog", { name: "Repeat" });
  await expect(repeat.getByRole("textbox", { name: "Repeat" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(repeat).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // The palette names the same picker and opens it.
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox", { name: "Search or run a command" }).fill("Set start date");
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Starts" }).getByRole("textbox", { name: "In words" })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("with two rows ticked, E sets both estimates in one write, and one ⌘Z takes both back", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const one = await select(page, bulkOne);
  await page.keyboard.press("x");
  await expect(one).toHaveAttribute("data-ticked", "true");
  const two = page.getByRole("listitem").filter({ hasText: bulkTwo });
  await two.getByRole("checkbox", { name: `Select ${bulkTwo}` }).check();
  await expect(two).toHaveAttribute("data-ticked", "true");
  // The keys are the page's, not the focused checkbox's.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.press("e");
  const sheet = page.getByRole("dialog", { name: "Set estimate for 2 tasks" });
  await expect(sheet).toBeVisible();
  // Never the detail: one picker for both rows.
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  const minutes = sheet.getByRole("spinbutton", { name: "Minutes" });
  await minutes.fill("40");
  await minutes.press("Enter");
  await expect(sheet).toHaveCount(0);
  const BOTH = (a: number, b: number) =>
    waitForRow("select 1 as ok from public.tasks where (title = $1 and estimate_min = $3) or (title = $2 and estimate_min = $4) having count(*) = 2", [bulkOne, bulkTwo, a, b]);
  expect(await BOTH(40, 40)).not.toBeNull();
  await expect(one).toContainText("40m");
  await expect(two).toContainText("40m");

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ControlOrMeta+z");
  expect(await BOTH(15, 20)).not.toBeNull();
  await expect(one).toContainText("15m");
  await expect(two).toContainText("20m");
});

test("a deadline before the do-date says so in the detail, and Do it by then moves the day to the deadline", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const row = page.getByRole("listitem").filter({ hasText: early });
  await row.getByRole("button", { name: early, exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Task" });
  const hint = panel.getByText("Due before you plan to do it");
  await expect(hint).toBeVisible();
  await panel.getByRole("button", { name: "Do it by then" }).click();
  expect(await waitForRow(`${TASK} and t.do_date = $2::date and t.deadline = $2::date`, [early, isoPlus(me.today, 2)])).not.toBeNull();
  // The dates no longer disagree, so the note goes.
  await expect(hint).toHaveCount(0);
});
