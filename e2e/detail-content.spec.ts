// What a task and a project hold (SCREENS.md §9–§10): notes drawn as Markdown
// and edited in place (a link opens without starting an edit, raw HTML stays
// text); headings that move up and down with their tasks, fold, and keep their
// own "Show completed"; checklist steps that move by their ⋯ and by Alt+↑/↓,
// with Enter opening a new step under the one it is pressed on; and Convert to
// project from the detail's ⋯ and the checklist's ⋯, undone in one step.
//
// Everything happens inside a project this spec makes for itself, so no list
// of the account's (crowded in CI) is in the way. afterAll removes the
// project, its headings and tasks, and any project a conversion made.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, removeOwn, seedKey, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

const project = uniqueTitle("detail project");
const headOne = uniqueTitle("heading one");
const headTwo = uniqueTitle("heading two");
const noted = uniqueTitle("notes task");
const listed = uniqueTitle("checklist task");
const underOne = uniqueTitle("under one");
const doneUnderOne = uniqueTitle("done under one");
const underTwo = uniqueTitle("under two");
const fromDetail = uniqueTitle("convert from detail");
const fromChecklist = uniqueTitle("convert from checklist");
const [stepA, stepB, stepC, stepD] = ["a", "b", "c", "d"].map((s) => uniqueTitle(`step ${s}`));
const detailSteps = [uniqueTitle("detail step one"), uniqueTitle("detail step two")];
const checklistStep = uniqueTitle("checklist step one");
const own = [project, noted, listed, underOne, doneUnderOne, underTwo, fromDetail, fromChecklist, stepA, stepB, stepC, stepD, ...detailSteps, checklistStep];

const NOTE = [
  "# E2E note heading",
  "Some **bold words** and *quiet ones*, `inline code` and [a link](https://example.com/e2e-note).",
  "",
  "- first point",
  "- second point",
  "",
  '<img src="x" onerror="window.__pwned = 1">',
  "",
  "[bad link](javascript:window.__pwned=2)",
].join("\n");

let me: DevAccount;
let projectId = "";

const panel = (page: Page) => page.getByRole("complementary", { name: "Task" });
/** The page's own rows: the sidebar lists a converted task's project by the same name. */
const rows = (page: Page) => page.getByRole("main").getByRole("listitem");
async function openTask(page: Page, title: string): Promise<Locator> {
  await rows(page).filter({ hasText: title }).getByRole("button", { name: title, exact: true }).click();
  const p = panel(page);
  await expect(p.getByRole("textbox", { name: "Title" })).toHaveValue(title);
  return p;
}
/** The steps in the order the checklist draws them. */
const stepOrder = (p: Locator) => p.locator("input[data-step]").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
const STEPS = `select 1 from public.checklist_items c join public.tasks t on t.id = c.task_id
  where t.title = $1 and c.deleted_at is null having string_agg(c.title, '|' order by c.sort_key collate "C") = $2`;
