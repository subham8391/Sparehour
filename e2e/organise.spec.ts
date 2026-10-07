// Organising from the keyboard and the menus (SCREENS.md §9, §10, §12, §24, as built 2026-10-07): with rows ticked
// `#` opens the project picker and moves them all in one write and one undo; `@` finds a tag or offers to create one
// and Tab takes it; `G P` and `G A` open the palette on the projects or the areas; Duplicate copies a task (title,
// note, steps unticked, tags, estimate, priority) and opens the copy, and the project ⋯'s Duplicate copies a project
// as "… (copy)" with its open tasks and opens it; Copy link copies `<origin>/today?task=<id>`, which opens that
// task's detail, after a reload too, and says so when the task is not on the device.
//
// Everything is the spec's own: two projects, an area, the tasks in them and a tag named e2e…, removed in afterAll
// (and by the teardown).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, seedKey, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `o${Date.now().toString(36)}`;
const home = `${E2E_PREFIX}organise home ${n}`;
const dest = `${E2E_PREFIX}organise dest ${n}`;
const areaName = `${E2E_PREFIX}organise area ${n}`;
const tagName = `e2e${n}`;
const T = {
  one: `${E2E_PREFIX}pick one ${n}`,
  two: `${E2E_PREFIX}pick two ${n}`,
  tagged: `${E2E_PREFIX}tag me ${n}`,
  copied: `${E2E_PREFIX}copy me ${n}`,
  linked: `${E2E_PREFIX}link me ${n}`,
};

let me: DevAccount;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    const one = async (sql: string, params: unknown[]) => (await c.query<{ id: string }>(sql, params)).rows[0].id;
    ids.area = await one("insert into public.areas (id, space_id, name, sort_key) values (gen_random_uuid(), $1, $2, $3) returning id", [me.sid, areaName, seedKey("91")]);
    for (const [key, name, sort] of [
      ["home", home, "91"],
      ["dest", dest, "92"],
    ] as const) {
      ids[key] = await one("insert into public.projects (id, space_id, area_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, $3, 'active', $4) returning id", [
        me.sid,
        ids.area,
        name,
        seedKey(sort),
      ]);
    }
    for (const [i, title] of Object.values(T).entries()) {
      ids[title] = await one(
        "insert into public.tasks (id, space_id, project_id, title, state, priority, estimate_min, notes_md, sort_key) values (gen_random_uuid(), $1, $2, $3, 'active', $4, $5, $6, $7) returning id",
        [me.sid, ids.home, title, title === T.copied ? 2 : 0, title === T.copied ? 25 : null, title === T.copied ? "Bring the **receipts**." : null, `a${i}`],
      );
    }
    // The copy's own steps and tags: one step already ticked (the copy's is not), one tag.
    await c.query("insert into public.checklist_items (id, space_id, task_id, title, done, sort_key) values (gen_random_uuid(), $1, $2, 'Find the folder', true, 'a0')", [me.sid, ids[T.copied]]);
    ids.tag = await one("insert into public.tags (id, space_id, name) values (gen_random_uuid(), $1, $2) returning id", [me.sid, `${tagName}x`]);
    await c.query("insert into public.task_tags (id, space_id, task_id, tag_id) values (gen_random_uuid(), $1, $2, $3)", [me.sid, ids[T.copied], ids.tag]);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    const projects = (await c.query<{ id: string }>("select id from public.projects where name like $1", [`${E2E_PREFIX}organise % ${n}%`])).rows.map((r) => r.id);
    await c.query("delete from public.tasks where title = any($1) or project_id = any($2::uuid[])", [Object.values(T), projects]);
    await c.query("delete from public.headings where project_id = any($1::uuid[])", [projects]);
    await c.query("delete from public.projects where id = any($1::uuid[])", [projects]);
    await c.query("delete from public.areas where id = $1", [ids.area]);
    await c.query("delete from public.tags where name like $1", [`${tagName}%`]);
  });
});

const row = (page: Page, title: string) => page.getByRole("main").getByRole("row").filter({ hasText: title });

