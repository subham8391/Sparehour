// Clear the slate and its archive (PRODUCT_SPEC.md §6, §8.5; SCREENS.md §18):
// the confirmation offers Today only and Today + backlog with the exact count
// of each, archives one batch, and one Undo brings it all back; it opens from
// Today's ⋯, the Carried over header and Settings › Data; Settings › Data ›
// Archive lists each batch by day and count, and Restore puts every task back
// on its day or in Carried over; Delete permanently asks for the typed word and
// removes on the server exactly the batch's tasks with their steps, and
// nothing else. On a phone the confirmation is a bottom sheet with 44 px
// choices. Settings › About, from the same wave, shows the version and What's
// new.
//
// Clear the slate takes every active, non-repeating task dated today or earlier
// (and, with the backlog, the undated ones with nothing ahead) — in CI that is
// hundreds of seeded tasks. So for the length of the spec every such task of
// the account's is taken off the slate, whatever its title: a dated one moves
// to tomorrow and each starts tomorrow (e2e/db.ts offSlate). The counts, the
// batches and the deletes then hold only this spec's rows. afterAll puts every
// one back exactly as found and removes this spec's own rows.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { backOnSlate, devAccount, isoPlus, offSlate, putBack, removeOwn, seedKey, standAside, waitForRow, withDb, type DevAccount, type OffSlate, type StoodAside } from "./db";
import { CHANGELOG } from "../src/features/settings/changelog";
import { DEV_USER, openApp, shortDay, uniqueTitle } from "./helpers";

test.describe.configure({ mode: "serial" });

const todayOne = uniqueTitle("slate today one");
const todayTwo = uniqueTitle("slate today two");
const carriedOne = uniqueTitle("slate carried");
const backlog = uniqueTitle("slate backlog");
const repeat = uniqueTitle("slate repeat");
const inbox = uniqueTitle("slate inbox");
const doomedStep = uniqueTitle("slate step that goes");
const keptStep = uniqueTitle("slate step that stays");
const own = [todayOne, todayTwo, carriedOne, backlog, repeat, inbox];
/** "Today only" takes these three; "Today + backlog" adds the undated one. */
const todayScope = [todayOne, todayTwo, carriedOne];
const backlogScope = [...todayScope, backlog];

let me: DevAccount;
/** The calendar day in the account's zone: the day a batch made now is named by. */
let calendarToday = "";
let off: OffSlate[] = [];
let stood: StoodAside[] = [];

const section = (page: Page, name: RegExp) => page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name }) });
const row = (list: Locator, title: string) => list.getByRole("listitem").filter({ hasText: title });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Clear the slate" });
const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

/** Archived with one batch id between them, from the state they were in, their dates kept. */
const ARCHIVED = `select 1 from public.tasks
  where title = any($1) and state = 'archived' and archived_from_state = 'active' and archived_at is not null and deleted_at is null
  having count(*) = cardinality($1) and count(distinct archive_batch_id) = 1 and bool_and(archive_batch_id is not null)`;
/** Out of the archive, as they were before it. */
const BACK = `select 1 from public.tasks
  where title = any($1) and state = 'active' and archive_batch_id is null and archived_from_state is null and archived_at is null and deleted_at is null
  having count(*) = cardinality($1)`;
/** Every task kept its day (the undated one has none). */
const DAYS = `select 1 from public.tasks where title = any($1) having count(*) filter (where
  (title = $2 and do_date = $5::date) or (title = $3 and do_date = $5::date) or (title = $4 and do_date = $5::date - 1) or (title = $6 and do_date is null)) = cardinality($1)`;