/** My headings in the order the page draws them. */
async function headingOrder(page: Page): Promise<string[]> {
  const texts = await page.getByRole("heading", { level: 2 }).allTextContents();
  return texts.map((t) => [headOne, headTwo].find((h) => t.includes(h))).filter((t): t is string => Boolean(t));
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    projectId = (
      await c.query<{ id: string }>(
        `insert into public.projects (id, space_id, name, notes_md, state, sort_key) values (gen_random_uuid(), $1, $2, $3, 'active', $4) returning id`,
        [me.sid, project, "E2E project **plan** first line\n\nMore about it.", seedKey("e1")],
      )
    ).rows[0].id;
    const heading = async (title: string, key: string) =>
      (await c.query<{ id: string }>(`insert into public.headings (id, space_id, project_id, title, sort_key) values (gen_random_uuid(), $1, $2, $3, $4) returning id`, [me.sid, projectId, title, key])).rows[0].id;
    const one = await heading(headOne, "a1");
    const two = await heading(headTwo, "a2");
    const task = async (title: string, key: string, opts: { heading?: string; notes?: string; done?: boolean } = {}) =>
      (
        await c.query<{ id: string }>(
          `insert into public.tasks (id, space_id, project_id, heading_id, title, state, notes_md, completed_at, estimate_min, sort_key)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::timestamptz, 15, $8) returning id`,
          [me.sid, projectId, opts.heading ?? null, title, opts.done ? "done" : "active", opts.notes ?? null, opts.done ? new Date(Date.now() - 86_400_000).toISOString() : null, key],
        )
      ).rows[0].id;
    const steps = async (taskId: string, titles: readonly string[]) => {
      for (const [i, title] of titles.entries()) {
        await c.query(`insert into public.checklist_items (id, space_id, task_id, title, done, sort_key) values (gen_random_uuid(), $1, $2, $3, false, $4)`, [me.sid, taskId, title, `a${i + 1}`]);
      }
    };
    await task(noted, "a1", { notes: NOTE });
    await steps(await task(listed, "a2"), [stepA, stepB, stepC]);
    await steps(await task(fromDetail, "a3"), detailSteps);
    await steps(await task(fromChecklist, "a4"), [checklistStep]);
    await task(underOne, "a1", { heading: one });
    await task(doneUnderOne, "a2", { heading: one, done: true });
    await task(underTwo, "a1", { heading: two });
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.headings where project_id = $1", [projectId]);
    await removeOwn(c, own);
  });
});

