// Areas and search (SCREENS.md §9, §13, §22, as built 2026-10-07): an area view's project cards carry a progress
// line ("1 done this week · 1 open") and the tasks filed in the area directly sit under them with an "Add to …" row;
// Browse's ⋯ moves an area up (⌘Z puts it back) and a project to another area; the detail's Project field and `M`
// file a task loose in an area. Search matches every word in any order, ranks a title match above a note match on
// the same day, leaves archived tasks out unless the state chip asks for them, and its area chip takes in the
// tasks filed in the area directly.
//
// Everything here is the spec's own: two areas and two projects of its own (after the account's, in sort order),
// and tasks named with a word no other row has, so neither a crowded account nor anything else changes what is
// listed. The rows are removed in afterAll (and by the teardown, by their "E2E " prefix).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, seedKey, waitForRow, withDb, type DevAccount } from "./db";
import { clickTitle, DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `w${Date.now().toString(36)}`;
const areaOne = `${E2E_PREFIX}area one ${n}`;
const areaTwo = `${E2E_PREFIX}area two ${n}`;
const carded = `${E2E_PREFIX}carded project ${n}`;
const loose = `${E2E_PREFIX}loose project ${n}`;
const T = {
  open: `${E2E_PREFIX}card open ${n}`,
  done: `${E2E_PREFIX}card done ${n}`,
  inArea: `${E2E_PREFIX}errand ${n} in the area`,
  byDetail: `${E2E_PREFIX}file by detail ${n}`,
  byKey: `${E2E_PREFIX}file by key ${n}`,
  titled: `${E2E_PREFIX}Draft the ${n} proposal`,
  noted: `${E2E_PREFIX}${n} call`,
  archived: `${E2E_PREFIX}${n} proposal archived`,
  added: `${E2E_PREFIX}added in the area ${n}`,
};

let me: DevAccount;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    const one = async (sql: string, params: unknown[]) => (await c.query<{ id: string }>(sql, params)).rows[0].id;
    ids.areaOne = await one("insert into public.areas (id, space_id, name, sort_key) values (gen_random_uuid(), $1, $2, $3) returning id", [me.sid, areaOne, seedKey("71")]);
    ids.areaTwo = await one("insert into public.areas (id, space_id, name, sort_key) values (gen_random_uuid(), $1, $2, $3) returning id", [me.sid, areaTwo, seedKey("72")]);
    ids.carded = await one("insert into public.projects (id, space_id, area_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, $3, 'active', $4) returning id", [
      me.sid,
      ids.areaOne,
      carded,
      seedKey("71"),
    ]);
    ids.loose = await one("insert into public.projects (id, space_id, area_id, name, state, sort_key) values (gen_random_uuid(), $1, null, $2, 'active', $3) returning id", [
      me.sid,
      loose,
      seedKey("72"),
    ]);
    const task = (title: string, extra: Record<string, unknown>) => {
      const row: Record<string, unknown> = { space_id: me.sid, title, state: "active", priority: 0, sort_key: seedKey(String(Object.keys(ids).length)), ...extra };
      const cols = Object.keys(row);
      return one(`insert into public.tasks (id, ${cols.join(", ")}) values (gen_random_uuid(), ${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(row));
    };
    ids.open = await task(T.open, { project_id: ids.carded, estimate_min: 25 });
    ids.done = await task(T.done, { project_id: ids.carded, state: "done", completed_at: new Date(Date.now() - 24 * 3600_000).toISOString() });
    ids.inArea = await task(T.inArea, { area_id: ids.areaOne });
    ids.byDetail = await task(T.byDetail, { project_id: ids.loose });
    ids.byKey = await task(T.byKey, { project_id: ids.loose });
    // Touched in this order, so by recency alone the note match would come first.
    ids.titled = await task(T.titled, { last_touched_at: new Date(Date.now() - 20_000).toISOString() });
    ids.noted = await task(T.noted, { notes_md: "Go over the proposal with Ana.", last_touched_at: new Date(Date.now() - 5_000).toISOString() });
    ids.archived = await task(T.archived, { state: "archived", archived_from_state: "active", archived_at: new Date().toISOString() });
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.tasks where title = any($1)", [Object.values(T)]);
    await c.query("delete from public.tasks where project_id = any($1::uuid[]) or area_id = any($2::uuid[])", [
      [ids.carded, ids.loose].filter(Boolean),
      [ids.areaOne, ids.areaTwo].filter(Boolean),
    ]);
    await c.query("delete from public.projects where id = any($1::uuid[])", [[ids.carded, ids.loose].filter(Boolean)]);
    await c.query("delete from public.areas where id = any($1::uuid[])", [[ids.areaOne, ids.areaTwo].filter(Boolean)]);
  });
});

/** Selects a row the way a person does: its title opens the detail, Esc closes it and the selection stays. */
async function select(page: Page, title: string) {
  const row = page.getByRole("row").filter({ hasText: title });
  await clickTitle(row.getByRole("button", { name: title, exact: true }));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-current", "true");
  return row;
}

const AREA_KEYS = "select (select sort_key from public.areas where id = $1) < (select sort_key from public.areas where id = $2) as before";

/** Puts the spec's rows back where its beforeAll made them (each test starts from there, run once or again). */
async function reset() {
  await withDb(async (c) => {
    await c.query("delete from public.tasks where title = $1", [T.added]);
    await c.query("update public.areas set sort_key = case id when $1::uuid then $3 else $4 end where id in ($1::uuid, $2::uuid)", [ids.areaOne, ids.areaTwo, seedKey("71"), seedKey("72")]);
    await c.query("update public.projects set area_id = $2 where id = $1 and area_id is distinct from $2", [ids.carded, ids.areaOne]);
    await c.query("update public.tasks set project_id = $2, area_id = null where id = any($1::uuid[]) and project_id is distinct from $2", [[ids.byDetail, ids.byKey], ids.loose]);
  });
}

test("an area's project card says what was done this week and what is open; its loose tasks list under the cards and take new ones", async ({ page }) => {
  await reset();
  await openApp(page, `/area/${ids.areaOne}`);
  const card = page.getByRole("main").getByRole("link").filter({ hasText: carded });
  await expect(card).toContainText("1 done this week · 1 open");
  await expect(card.getByTestId("project-progress")).toBeAttached();

  const tasks = page.getByRole("region", { name: `Tasks in ${areaOne}` });
  await expect(tasks.getByRole("row").filter({ hasText: T.inArea })).toBeVisible();
  // The add row files a new task in the area itself, with no project.
  const add = tasks.getByRole("textbox", { name: `Add to ${areaOne}` });
  await add.fill(T.added);
  await add.press("Enter");
  await expect(tasks.getByRole("row").filter({ hasText: T.added })).toBeVisible();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and area_id = $2 and project_id is null", [T.added, ids.areaOne])).not.toBeNull();
});

test("Browse's ⋯ moves an area up (⌘Z puts it back) and a project to another area", async ({ page }) => {
  await reset();
  await openApp(page, "/browse");
  await page.getByRole("button", { name: `Organise ${areaTwo}` }).click();
  const sheet = page.getByRole("dialog", { name: `Organise ${areaTwo}` });
  await sheet.getByRole("menuitem", { name: "Move up" }).click();
  await expect(sheet).toHaveCount(0);
  const before = async (a: string, b: string) => (await withDb((c) => c.query<{ before: boolean }>(AREA_KEYS, [a, b]))).rows[0].before;
  await expect.poll(() => before(ids.areaTwo, ids.areaOne)).toBe(true);
  // Browse's tree follows: area two is drawn before area one.
  const order = () =>
    page
      .getByRole("main")
      .locator("[data-nav-area]")
      .evaluateAll((els, mine) => els.map((e) => e.getAttribute("data-nav-area") ?? "").filter((id) => mine.includes(id)), [ids.areaOne, ids.areaTwo]);
  await expect.poll(order).toEqual([ids.areaTwo, ids.areaOne]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => before(ids.areaOne, ids.areaTwo)).toBe(true);
  await expect.poll(order).toEqual([ids.areaOne, ids.areaTwo]);

  await page.getByRole("button", { name: `Organise ${carded}` }).click();
  await page.getByRole("dialog", { name: `Organise ${carded}` }).getByRole("menuitem", { name: "Move to area…" }).click();
  const areas = page.getByRole("dialog", { name: "Move to area" });
  await expect(areas.getByRole("menuitemradio", { name: areaOne })).toHaveAttribute("aria-checked", "true");
  await areas.getByRole("menuitemradio", { name: areaTwo }).click();
  expect(await waitForRow("select 1 from public.projects where id = $1 and area_id = $2", [ids.carded, ids.areaTwo])).not.toBeNull();
  // Browse lists it under its new area.
  await expect(page.getByRole("main").locator("li").filter({ has: page.locator(`[data-nav-area="${ids.areaTwo}"]`) }).locator(`[data-nav-project="${ids.carded}"]`)).toBeVisible();
});

test("the detail's Project field files a task loose in an area, out of its project", async ({ page }) => {
  await reset();
  await openApp(page, `/project/${ids.loose}`);
  await clickTitle(page.getByRole("row").filter({ hasText: T.byDetail }).getByRole("button", { name: T.byDetail, exact: true }));
  const panel = page.getByRole("complementary", { name: "Task" });
  await panel.getByRole("button", { name: /^Project/ }).click();
  await page.getByRole("dialog", { name: "Project" }).getByRole("button", { name: `Area ${areaOne}` }).click();
  expect(await waitForRow("select 1 from public.tasks where id = $1 and area_id = $2 and project_id is null", [ids.byDetail, ids.areaOne])).not.toBeNull();
  // The field names the area now, and the task has left the project's list.
  await expect(panel.getByRole("button", { name: /^Project/ })).toContainText(areaOne);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main").getByRole("row").filter({ hasText: T.byDetail })).toHaveCount(0);

  await openApp(page, `/area/${ids.areaOne}`);
  await expect(page.getByRole("region", { name: `Tasks in ${areaOne}` }).getByRole("row").filter({ hasText: T.byDetail })).toBeVisible();
});

test("M lists the areas after the projects; one files the selected task loose in it, and ⌘Z puts it back", async ({ page }) => {
  await reset();
  await openApp(page, `/project/${ids.loose}`);
  await select(page, T.byKey);
  await page.keyboard.press("m");
  const sheet = page.getByRole("dialog", { name: "Move this task" });
  await expect(sheet.getByRole("combobox", { name: "Move this task" })).toBeFocused();
  await sheet.getByRole("combobox").fill(n);
  // The project it is in, and the two areas, each marked as one.
  await expect(sheet.getByRole("option", { name: new RegExp(`^${loose}`) })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByRole("option", { name: `${areaTwo} Area` })).toBeVisible();
  await sheet.getByRole("option", { name: `${areaOne} Area` }).click();
  await expect(sheet).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where id = $1 and area_id = $2 and project_id is null", [ids.byKey, ids.areaOne])).not.toBeNull();
  await expect(page.getByRole("status").filter({ hasText: `to ${areaOne}` }).first()).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");
  expect(await waitForRow("select 1 from public.tasks where id = $1 and area_id is null and project_id = $2", [ids.byKey, ids.loose])).not.toBeNull();
});

test("search: every word in any order, a title match above a note match, archived only on asking, and the area chip takes loose tasks", async ({ page }) => {
  const results = () => page.locator("section").filter({ has: page.getByRole("heading", { name: /^Tasks/ }) }).getByRole("row");
  const titles = async () => (await results().allTextContents()).map((t) => Object.values(T).find((title) => t.includes(title)) ?? t);

  // "proposal <word>": the title holding both words, then the task whose note holds "proposal", though touched later.
  await openApp(page, `/search?q=${encodeURIComponent(`proposal ${n}`)}`);
  await expect(results().filter({ hasText: T.titled })).toBeVisible();
  await expect(results().filter({ hasText: T.noted })).toBeVisible();
  const found = await titles();
  expect(found.indexOf(T.titled)).toBeLessThan(found.indexOf(T.noted));
  // Archived tasks stay out unless asked for.
  await expect(page.getByText(T.archived)).toHaveCount(0);

  // Any order, any case.
  const box = page.getByRole("searchbox", { name: "Search" });
  await box.fill(`${n} DRAFT`);
  await expect(results().filter({ hasText: T.titled })).toBeVisible();
  await expect(results().filter({ hasText: T.noted })).toHaveCount(0);

  // The state chip on Archived shows them as the results.
  await openApp(page, `/search?q=${encodeURIComponent(n)}&state=archived`);
  await expect(results().filter({ hasText: T.archived })).toBeVisible();
  await expect(results().filter({ hasText: T.titled })).toHaveCount(0);

  // The area chip: tasks filed in the area directly.
  await openApp(page, `/search?q=${encodeURIComponent(n)}&area=${ids.areaOne}`);
  await expect(results().filter({ hasText: T.inArea })).toBeVisible();
  await expect(results().filter({ hasText: T.titled })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Remove filter ${areaOne}` })).toBeVisible();
});
