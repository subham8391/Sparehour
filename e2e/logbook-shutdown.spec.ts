// The Logbook's filters and day line, and the shutdown's rating trend (SCREENS.md §8, §15, as built 2026-10-07).
// Project, area and Done | Dropped narrow the Logbook and the day headers' counts follow; the filters live in the
// URL as removable chips, and Escape takes off the newest. A day the shutdown rated carries "Rated 4/5 · Highlight:
// …" under its header. The shutdown's rating step draws a 14-day sparkline, with its summary in words, once 5 of the
// last 14 days are rated, and nothing before.
//
// The finished tasks are the spec's own, in a project and an area of its own, so a filter on them lists only them
// however crowded the account's Logbook is. The account's day plans over the last fortnight are read first: their
// ratings are cleared for the length of the spec (so exactly the spec's ratings count) and put back exactly in
// afterAll, and the plans the spec made are deleted.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, rateDay, restoreDayPlans, saveDayPlans, seedKey, withDb, type DevAccount, type SavedDayPlan } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `l${Date.now().toString(36)}`;
const areaName = `${E2E_PREFIX}logbook area ${n}`;
const projectName = `${E2E_PREFIX}logbook project ${n}`;
const T = {
  yesterday: `${E2E_PREFIX}finished yesterday ${n}`,
  earlier: `${E2E_PREFIX}finished two days ago ${n}`,
  loose: `${E2E_PREFIX}finished without a project ${n}`,
  dropped: `${E2E_PREFIX}dropped yesterday ${n}`,
};
const HIGHLIGHT = `${E2E_PREFIX}shipped the deck ${n}`;

let me: DevAccount;
let areaId = "";
let projectId = "";
let saved: SavedDayPlan[] = [];
const made: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    areaId = (await c.query<{ id: string }>("insert into public.areas (id, space_id, name, sort_key) values (gen_random_uuid(), $1, $2, $3) returning id", [me.sid, areaName, seedKey("95")])).rows[0].id;
    projectId = (
      await c.query<{ id: string }>("insert into public.projects (id, space_id, area_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, $3, 'active', $4) returning id", [
        me.sid,
        areaId,
        projectName,
        seedKey("95"),
      ])
    ).rows[0].id;
    // Noon on a day of the account's own, in its zone.
    const noon = (daysAgo: number) => `((($1::date - ${daysAgo}) + time '12:00') at time zone $2)`;
    const insert = (title: string, project: string | null, state: string, daysAgo: number) =>
      c.query(
        `insert into public.tasks (id, space_id, project_id, title, state, priority, estimate_min, sort_key, completed_at, updated_at, last_touched_at)
         values (gen_random_uuid(), $3, $4, $5, $6, 0, 30, 'a0', case when $6 = 'done' then ${noon(daysAgo)} end, ${noon(daysAgo)}, ${noon(daysAgo)})`,
        [me.today, me.timezone, me.sid, project, title, state],
      );
    await insert(T.yesterday, projectId, "done", 1);
    await insert(T.earlier, projectId, "done", 2);
    await insert(T.loose, null, "done", 1);
    await insert(T.dropped, projectId, "dropped", 1);

    // The fortnight's ratings: the account's own cleared for now, then four of the spec's (two days ago left unrated).
    saved = await saveDayPlans(c, me, isoPlus(me.today, -13), me.today);
    await c.query("update public.day_plans set day_rating = null where id = any($1::uuid[])", [saved.map((p) => p.id)]);
    for (const [ago, rating, highlight] of [
      [1, 4, HIGHLIGHT],
      [3, 2, null],
      [4, 5, null],
      [5, 3, null],
    ] as const) {
      const id = await rateDay(c, me, isoPlus(me.today, -ago), rating, highlight);
      if (id) made.push(id);
    }
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await restoreDayPlans(c, saved, made);
    await c.query("delete from public.tasks where title = any($1)", [Object.values(T)]);
    if (projectId) await c.query("delete from public.projects where id = $1", [projectId]);
    if (areaId) await c.query("delete from public.areas where id = $1", [areaId]);
  });
});