test("a task's note is drawn as Markdown; a link opens without starting an edit; raw HTML stays text; a click edits it in place", async ({ page, context }) => {
  // The link's page is answered here: the suite never leaves the machine.
  await context.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "E2E" }));
  await openApp(page, `/project/${projectId}`);
  const p = await openTask(page, noted);
  const note = p.getByRole("group", { name: "Notes" });
  await expect(note.getByRole("heading", { name: "E2E note heading" })).toBeVisible();
  await expect(note.locator("strong")).toHaveText("bold words");
  await expect(note.locator("em")).toHaveText("quiet ones");
  await expect(note.locator("code")).toHaveText("inline code");
  await expect(note.getByRole("listitem")).toHaveText(["first point", "second point"]);
  // Raw HTML is words on the page, never an element, and an address off the allow-list is never a link.
  await expect(note.getByText('<img src="x" onerror="window.__pwned = 1">')).toBeVisible();
  await expect(note.locator("img")).toHaveCount(0);
  await expect(note.getByRole("link", { name: "bad link" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

  const link = note.getByRole("link", { name: "a link" });
  await expect(link).toHaveAttribute("href", "https://example.com/e2e-note");
  await expect(link).toHaveAttribute("target", "_blank");
  const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
  await expect.poll(() => popup.url()).toBe("https://example.com/e2e-note");
  await popup.close();
  await expect(note).toBeVisible();
  await expect(p.getByRole("textbox", { name: "Notes" })).toHaveCount(0);

  // A click on the words opens the editor right there, with the Markdown as typed; Escape saves and draws it again.
  await note.getByText("second point").click();
  const editor = p.getByRole("textbox", { name: "Notes" });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(NOTE);
  await editor.fill(`${NOTE}\n\nE2E added **line**`);
  await editor.press("Escape");
  await expect(p).toBeVisible();
  await expect(note).toBeFocused();
  await expect(note.locator("strong").last()).toHaveText("line");
  expect(await waitForRow("select 1 from public.tasks where title = $1 and notes_md = $2", [noted, `${NOTE}\n\nE2E added **line**`])).not.toBeNull();
});

test("a project's note is drawn as Markdown too, and folded it shows its first line as plain words", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const note = page.getByRole("group", { name: "Project notes" });
  await expect(note.locator("strong")).toHaveText("plan");
  const toggle = page.getByRole("button", { name: /^Notes/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(note).toHaveCount(0);
  await expect(toggle).toContainText("E2E project plan first line");
  await expect(toggle).not.toContainText("**");
});

test("a heading moves down and up with its tasks, each move undone by ⌘Z, folds them away, and shows its own completed tasks", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  await expect.poll(() => headingOrder(page)).toEqual([headOne, headTwo]);
  // The first heading can only go down; its tasks follow it.
  await page.getByRole("button", { name: `Heading actions: ${headOne}` }).click();
  const menu = page.getByRole("menu", { name: `Heading actions: ${headOne}` });
  await expect(menu.getByRole("menuitem", { name: "Move up" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Move down" }).click();
  await expect.poll(() => headingOrder(page)).toEqual([headTwo, headOne]);
  const under = rows(page).filter({ hasText: /under (one|two)/ });
  await expect.poll(async () => (await under.allTextContents()).map((t) => (t.includes(underOne) ? "one" : "two"))).toEqual(["two", "one"]);
  const ORDER = `select 1 from public.headings where project_id = $1 and deleted_at is null having string_agg(title, '|' order by sort_key collate "C") = $2`;
  expect(await waitForRow(ORDER, [projectId, `${headTwo}|${headOne}`])).not.toBeNull();
  // One undo puts it back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => headingOrder(page)).toEqual([headOne, headTwo]);
  expect(await waitForRow(ORDER, [projectId, `${headOne}|${headTwo}`])).not.toBeNull();
  // The last heading can only go up.
  await page.getByRole("button", { name: `Heading actions: ${headTwo}` }).click();
  const last = page.getByRole("menu", { name: `Heading actions: ${headTwo}` });
  await expect(last.getByRole("menuitem", { name: "Move down" })).toHaveCount(0);
  await last.getByRole("menuitem", { name: "Move up" }).click();
  await expect.poll(() => headingOrder(page)).toEqual([headTwo, headOne]);
  expect(await waitForRow(ORDER, [projectId, `${headTwo}|${headOne}`])).not.toBeNull();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => headingOrder(page)).toEqual([headOne, headTwo]);
  expect(await waitForRow(ORDER, [projectId, `${headOne}|${headTwo}`])).not.toBeNull();

  // Folding a heading hides its tasks and says how many are folded.
  const fold = page.getByRole("button", { name: `Fold away the tasks under ${headTwo}` });
  await fold.click();
  await expect(rows(page).filter({ hasText: underTwo })).toHaveCount(0);
  const show = page.getByRole("button", { name: `Show the tasks under ${headTwo}` });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("section").filter({ has: show }).getByText("· 1")).toBeVisible();
  await show.click();
  await expect(rows(page).filter({ hasText: underTwo })).toBeVisible();

  // Each heading keeps its own completed tasks under its own disclosure.
  await expect(rows(page).filter({ hasText: doneUnderOne })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Show completed · 1 in ${headTwo}` })).toHaveCount(0);
  const completed = page.getByRole("button", { name: `Show completed · 1 in ${headOne}` });
  await completed.click();
  await expect(rows(page).filter({ hasText: doneUnderOne })).toBeVisible();
  await expect(page.getByRole("button", { name: `Hide completed · 1 in ${headOne}` })).toHaveAttribute("aria-expanded", "true");
});

test("checklist steps move by their ⋯ and by Alt+↑ / Alt+↓, and Enter on a step opens a new one under it", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const p = await openTask(page, listed);
  await expect.poll(() => stepOrder(p)).toEqual([stepA, stepB, stepC]);

  // The tap path: the step's ⋯ (the first step cannot go up).
  await p.getByRole("button", { name: `Step actions: ${stepA}` }).click();
  const menu = p.getByRole("menu", { name: `Step actions: ${stepA}` });
  await expect(menu.getByRole("menuitem", { name: "Move up" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Move down" }).click();
  await expect.poll(() => stepOrder(p)).toEqual([stepB, stepA, stepC]);
  expect(await waitForRow(STEPS, [listed, [stepB, stepA, stepC].join("|")])).not.toBeNull();

  // Alt+↑ and Alt+↓ while typing in a step; the caret stays in it.
  const c = p.getByRole("textbox", { name: `Step: ${stepC}` });
  await c.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => stepOrder(p)).toEqual([stepB, stepC, stepA]);
  await expect(c).toBeFocused();
  expect(await waitForRow(STEPS, [listed, [stepB, stepC, stepA].join("|")])).not.toBeNull();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => stepOrder(p)).toEqual([stepB, stepA, stepC]);
  await expect(c).toBeFocused();
  expect(await waitForRow(STEPS, [listed, [stepB, stepA, stepC].join("|")])).not.toBeNull();

  // Enter at the end of a step opens a new one right under it; Escape on the next empty one leaves it.
  const b = p.getByRole("textbox", { name: `Step: ${stepB}` });
  await b.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const fresh = p.getByRole("textbox", { name: "New step" });
  await expect(fresh).toBeFocused();
  await fresh.fill(stepD);
  await fresh.press("Enter");
  await expect(p.getByRole("textbox", { name: `Step: ${stepD}` })).toBeVisible();
  await expect(fresh).toBeFocused();
  await fresh.press("Escape");
  await expect(fresh).toHaveCount(0);
  await expect(p.getByRole("textbox", { name: `Step: ${stepD}` })).toBeFocused();
  await expect.poll(() => stepOrder(p)).toEqual([stepB, stepD, stepA, stepC]);
  expect(await waitForRow(STEPS, [listed, [stepB, stepD, stepA, stepC].join("|")])).not.toBeNull();
});

test("Convert to project from the detail's ⋯ opens the new project in its add row, and Undo steps back to where it was made", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const p = await openTask(page, fromDetail);
  await p.getByRole("button", { name: "More actions" }).click();
  await p.getByRole("menuitem", { name: "Convert to project" }).click();

  await expect(page).toHaveURL(/\/project\/[^/?]+\?add=1$/);
  expect(page.url()).not.toContain(projectId);
  await expect(page.getByRole("textbox", { name: "Add a task" })).toBeFocused();
  for (const step of detailSteps) await expect(rows(page).filter({ hasText: step })).toBeVisible();
  const made = await waitForRow<{ id: string }>("select id from public.projects where name = $1 and deleted_at is null", [fromDetail]);
  expect(made).not.toBeNull();
  expect(await waitForRow(`select 1 from public.tasks where project_id = $1 and state = 'active' having string_agg(title, '|' order by sort_key collate "C") = $2`, [made!.id, detailSteps.join("|")])).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'archived'", [fromDetail])).not.toBeNull();

  await page.getByRole("status").filter({ hasText: "to a project" }).getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(new RegExp(`/project/${projectId}$`));
  await expect(rows(page).filter({ hasText: fromDetail })).toBeVisible();
  expect(await waitForRow("select 1 from public.projects where id = $1 and deleted_at is not null", [made!.id])).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'active' and project_id = $2", [fromDetail, projectId])).not.toBeNull();
});

test("Convert to project from the checklist's ⋯", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const p = await openTask(page, fromChecklist);
  await p.getByRole("button", { name: "Checklist options" }).click();
  await p.getByRole("menuitem", { name: "Convert to project" }).click();
  await expect(page).toHaveURL(/\/project\/[^/?]+\?add=1$/);
  await expect(page.getByRole("textbox", { name: "Add a task" })).toBeFocused();
  await expect(rows(page).filter({ hasText: checklistStep })).toBeVisible();
  const made = await waitForRow<{ id: string }>("select id from public.projects where name = $1 and deleted_at is null", [fromChecklist]);
  expect(made).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where project_id = $1 and title = $2 and state = 'active'", [made!.id, checklistStep])).not.toBeNull();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'archived'", [fromChecklist])).not.toBeNull();
});