const daysArgs = (titles: string[]) => [titles, todayOne, todayTwo, carriedOne, me.today, backlog];
/** The rows the slate must leave alone: a repeat on today and an Inbox task stay exactly where they were. */
const UNTOUCHED = `select 1 from public.tasks where (title = $1 and state = 'active' and do_date = $3::date) or (title = $2 and state = 'inbox') having count(*) = 2`;

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    calendarToday = (await c.query<{ d: string }>("select timezone($1, now())::date::text as d", [me.timezone])).rows[0].d;
    off = await offSlate(c, me);
    // What the slate leaves (repeats, routine runs) still fills Today and Carried over in CI: those start tomorrow too.
    stood = await standAside(c, me);
    const seed: [string, string, string | null, string | null, number][] = [
      // title, state, do-date, rule, carry count
      [todayOne, "active", me.today, null, 0],
      [todayTwo, "active", me.today, null, 0],
      [carriedOne, "active", isoPlus(me.today, -1), null, 1],
      [backlog, "active", null, null, 0],
      [repeat, "active", me.today, "FREQ=DAILY", 0],
      [inbox, "inbox", null, null, 0],
    ];
    for (const [i, [title, state, doDate, rule, carries]] of seed.entries()) {
      await c.query(
        `insert into public.tasks (id, space_id, title, state, do_date, recurrence_rule, recurrence_mode, estimate_min, sort_key, day_sort_key, carry_count, last_carried_at)
         values (gen_random_uuid(), $1, $2, $3, $4::date, $5, case when $5::text is null then null else 'fixed' end, 15, $6, $6, $7, case when $7 > 0 then $8::date end)`,
        [me.sid, title, state, doDate, rule, seedKey(`s${i}`), carries, me.today],
      );
    }
    for (const [task, step] of [
      [todayTwo, doomedStep],
      [backlog, keptStep],
    ]) {
      await c.query(`insert into public.checklist_items (id, space_id, task_id, title, done, sort_key) select gen_random_uuid(), space_id, id, $2, false, 'a1' from public.tasks where title = $1`, [task, step]);
    }
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await removeOwn(c, own);
    await putBack(c, stood);
    await backOnSlate(c, off);
  });
});

async function openFromMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Today options" }).click();
  await page.getByRole("menu", { name: "Today options" }).getByRole("menuitem", { name: "Clear the slate…" }).click();
  await expect(sheet(page)).toBeVisible();
  return sheet(page);
}

/** "6 Oct 2026", as What's new dates an entry. */
function entryDate(iso: string): string {
  const [, day, month] = shortDay(iso).split(" ");
  return `${day} ${month} ${iso.slice(0, 4)}`;
}

type Scope = "Today only" | "Today + backlog";
const scopeName = (name: Scope) => new RegExp(`^${name.replace("+", "\\+")}`);
const scope = (s: Locator, name: Scope) => s.getByRole("radio", { name: scopeName(name) });
/** A scope's whole choice: its label, hint and count. */
const choice = (s: Locator, name: Scope) => s.locator("label").filter({ hasText: scopeName(name) });

test("from Today's ⋯ the confirmation counts both scopes exactly, archives one batch, and one Undo brings it all back", async ({ page }) => {
  await openApp(page, "/today");
  const todayList = section(page, /^Today/);
  const carried = section(page, /^Carried over/);
  for (const title of [todayOne, todayTwo, repeat]) await expect(row(todayList, title)).toBeVisible();
  await expect(row(carried, carriedOne)).toBeVisible();

  const s = await openFromMenu(page);
  await expect(scope(s, "Today only")).toBeChecked();
  // Each choice names its own count; the question and the guarantee follow the choice.
  await expect(choice(s, "Today only")).toContainText(/3$/);
  await expect(choice(s, "Today + backlog")).toContainText(/4$/);
  await expect(s.getByRole("status")).toHaveText("Archive 3 tasks? Nothing is deleted — you can bring the whole batch back for 30 days.");
  await scope(s, "Today + backlog").check();
  await expect(s.getByRole("status")).toHaveText("Archive 4 tasks? Nothing is deleted — you can bring the whole batch back for 30 days.");
  await expect(s.getByRole("button", { name: "Archive 4 tasks" })).toBeEnabled();
  await scope(s, "Today only").check();
  await s.getByRole("button", { name: "Archive 3 tasks" }).click();
  await expect(s).toHaveCount(0);

  await expect(toast(page, "Slate cleared. 3 tasks archived")).toBeVisible();
  await expect(row(todayList, todayOne)).toHaveCount(0);
  await expect(row(todayList, todayTwo)).toHaveCount(0);
  await expect(row(carried, carriedOne)).toHaveCount(0);
  // A repeat stays on its day (archiving it would end the series), and the Inbox is not on the slate.
  await expect(row(todayList, repeat)).toBeVisible();
  expect(await waitForRow(ARCHIVED, [todayScope])).not.toBeNull();
  expect(await waitForRow(DAYS, daysArgs(todayScope))).not.toBeNull();
  expect(await waitForRow(BACK, [[backlog]])).not.toBeNull();
  expect(await waitForRow(UNTOUCHED, [repeat, inbox, me.today])).not.toBeNull();

  await toast(page, "Slate cleared. 3 tasks archived").getByRole("button", { name: "Undo" }).click();
  for (const title of [todayOne, todayTwo]) await expect(row(todayList, title)).toBeVisible();
  await expect(row(section(page, /^Carried over/), carriedOne)).toBeVisible();
  expect(await waitForRow(BACK, [todayScope])).not.toBeNull();
  expect(await waitForRow(DAYS, daysArgs(todayScope))).not.toBeNull();
});