const row = (page: Page, title: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: title });
/** A Logbook day: its header, its line, its rows. */
const day = (page: Page, title: string) => page.getByRole("main").locator("section").filter({ has: page.getByRole("listitem").filter({ hasText: title }) });

test("project and Done | Dropped narrow the Logbook and its day counts; the filters live in the URL; Escape takes off the newest", async ({ page }) => {
  await openApp(page, "/logbook");
  await expect(row(page, T.yesterday)).toBeVisible();
  await expect(row(page, T.loose)).toBeVisible();

  await page.getByRole("button", { name: "Filter by project" }).click();
  await page.getByRole("menu", { name: "Filter by project" }).getByRole("menuitem", { name: `#${projectName}` }).click();
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  await expect(page.getByRole("button", { name: `Remove filter #${projectName}` })).toBeVisible();
  await expect(row(page, T.yesterday)).toBeVisible();
  await expect(row(page, T.earlier)).toBeVisible();
  await expect(row(page, T.loose)).toHaveCount(0);
  // The day's header counts what is left: one task of 30 minutes.
  await expect(day(page, T.yesterday).getByRole("heading").first()).toContainText("1 done · 30m");

  // Dropped on its own: the dropped task is the list.
  await page.getByRole("radiogroup", { name: "Show" }).getByRole("radio", { name: "Dropped" }).click();
  await expect(page).toHaveURL(/show=dropped/);
  await expect(row(page, T.dropped)).toBeVisible();
  await expect(row(page, T.yesterday)).toHaveCount(0);

  // Escape takes off the newest filter (Dropped), then the project.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/show=/);
  await expect(row(page, T.yesterday)).toBeVisible();
  await expect(row(page, T.loose)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/project=/);
  await expect(row(page, T.loose)).toBeVisible();

  // Opened from a URL, the filters are there: the area takes in its projects' tasks.
  await openApp(page, `/logbook?area=${areaId}&show=done`);
  await expect(page.getByRole("button", { name: `Remove filter ${areaName}` })).toBeVisible();
  await expect(row(page, T.yesterday)).toBeVisible();
  await expect(row(page, T.loose)).toHaveCount(0);
  await expect(row(page, T.dropped)).toHaveCount(0);
});

test("a day the shutdown rated carries its rating and highlight under its header; other days show nothing", async ({ page }) => {
  await openApp(page, `/logbook?project=${projectId}`);
  await expect(day(page, T.yesterday)).toContainText(`Rated 4/5 · Highlight: ${HIGHLIGHT}`);
  await expect(day(page, T.earlier)).toBeVisible();
  await expect(day(page, T.earlier).getByText(/^Rated|Highlight:/)).toHaveCount(0);
});

/** Walks the shutdown to its rating step (carrying is its own choice: Next writes nothing). */
async function toRating(page: Page) {
  await openApp(page, "/shutdown");
  const scale = page.getByRole("radiogroup", { name: "Day rating" });
  for (let i = 0; i < 4 && !(await scale.isVisible()); i++) await page.getByRole("button", { name: /^Next/ }).first().click();
  await expect(scale).toBeVisible();
}

test("the rating step draws the 14-day trend once 5 days are rated, with its summary in words, and nothing before", async ({ page }) => {
  // Four rated days to start from (run once or again).
  await withDb(async (c) => {
    const id = await rateDay(c, me, isoPlus(me.today, -6), null, null);
    if (id) made.push(id);
  });
  // Four rated days: no chart, no empty frame.
  await toRating(page);
  await expect(page.getByText(/days rated/)).toHaveCount(0);
  await expect(page.locator("figure")).toHaveCount(0);

  // A fifth: the line, ink only, with the summary under it.
  await withDb(async (c) => {
    const id = await rateDay(c, me, isoPlus(me.today, -6), 4, null);
    if (id) made.push(id);
  });
  await toRating(page);
  const trend = page.locator("figure").filter({ hasText: "days rated" });
  await expect(trend).toBeVisible();
  await expect(trend.locator("figcaption")).toHaveText("5 of the last 14 days rated, from 2 to 5, averaging 3.6.");
  // A dot for each rated day, the drawing hidden from assistive tech.
  await expect(trend.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(trend.locator("svg circle")).toHaveCount(5);
});
