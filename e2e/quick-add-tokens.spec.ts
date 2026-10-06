// Quick-add's line (PRODUCT_SPEC.md §5.1–§5.4, SCREENS.md §11): `evening`
// alone is this evening, a bare time that has passed is tomorrow; `@` offers
// the tags that fit (Tab completes) or "Create @name", made once; a `#name`
// two projects share asks which, by area, and a pick files it; Backspace right
// after a token, or a chip's remove control, turns it back into title words.
//
// The words are read against the calendar day in the account's zone, and the
// app's Today follows the day rollover, so before the rollover hour the two
// differ: the tests that land on Today step aside then. Everything they make
// is "E2E …" (tasks, areas, projects) or "e2e…" (tags): afterAll removes the
// areas and projects, the global teardown the rest.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

const run = Date.now().toString(36);
/** A tag the account already has, and the prefix typed to find it: nothing else in the account starts with it. */
const knownTag = `e2e${run}calls`;
const newTag = `e2e${run}errand`;
const projectName = `E2E Site ${run}`;
const areas = { work: `E2E Work ${run}`, home: `E2E Home ${run}` };

let me: DevAccount;
const ids = { work: "", home: "", siteWork: "", siteHome: "" };

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    await c.query("insert into public.tags (id, space_id, name) values (gen_random_uuid(), $1, $2)", [me.sid, knownTag]);
    // One project name in two areas: the collision §5.4 is about.
    for (const key of ["work", "home"] as const) {
      ids[key] = (await c.query<{ id: string }>("insert into public.areas (id, space_id, name, sort_key) values (gen_random_uuid(), $1, $2, 'y0000000000000000000000051') returning id", [me.sid, areas[key]])).rows[0].id;
    }
    const project = (areaId: string) =>
      c.query<{ id: string }>("insert into public.projects (id, space_id, area_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, $3, 'active', 'y0000000000000000000000051') returning id", [me.sid, areaId, projectName]);
    ids.siteWork = (await project(ids.work)).rows[0].id;
    ids.siteHome = (await project(ids.home)).rows[0].id;
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    // The tasks filed into them go in the global teardown (their project is set null meanwhile).
    await c.query("delete from public.projects where id = any($1::uuid[])", [[ids.siteWork, ids.siteHome].filter(Boolean)]);
    await c.query("delete from public.areas where id = any($1::uuid[])", [[ids.work, ids.home].filter(Boolean)]);
  });
});

/** Opens quick-add with `Q`: the line, the strip under it (the line's description), and the sheet. */
async function openSheet(page: Page) {
  await page.keyboard.press("q");
  const box = page.getByRole("textbox", { name: "Task", exact: true });
  await expect(box).toBeFocused();
  const stripId = await box.getAttribute("aria-describedby");
  return { box, strip: page.locator(`[id="${stripId}"]`), sheet: page.getByRole("dialog", { name: "Add a task" }) };
}

/** The sheet's own notice for this save (brain-dump mode keeps the sheet open, so earlier notices are replaced). */
const added = (sheet: Locator, title: string) => sheet.getByRole("status").filter({ hasText: `Added “${title}` });

/** "7am", "12pm", "3pm": an hour as people type it. */
function typedHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  return h === 12 ? "12pm" : `${h - 12}pm`;
}

const TASK = "select t.* from public.tasks t where t.title = $1 and t.deleted_at is null";