test("Today + backlog from the Carried over header takes the undated task too; the Archive lists the batch, and Restore puts each back on its day or in Carried over", async ({ page }) => {
  await openApp(page, "/today");
  const carried = section(page, /^Carried over/);
  await expect(row(carried, carriedOne)).toBeVisible();
  await carried.getByRole("button", { name: "Clear the slate" }).click();
  const s = sheet(page);
  await expect(s).toBeVisible();
  await scope(s, "Today + backlog").check();
  await s.getByRole("button", { name: "Archive 4 tasks" }).click();
  await expect(toast(page, "Slate cleared. 4 tasks archived")).toBeVisible();
  expect(await waitForRow(ARCHIVED, [backlogScope])).not.toBeNull();

  await openApp(page, "/settings#data");
  const archive = page.getByRole("region", { name: "Archive" });
  // The batch is named by the day it was made and its count; opened, it lists its tasks.
  const batch = archive.locator("details").filter({ hasText: todayOne });
  await expect(batch.locator("summary")).toHaveText(`${shortDay(calendarToday)} · 4 tasks`);
  await batch.locator("summary").click();
  for (const title of backlogScope) await expect(batch.getByText(title, { exact: true })).toBeVisible();
  const batchRow = batch.locator("xpath=..");
  await batchRow.getByRole("button", { name: /^Restore / }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Brought back 4 tasks\.$/ })).toBeVisible();
  await expect(archive.locator("details").filter({ hasText: todayOne })).toHaveCount(0);
  expect(await waitForRow(BACK, [backlogScope])).not.toBeNull();
  expect(await waitForRow(DAYS, daysArgs(backlogScope))).not.toBeNull();

  // Back on their days: today's on Today, the one whose day has passed in Carried over.
  await openApp(page, "/today");
  for (const title of [todayOne, todayTwo]) await expect(row(section(page, /^Today/), title)).toBeVisible();
  await expect(row(section(page, /^Carried over/), carriedOne)).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true });

  test("the confirmation is a bottom sheet with 44 px choices, and Cancel archives nothing", async ({ page }) => {
    await openApp(page, "/today");
    await expect(row(section(page, /^Today/), todayOne)).toBeVisible();
    const s = await openFromMenu(page);
    await expect(s.getByRole("status")).toHaveText(/^Archive 3 tasks\?/);
    // Drawn up from the bottom edge (once it has risen), the full width of the screen.
    await expect.poll(async () => {
      const box = await s.boundingBox();
      return box && [Math.round(box.y + box.height), Math.round(box.width)];
    }).toEqual([780, 360]);
    for (const target of [choice(s, "Today only"), choice(s, "Today + backlog"), s.getByRole("button", { name: "Cancel" }), s.getByRole("button", { name: /^Archive/ })]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await s.getByRole("button", { name: "Cancel" }).click();
    await expect(s).toHaveCount(0);
    expect(await waitForRow(BACK, [[todayOne, backlog]])).not.toBeNull();
  });
});