/** Selects a row the way a person does: its title opens the detail, Esc closes it and the selection stays. */
async function select(page: Page, title: string) {
  const r = row(page, title);
  await r.getByRole("button", { name: title, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(r).toHaveAttribute("aria-current", "true");
  return r;
}

async function rowMenu(page: Page, title: string) {
  const r = row(page, title);
  await r.hover();
  await r.getByRole("button", { name: "More actions" }).click();
  const menu = page.getByRole("menu", { name: "More actions" });
  await expect(menu).toBeVisible();
  return menu;
}

const PROJECT_OF = "select 1 from public.tasks where id = any($1::uuid[]) and project_id = $2 having count(*) = 2";

test("with two rows ticked, # moves both to the chosen project in one write, and one ⌘Z takes both back", async ({ page }) => {
  await openApp(page, `/project/${ids.home}`);
  const one = await select(page, T.one);
  await page.keyboard.press("x");
  await expect(one).toHaveAttribute("data-ticked", "true");
  const two = row(page, T.two);
  await two.getByRole("checkbox", { name: `Select ${T.two}` }).check();
  await expect(two).toHaveAttribute("data-ticked", "true");
  // The keys are the page's, not the focused checkbox's.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.press("#");
  const sheet = page.getByRole("dialog", { name: "Move 2 tasks to a project" });
  const box = sheet.getByRole("combobox", { name: "Move 2 tasks to a project" });
  await expect(box).toBeFocused();
  // "No project" first, then the projects under their areas.
  await expect(sheet.getByRole("option").first()).toHaveText(/No project/);
  await box.fill(dest);
  await expect(sheet.getByRole("option", { selected: true })).toHaveText(dest);
  await page.keyboard.press("Enter");
  await expect(sheet).toHaveCount(0);
  const both = [ids[T.one], ids[T.two]];
  expect(await waitForRow(PROJECT_OF, [both, ids.dest])).not.toBeNull();
  await expect(page.getByRole("status").filter({ hasText: `Moved 2 tasks to ${dest}` }).first()).toBeVisible();
  await expect(one).toHaveCount(0);
  await expect(two).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await waitForRow(PROJECT_OF, [both, ids.home])).not.toBeNull();
  await expect(row(page, T.one)).toBeVisible();
  await expect(row(page, T.two)).toBeVisible();
});

test("@ finds a tag by part of its name or offers to create one; Tab takes the highlighted row", async ({ page }) => {
  // The tag this test makes is not there yet (run once or again).
  await withDb((c) => c.query("delete from public.tags where name = $1", [tagName]));
  await openApp(page, `/project/${ids.home}`);
  await select(page, T.tagged);
  await page.keyboard.press("@");
  const sheet = page.getByRole("dialog", { name: "Add a tag" });
  const box = sheet.getByRole("combobox", { name: "Add a tag" });
  await expect(box).toBeFocused();
  // The typed name matches an existing tag ("…x") and is no tag of its own: both are offered, the match first.
  await box.fill(tagName);
  await expect(sheet.getByRole("option").first()).toHaveText(`@${tagName}x`);
  await expect(sheet.getByRole("option", { name: new RegExp(`^Create tag “${tagName}”`) })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(sheet).toHaveCount(0);
  const TAGGED = `select 1 from public.task_tags tt join public.tags g on g.id = tt.tag_id
    where tt.task_id = $1 and g.name = $2 and tt.deleted_at is null and g.deleted_at is null`;
  expect(await waitForRow(TAGGED, [ids[T.tagged], tagName])).not.toBeNull();
  // Made once: asking again finds it.
  await page.keyboard.press("@");
  await sheet.getByRole("combobox").fill(tagName);
  await expect(sheet.getByRole("option").first()).toHaveText(`@${tagName}`);
  await expect(sheet.getByRole("option", { name: /^Create tag/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  expect(await waitForRow("select count(*)::int as n from public.tags where name = $1 and deleted_at is null having count(*) = 1", [tagName])).not.toBeNull();
});

test("G P and G A open the palette on the projects or the areas; Enter opens the one found", async ({ page }) => {
  await openApp(page, "/today");
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  const projects = page.getByRole("dialog", { name: "Go to project" });
  await projects.getByRole("combobox", { name: "Go to project" }).fill(home);
  await expect(projects.getByRole("option", { selected: true })).toHaveText(new RegExp(`^${home}`));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/project/${ids.home}$`));
  await expect(row(page, T.linked)).toBeVisible();

  await page.keyboard.press("g");
  await page.keyboard.press("a");
  const areas = page.getByRole("dialog", { name: "Go to area" });
  await areas.getByRole("combobox", { name: "Go to area" }).fill(areaName);
  await expect(areas.getByRole("option", { selected: true })).toHaveText(new RegExp(`^${areaName}`));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/area/${ids.area}$`));
});

test("Duplicate copies a task (note, steps unticked, tags, estimate, priority) and opens the copy; a project's copies the project", async ({ page }) => {
  // No copies yet (run once or again).
  await withDb(async (c) => {
    await c.query("delete from public.tasks where title = $1 and id <> $2", [T.copied, ids[T.copied]]);
    const copies = (await c.query<{ id: string }>("select id from public.projects where name = $1", [`${home} (copy)`])).rows.map((r) => r.id);
    await c.query("delete from public.tasks where project_id = any($1::uuid[])", [copies]);
    await c.query("delete from public.headings where project_id = any($1::uuid[])", [copies]);
    await c.query("delete from public.projects where id = any($1::uuid[])", [copies]);
  });
  await openApp(page, `/project/${ids.home}`);
  const menu = await rowMenu(page, T.copied);
  await menu.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Task" });
  await expect(panel.getByRole("textbox", { name: "Title" })).toHaveValue(T.copied);
  const COPY = `select t.id from public.tasks t
    where t.title = $1 and t.id <> $2 and t.project_id = $3 and t.estimate_min = 25 and t.priority = 2 and t.notes_md = 'Bring the **receipts**.' and t.state = 'active'
      and exists (select 1 from public.checklist_items i where i.task_id = t.id and i.title = 'Find the folder' and not i.done and i.deleted_at is null)
      and exists (select 1 from public.task_tags tt where tt.task_id = t.id and tt.tag_id = $4 and tt.deleted_at is null)`;
  const copy = await waitForRow<{ id: string }>(COPY, [T.copied, ids[T.copied], ids.home, ids.tag]);
  expect(copy).not.toBeNull();
  // The original keeps its own ticked step.
  expect(await waitForRow("select 1 from public.checklist_items where task_id = $1 and done", [ids[T.copied]])).not.toBeNull();
  await expect(row(page, T.copied)).toHaveCount(2);
  await page.keyboard.press("Escape");

  // The project ⋯: a copy named "… (copy)" with the open tasks, which opens.
  await page.getByRole("button", { name: "Project actions" }).click();
  await page.getByRole("menu", { name: "Project actions" }).getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  const made = await waitForRow<{ id: string }>("select id from public.projects where name = $1 and deleted_at is null", [`${home} (copy)`]);
  expect(made).not.toBeNull();
  await expect(page).toHaveURL(new RegExp(`/project/${made!.id}$`));
  await expect(page.getByRole("main").getByRole("row").filter({ hasText: T.linked })).toBeVisible();
  const OPEN = (id: string) => `(select count(*) from public.tasks where project_id = '${id}' and deleted_at is null and state in ('inbox', 'active', 'someday'))`;
  expect(await waitForRow(`select 1 where ${OPEN(made!.id)} = ${OPEN(ids.home)} and ${OPEN(ids.home)} > 0`, [])).not.toBeNull();
});

test("Copy link copies <origin>/today?task=<id>; a cold load of it opens the task's detail, and a task that isn't here is named", async ({ page, baseURL }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page, `/project/${ids.home}`);
  const menu = await rowMenu(page, T.linked);
  await menu.getByRole("menuitem", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied" }).first()).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(`${baseURL}/today?task=${ids[T.linked]}`);

  // A cold load of the link (another tab, a reload of it) opens the task's detail on Today; the URL is then cleaned,
  // so reloading Today afterwards does not open it again.
  const tab = await page.context().newPage();
  await openApp(tab, link);
  await expect(tab.getByRole("complementary", { name: "Task" }).getByRole("textbox", { name: "Title" })).toHaveValue(T.linked, { timeout: 20_000 });
  await expect(tab).toHaveURL(/\/today$/);
  await tab.close();
  await openApp(page, link);
  await expect(page.getByRole("complementary", { name: "Task" }).getByRole("textbox", { name: "Title" })).toHaveValue(T.linked, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/today$/);
  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);

  // A task this device does not have: the link says so (a quiet notice, gone after a few seconds, so it is looked
  // for from the moment the page starts loading).
  await page.goto("/today?task=00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("That task isn’t on this device.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
});
