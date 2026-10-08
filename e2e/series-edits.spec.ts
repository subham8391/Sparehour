// Series edits on a repeating task (SCREENS.md §10 "Recurring"; SYSTEM_DESIGN.md
// §5.2): the detail's header says "Repeats every Thursday · next Thu 22"; a
// new Do date asks Just this once · Change the rule — once moves only this
// occurrence (a move exception, the rule untouched, and the series back on its
// rule after it), the rule moves to the new weekday and drops the one-off
// changes ahead, saying how many; Skip this occurrence moves on with no
// completion, and Undo puts it back; Pause repeats until… parks the task until
// a day, and Resume brings it back on its schedule. On a phone the question is
// two 44 px buttons in the Do sheet.
//
// The tasks live in a project of the spec's own, a week and more ahead, so no
// list of the account's (crowded in CI) is in the way and nothing lands on
// Today. afterAll removes the project, the tasks and their series' exceptions.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, removeOwn, seedKey, waitForRow, withDb, type DevAccount } from "./db";
import { clickTitle, DEV_USER, openApp, shortDay, uniqueTitle, weekday } from "./helpers";

test.describe.configure({ mode: "serial" });

const project = uniqueTitle("series project");
const once = uniqueTitle("series once");
const rule = uniqueTitle("series rule");
const paused = uniqueTitle("series pause");
const phone = uniqueTitle("series phone");
const own = [project, once, rule, paused, phone];

const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let me: DevAccount;
let projectId = "";
/** Each task's occurrence: eight days ahead, so it and the one after are named "Thu 22" in the header. */
let day = "";
/** The day a Do change moves it to: two days later, another weekday. */
let moved = "";

/** "Thu 22": how the header names a day from two days to four weeks ahead (series-controls shortDay). */
const near = (iso: string) => shortDay(iso).split(" ").slice(0, 2).join(" ");
const every = (iso: string) => `every ${NAMES[weekday(iso)]}`;

/** The detail: a pane beside the list on a desktop, a full-screen dialog on a phone. */
const panel = (page: Page) => page.getByRole("complementary", { name: "Task" }).or(page.getByRole("dialog", { name: "Task" }));
async function openTask(page: Page, title: string): Promise<Locator> {
  await clickTitle(page.getByRole("main").getByRole("row").filter({ hasText: title }).getByRole("button", { name: title, exact: true }));
  const p = panel(page);
  await expect(p.getByRole("textbox", { name: "Title" })).toHaveValue(title);
  return p;
}
/** The header line under the title. */
const repeatLine = (p: Locator) => p.locator("p").filter({ hasText: /^(Repeats|Paused until)/ });
/** Opens the Do field and types a day into it; a repeat then asks what the change means. */
async function moveDo(page: Page, p: Locator, iso: string): Promise<Locator> {
  await p.getByRole("button", { name: /^Do / }).click();
  const field = page.getByRole("dialog", { name: "Do" });
  await field.getByLabel("Day", { exact: true }).fill(iso);
  const ask = field.getByRole("group", { name: "This occurrence or the rule" });
  await expect(ask).toBeVisible();
  return ask;
}
const TASK = "select t.* from public.tasks t where t.title = $1";

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    day = isoPlus(me.today, 8);
    moved = isoPlus(day, 2);
    projectId = (
      await c.query<{ id: string }>(`insert into public.projects (id, space_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, 'active', $3) returning id`, [me.sid, project, seedKey("r1")])
    ).rows[0].id;
    for (const [i, title] of [once, rule, paused, phone].entries()) {
      await c.query(
        `insert into public.tasks (id, space_id, project_id, title, state, do_date, recurrence_rule, recurrence_mode, estimate_min, sort_key)
         values (gen_random_uuid(), $1, $2, $3, 'active', $4::date, $5, 'fixed', 15, $6)`,
        [me.sid, projectId, title, day, `FREQ=WEEKLY;BYDAY=${CODES[weekday(day)]}`, `a${i + 1}`],
      );
    }
    // A one-off change ahead on the series whose rule changes: the change drops it and says so.
    await c.query(
      `insert into public.recurrence_exceptions (id, space_id, series_id, occurrence_date, kind)
       select gen_random_uuid(), space_id, id, $2::date, 'skip' from public.tasks where title = $1`,
      [rule, isoPlus(day, 7)],
    );
  });
});

test.afterAll(async () => {
  await withDb((c) => removeOwn(c, own));
});