test("Delete permanently waits for the typed word, then removes on the server exactly the batch's tasks with their steps", async ({ page }) => {
  await openApp(page, "/settings#data");
  // Clear the slate from Settings › Data, Today only.
  await page.getByRole("region", { name: "Clear the slate" }).getByRole("button", { name: "Clear the slate…" }).click();
  const s = sheet(page);
  await expect(s.getByRole("status")).toHaveText(/^Archive 3 tasks\?/);
  await s.getByRole("button", { name: "Archive 3 tasks" }).click();
  await expect(s).toHaveCount(0);
  // The server deletes only what it already holds as archived: wait for the batch to arrive.
  expect(await waitForRow(ARCHIVED, [todayScope])).not.toBeNull();
  const doomed = await withDb(async (c) => (await c.query<{ id: string }>("select id from public.tasks where title = any($1)", [todayScope])).rows.map((r) => r.id));
  const before = await withDb(async (c) => ({
    tasks: (await c.query<{ id: string }>("select id from public.tasks")).rows.map((r) => r.id),
    steps: (await c.query<{ id: string; title: string }>("select id, title from public.checklist_items")).rows,
  }));

  const batch = page.getByRole("region", { name: "Archive" }).locator("details").filter({ hasText: todayOne });
  await expect(batch.locator("summary")).toHaveText(`${shortDay(calendarToday)} · 3 tasks`);
  await batch.locator("xpath=..").getByRole("button", { name: /^Delete .* permanently$/ }).click();
  const confirm = page.getByRole("dialog", { name: "Delete 3 tasks permanently?" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("It can’t be undone");
  const go = confirm.getByRole("button", { name: "Delete 3 tasks" });
  const word = confirm.getByRole("textbox", { name: "Type delete to confirm" });
  await expect(go).toBeDisabled();
  await word.fill("delet");
  await expect(go).toBeDisabled();
  await word.fill("delete");
  await expect(go).toBeEnabled();
  await go.click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /^Deleted 3 tasks permanently\.$/ })).toBeVisible();

  // Gone from the server: exactly those three tasks and the one step on them; every other row is still there.
  const after = await withDb(async (c) => ({
    tasks: new Set((await c.query<{ id: string }>("select id from public.tasks")).rows.map((r) => r.id)),
    steps: new Set((await c.query<{ id: string }>("select id from public.checklist_items")).rows.map((r) => r.id)),
  }));
  expect(before.tasks.filter((id) => !after.tasks.has(id)).sort()).toEqual([...doomed].sort());
  expect(after.tasks.size).toBe(before.tasks.length - 3);
  expect(before.steps.filter((r) => !after.steps.has(r.id)).map((r) => r.title)).toEqual([doomedStep]);
  expect(before.steps.some((r) => r.title === keptStep && after.steps.has(r.id))).toBe(true);
  expect(await waitForRow(BACK, [[backlog]])).not.toBeNull();
  expect(await waitForRow(UNTOUCHED, [repeat, inbox, me.today])).not.toBeNull();
  // And off this device once sync brings the delete down.
  await expect(page.getByRole("region", { name: "Archive" }).locator("details").filter({ hasText: todayOne })).toHaveCount(0, { timeout: 30_000 });
});

test("About shows the version and what's new", async ({ page }) => {
  await openApp(page, "/settings#about");
  const about = page.getByRole("region", { name: "About" });
  await expect(about).toBeVisible();
  // The build's version, never the placeholder.
  const version = about.locator("div").filter({ has: page.getByText("Version", { exact: true }) }).last();
  await expect(version).toHaveText(/^Version\s*[^\s—]+$/);
  await expect(about.getByRole("link", { name: /^Privacy/ })).toHaveAttribute("href", "/privacy");
  await about.getByRole("button", { name: "Show shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);

  const news = page.getByRole("region", { name: "What’s new" });
  await expect(news.getByRole("heading", { level: 3 })).toHaveText(CHANGELOG.map((e) => entryDate(e.date)));
  await expect(news.getByRole("listitem").first()).toHaveText(CHANGELOG[0].items[0]);
  await expect(news.getByRole("listitem")).toHaveCount(CHANGELOG.reduce((n, e) => n + e.items.length, 0));
});