test("'evening' alone lands in This evening today; a bare time that has passed lands tomorrow, one still ahead today", async ({ page }) => {
  test.skip(me.minute < me.rollover * 60, "before the day rollover the app's Today is yesterday, not the day the words are read against");
  // The clock moves on while the test runs; near midnight "tomorrow" would change under it.
  test.skip(me.minute > 23 * 60 - 5, "too close to midnight");
  await openApp(page, "/today");
  const { box, strip, sheet } = await openSheet(page);

  const evening = uniqueTitle("call mum");
  await box.fill(`${evening} evening`);
  await expect(strip).toContainText("Today, evening");
  await expect(strip).toContainText(/→\s*Today$/);
  await box.press("Enter");
  await expect(added(sheet, evening)).toBeVisible();
  expect(await waitForRow(`${TASK} and t.do_date = $2::date and t.evening and t.do_time is null and t.state = 'active'`, [evening, me.today])).not.toBeNull();

  // An hour that is already over (the account's clock, read in beforeAll: it only moves on) is tomorrow's.
  const passedHour = Math.floor((me.minute - 1) / 60);
  const passed = uniqueTitle("stretch passed");
  await box.fill(`${passed} ${typedHour(passedHour)}`);
  const hh = String(passedHour).padStart(2, "0");
  await expect(strip).toContainText(`Tomorrow ${hh}:00`);
  await expect(strip).toContainText(/→\s*Upcoming$/);
  await box.press("Enter");
  await expect(added(sheet, passed)).toBeVisible();
  expect(await waitForRow(`${TASK} and t.do_date = $2::date and t.do_time = $3::time`, [passed, isoPlus(me.today, 1), `${hh}:00`])).not.toBeNull();

  // One still ahead stays today (unless the day has no later hour to type).
  const aheadHour = Math.floor(me.minute / 60) + 2;
  if (aheadHour <= 23) {
    const ahead = uniqueTitle("stretch ahead");
    await box.fill(`${ahead} ${typedHour(aheadHour)}`);
    await expect(strip).toContainText(`Today ${String(aheadHour).padStart(2, "0")}:00`);
    await box.press("Enter");
    await expect(added(sheet, ahead)).toBeVisible();
    expect(await waitForRow(`${TASK} and t.do_date = $2::date`, [ahead, me.today])).not.toBeNull();
  }

  await box.press("Escape");
  await expect(box).toHaveCount(0);
  // Today's own list draws it under "This evening", not in the day's list.
  const thisEvening = page.locator("section").filter({ has: page.getByRole("heading", { name: /^This evening/ }) });
  await expect(thisEvening.getByRole("listitem").filter({ hasText: evening })).toBeVisible();
});

test("@ offers the tags that fit and Tab completes one; an unknown name offers Create, and the tag is made once", async ({ page }) => {
  await openApp(page, "/inbox");
  const { box, strip, sheet } = await openSheet(page);
  const tags = sheet.getByRole("group", { name: "Tags" });

  // Typing part of a name: the tag that starts with it is offered, and Tab finishes the token.
  const withKnown = uniqueTitle("tag known");
  await box.fill(`${withKnown} @${knownTag.slice(0, -3)}`);
  await expect(tags.getByRole("button", { name: `@${knownTag}`, exact: true })).toBeVisible();
  await box.press("Tab");
  await expect(box).toBeFocused();
  await expect(box).toHaveValue(`${withKnown} @${knownTag} `);
  await expect(strip).toContainText(`@${knownTag}`);
  await expect(strip).not.toContainText("new tag");
  await box.press("Enter");
  await expect(added(sheet, withKnown)).toBeVisible();
  const TAGGED = `select tt.task_id from public.task_tags tt join public.tags g on g.id = tt.tag_id join public.tasks t on t.id = tt.task_id
    where t.title = $1 and g.name = $2 and tt.deleted_at is null and g.deleted_at is null`;
  expect(await waitForRow(TAGGED, [withKnown, knownTag])).not.toBeNull();
  // The existing tag was reused, not made again.
  const count = (name: string) =>
    withDb(async (c) => (await c.query<{ n: number }>("select count(*)::int as n from public.tags where space_id = $1 and lower(name) = lower($2) and deleted_at is null", [me.sid, name])).rows[0].n);
  expect(await count(knownTag)).toBe(1);

  // A name no tag has: "Create @name" comes first, the strip says it is new, and saving makes it.
  const withNew = uniqueTitle("tag new");
  await box.fill(`${withNew} @${newTag}`);
  await expect(tags.getByRole("button").first()).toHaveText(new RegExp(`^Create @${newTag}`));
  await expect(strip).toContainText(`new tag @${newTag}`);
  await box.press("Enter");
  await expect(added(sheet, withNew)).toBeVisible();
  expect(await waitForRow(TAGGED, [withNew, newTag])).not.toBeNull();

  // Typed again, in another case: now it is a tag like any other, and the same row is used.
  const again = uniqueTitle("tag again");
  await box.fill(`${again} @${newTag.toUpperCase()}`);
  await expect(strip).not.toContainText("new tag");
  await box.press("Enter");
  await expect(added(sheet, again)).toBeVisible();
  expect(await waitForRow(TAGGED, [again, newTag])).not.toBeNull();
  expect(await count(newTag)).toBe(1);
  await box.press("Escape");
});