test("Just this once moves only this occurrence; Skip this occurrence moves on with no completion, back on the rule; Undo puts it back", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const p = await openTask(page, once);
  await expect(repeatLine(p)).toHaveText(`Repeats ${every(day)} · next ${near(isoPlus(day, 7))}`);

  const ask = await moveDo(page, p, moved);
  await expect(ask).toContainText(`Move to ${shortDay(moved)}: just this once, or change the rule?`);
  await expect(ask).toContainText(`Changing the rule makes it repeat ${every(moved)} from then.`);
  await ask.getByRole("button", { name: "Just this once" }).click();
  await expect(page.getByRole("dialog", { name: "Do" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: `Moved “${once}” to ${shortDay(moved)}, just this once` })).toBeVisible();
  // The rule is untouched: the occurrence after this one is still on its weekday.
  await expect(repeatLine(p)).toHaveText(`Repeats ${every(day)} · next ${near(isoPlus(day, 7))}`);
  const task = await waitForRow<{ id: string }>(`${TASK} and t.do_date = $2::date and t.recurrence_rule = $3`, [once, moved, `FREQ=WEEKLY;BYDAY=${CODES[weekday(day)]}`]);
  expect(task).not.toBeNull();
  const MOVE = "select 1 from public.recurrence_exceptions where series_id = $1 and occurrence_date = $2::date and kind = 'move' and moved_to = $3::date and deleted_at is null";
  expect(await waitForRow(MOVE, [task!.id, day, moved])).not.toBeNull();

  // Skip: on to the next occurrence of the rule — its weekday, not the moved day's — and nothing is completed.
  await p.getByRole("button", { name: "More actions" }).click();
  await p.getByRole("menuitem", { name: "Skip this occurrence" }).click();
  const skipped = page.getByRole("status").filter({ hasText: `Skipped “${once}” this time · next ${shortDay(isoPlus(day, 7))}` });
  await expect(skipped).toBeVisible();
  expect(await waitForRow(`${TASK} and t.do_date = $2::date and t.state = 'active' and t.completed_at is null`, [once, isoPlus(day, 7)])).not.toBeNull();
  expect(await waitForRow("select 1 from public.recurrence_exceptions where series_id = $1 and occurrence_date = $2::date and kind = 'skip' and deleted_at is null", [task!.id, day])).not.toBeNull();
  expect(await withDb(async (c) => (await c.query("select 1 from public.task_completions where task_id = $1", [task!.id])).rowCount)).toBe(0);

  // One Undo: back on the moved day, with the move it had.
  await skipped.getByRole("button", { name: "Undo" }).click();
  expect(await waitForRow(`${TASK} and t.do_date = $2::date`, [once, moved])).not.toBeNull();
  expect(await waitForRow(MOVE, [task!.id, day, moved])).not.toBeNull();
});

test("Change the rule moves the series to the new weekday and drops the one-off changes ahead, naming how many", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const p = await openTask(page, rule);
  const ask = await moveDo(page, p, moved);
  await ask.getByRole("button", { name: "Change the rule" }).click();
  await expect(page.getByRole("status").filter({ hasText: `“${rule}” now repeats ${every(moved)} · dropped 1 one-off change` })).toBeVisible();
  await expect(repeatLine(p)).toHaveText(`Repeats ${every(moved)} · next ${near(isoPlus(moved, 7))}`);
  const task = await waitForRow<{ id: string }>(`${TASK} and t.do_date = $2::date and t.recurrence_rule = $3`, [rule, moved, `FREQ=WEEKLY;BYDAY=${CODES[weekday(moved)]}`]);
  expect(task).not.toBeNull();
  expect(await waitForRow("select 1 from public.recurrence_exceptions where series_id = $1 and deleted_at is not null having count(*) = 1", [task!.id])).not.toBeNull();
  expect(await waitForRow("select 1 from public.recurrence_exceptions where series_id = $1 and deleted_at is null having count(*) = 0", [task!.id])).not.toBeNull();
});

test("Pause repeats until… parks the task until then; Resume brings it back on its schedule", async ({ page }) => {
  const until = isoPlus(me.today, 14);
  // The first day of the schedule on or after the pause's end, and on or after today once resumed.
  const backAfterPause = isoPlus(day, 7);
  const backOnResume = isoPlus(day, -7);
  await openApp(page, `/project/${projectId}`);
  const p = await openTask(page, paused);
  await p.getByRole("button", { name: "More actions" }).click();
  await p.getByRole("menuitem", { name: "Pause repeats until…" }).click();
  const picker = page.getByRole("dialog", { name: "Repeat" }).getByRole("group", { name: "Pause repeats until" });
  await picker.getByRole("button", { name: "In two weeks" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Paused “${paused}” until ${shortDay(until)}` })).toBeVisible();
  await expect(repeatLine(p)).toHaveText(new RegExp(`^Paused until ${shortDay(until)}\\s*Resume$`));
  expect(await waitForRow(`${TASK} and t.recurrence_paused_until = $2::date and t.do_date = $3::date`, [paused, until, backAfterPause])).not.toBeNull();
  // A paused repeat offers Resume, not another pause or a skip.
  await p.getByRole("button", { name: "More actions" }).click();
  await expect(p.getByRole("menuitem", { name: "Skip this occurrence" })).toHaveCount(0);
  await expect(p.getByRole("menuitem", { name: "Pause repeats until…" })).toHaveCount(0);
  await expect(p.getByRole("menuitem", { name: "Resume repeats" })).toBeVisible();
  await page.keyboard.press("Escape");

  await repeatLine(p).getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Resumed “${paused}”` })).toBeVisible();
  await expect(repeatLine(p)).toHaveText(new RegExp(`^Repeats ${every(day)} · next `));
  expect(await waitForRow(`${TASK} and t.recurrence_paused_until is null and t.do_date = $2::date`, [paused, backOnResume])).not.toBeNull();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true });

  test("the question sits in the Do sheet as two 44 px buttons", async ({ page }) => {
    await openApp(page, `/project/${projectId}`);
    const p = await openTask(page, phone);
    const ask = await moveDo(page, p, moved);
    for (const name of ["Just this once", "Change the rule"]) {
      const button = ask.getByRole("button", { name });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await ask.getByRole("button", { name: "Just this once" }).click();
    expect(await waitForRow(`${TASK} and t.do_date = $2::date`, [phone, moved])).not.toBeNull();
  });
});