test("a #name two projects share asks which, by area, offers no Create, and the pick files the task there", async ({ page }) => {
  await openApp(page, "/inbox");
  const { box, strip, sheet } = await openSheet(page);
  const projects = sheet.getByRole("group", { name: "Projects" });
  const token = `#"${projectName}"`;

  const picked = uniqueTitle("site picked");
  await box.fill(`${picked} ${token}`);
  // Files nowhere yet: the strip asks, and the suggestions tell the two apart by area.
  await expect(strip).toContainText(`${projectName}?`);
  await expect(strip).toContainText(/→\s*Inbox$/);
  await expect(projects.getByRole("button", { name: `${projectName} · ${areas.work}`, exact: true })).toBeVisible();
  const home = projects.getByRole("button", { name: `${projectName} · ${areas.home}`, exact: true });
  await expect(home).toBeVisible();
  await expect(projects.getByRole("button", { name: /Create/ })).toHaveCount(0);

  await home.click();
  await expect(box).toBeFocused();
  await expect(strip).toContainText(`${projectName} · ${areas.home}`);
  await expect(projects).toHaveCount(0);
  await box.press("Enter");
  await expect(added(sheet, picked)).toContainText(`to ${projectName}`);
  expect(await waitForRow(`${TASK} and t.project_id = $2`, [picked, ids.siteHome])).not.toBeNull();

  // Saved without a pick, it is filed nowhere and nothing is created: the name stays in the title.
  const unpicked = uniqueTitle("site unpicked");
  await box.fill(`${unpicked} ${token}`);
  await expect(strip).toContainText(`${projectName}?`);
  await box.press("Enter");
  await expect(sheet.getByRole("status").filter({ hasText: unpicked })).toContainText("fits more than one project");
  expect(await waitForRow(`select t.* from public.tasks t where t.title like $1 and t.project_id is null and t.state = 'inbox'`, [`${unpicked}%${projectName}%`])).not.toBeNull();
  const named = await withDb(async (c) => (await c.query<{ n: number }>("select count(*)::int as n from public.projects where name = $1 and deleted_at is null", [projectName])).rows[0].n);
  expect(named).toBe(2);
  await box.press("Escape");
});

test("Backspace right after a token, or a chip's remove control, keeps its words in the title", async ({ page }) => {
  await openApp(page, "/inbox");
  const { box, strip, sheet } = await openSheet(page);
  const title = uniqueTitle("chip removal");
  const typed = `${title} about fri ~30m`;
  await box.fill(typed);
  await expect(strip.getByRole("button", { name: "Remove “30m”" })).toBeVisible();
  const removers = strip.getByRole("button", { name: /^Remove “/ });
  await expect(removers).toHaveCount(2);

  // The caret sits right after "~30m": the first Backspace un-parses it and deletes nothing.
  await box.press("End");
  await box.press("Backspace");
  await expect(box).toHaveValue(typed);
  await expect(strip.getByRole("button", { name: "Remove “30m”" })).toHaveCount(0);
  await expect(removers).toHaveCount(1);

  // The day's chip goes by its own control; then nothing is left to file, and the task is the Inbox's.
  await removers.first().click();
  await expect(removers).toHaveCount(0);
  await expect(strip).toContainText(/→\s*Inbox$/);
  // Typing on leaves the un-parsed words as they are.
  await box.press("End");
  await box.pressSequentially(" ok");
  await expect(removers).toHaveCount(0);
  await box.press("Enter");
  await expect(added(sheet, `${typed} ok`)).toBeVisible();
  expect(await waitForRow(`${TASK} and t.do_date is null and t.estimate_min is null and t.state = 'inbox'`, [`${typed} ok`])).not.toBeNull();
  await box.press("Escape");
});

test("a deadline before the do-date is kept as typed, with a note", async ({ page }) => {
  test.skip(me.minute < me.rollover * 60, "before the day rollover the words are read against another day than the app's");
  await openApp(page, "/inbox");
  const { box, sheet } = await openSheet(page);
  const title = uniqueTitle("due early");
  await box.fill(`${title} in 3 days {tomorrow}`);
  await expect(sheet.getByText("Due before you plan to do it.")).toBeVisible();
  await box.press("Enter");
  await expect(added(sheet, title)).toBeVisible();
  expect(await waitForRow(`${TASK} and t.do_date = $2::date and t.deadline = $3::date`, [title, isoPlus(me.today, 3), isoPlus(me.today, 1)])).not.toBeNull();
  await box.press("Escape");
});
