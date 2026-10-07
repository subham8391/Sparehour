// The row ⋯ menu on a desktop (SCREENS.md §3, §24, as built 2026-10-07): the action zone ends in "More actions",
// which holds every row action. `.` opens the selected row's menu with focus on its first item, the arrows,
// Home and End move through it, and Escape closes it and hands focus back to the row's ⋯. An open task's menu
// lists the snooze presets — This evening · Tomorrow · In 4 hours · This weekend · Next week — each the palette's
// own write with an undo toast, then Move to…, the day picker: the next seven days, then Pick a date. The
// palette's "Move to…" opens the same picker for the selected row.
//
// The tasks live in a project of the spec's own, so its list holds only them however crowded the account is.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, seedKey, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle, weekday } from "./helpers";

const projectName = uniqueTitle("row menu");
const keyed = uniqueTitle("menu keys");
const presets = {
  evening: uniqueTitle("menu evening"),
  tomorrow: uniqueTitle("menu tomorrow"),
  in4h: uniqueTitle("menu in four hours"),
  weekend: uniqueTitle("menu weekend"),
  nextweek: uniqueTitle("menu next week"),
};
const picked = uniqueTitle("menu move to");
const typed = uniqueTitle("menu pick a date");

let me: DevAccount;
let projectId = "";

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    projectId = (
      await c.query<{ id: string }>("insert into public.projects (id, space_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, 'active', $3) returning id", [
        me.sid,
        projectName,
        seedKey("81"),
      ])
    ).rows[0].id;
    const titles = [keyed, ...Object.values(presets), picked, typed];
    for (const [i, title] of titles.entries()) {
      await c.query("insert into public.tasks (id, space_id, project_id, title, state, priority, estimate_min, sort_key) values (gen_random_uuid(), $1, $2, $3, 'active', 0, 20, $4)", [
        me.sid,
        projectId,
        title,
        `a${i}`,
      ]);
    }
  });
});

test.afterAll(async () => {
  if (!projectId) return;
  await withDb(async (c) => {
    await c.query("delete from public.tasks where project_id = $1", [projectId]);
    await c.query("delete from public.projects where id = $1", [projectId]);
  });
});

/** Every task of the spec's project back to no day (each test starts from there, run once or again). */
const undated = () => withDb((c) => c.query("update public.tasks set do_date = null, do_time = null, evening = false where project_id = $1", [projectId]));

const row = (page: Page, title: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: title });

/** Selects a row the way a person does: its title opens the detail, Esc closes it and the selection stays. */
async function select(page: Page, title: string) {
  const r = row(page, title);
  await r.getByRole("button", { name: title, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(r).toHaveAttribute("aria-current", "true");
  return r;
}

/** The row's ⋯, revealed by the pointer as a person reaches for it. */
async function openMenu(page: Page, title: string) {
  const r = row(page, title);
  await r.hover();
  await r.getByRole("button", { name: "More actions" }).click();
  const menu = page.getByRole("menu", { name: "More actions" });
  await expect(menu).toBeVisible();
  return menu;
}

test("`.` opens the selected row's menu on its first item; the arrows move, and Escape hands focus back to the row's ⋯", async ({ page }) => {
  await undated();
  await openApp(page, `/project/${projectId}`);
  const r = await select(page, keyed);
  await page.keyboard.press(".");
  const menu = page.getByRole("menu", { name: "More actions" });
  await expect(menu).toBeVisible();
  const items = menu.getByRole("menuitem");
  await expect(items.first()).toBeFocused();
  // Every row action is here: the presets, Move to…, and organising.
  for (const name of ["This evening", "Tomorrow", "In 4 hours", "This weekend", "Next week", "Move to…", "Move to project…", "Add a tag…", "Duplicate", "Copy link"]) {
    await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(r.getByRole("button", { name: "More actions" })).toBeFocused();
  // Nothing was chosen, so nothing moved.
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date is null", [keyed])).not.toBeNull();
});

test("each snooze preset in the menu writes the palette's patch, with its undo toast", async ({ page }) => {
  await undated();
  await openApp(page, `/project/${projectId}`);
  const today = me.today;
  const saturday = isoPlus(today, (6 - weekday(today) + 7) % 7 || 7);
  const monday = isoPlus(today, (1 - weekday(today) + 7) % 7 || 7);
  const cases: [string, string, string, unknown[]][] = [
    [presets.evening, "This evening", "do_date = $2::date and evening and do_time is null", [today]],
    [presets.tomorrow, "Tomorrow", "do_date = $2::date and not evening and do_time is null", [isoPlus(today, 1)]],
    // Four hours from now in the account's zone, rounded up to five minutes.
    [
      presets.in4h,
      "In 4 hours",
      "not evening and (do_date + do_time) at time zone $2 between now() + interval '3 hours 55 minutes' and now() + interval '4 hours 10 minutes'",
      [me.timezone],
    ],
    [presets.weekend, "This weekend", "do_date = $2::date and not evening and do_time is null", [saturday]],
    [presets.nextweek, "Next week", "do_date = $2::date and not evening and do_time is null", [monday]],
  ];
  for (const [title, label, where, params] of cases) {
    const menu = await openMenu(page, title);
    await menu.getByRole("menuitem", { name: label, exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: `Moved “${title}” to ${label.toLowerCase()}` }).first()).toBeVisible();
    // A do-date the person picked never counts as a carry.
    const written = await waitForRow(`select 1 from public.tasks where title = $1 and carry_count = 0 and ${where}`, [title, ...params]);
    const found = written ?? (await withDb(async (c) => (await c.query("select do_date::text, do_time::text, evening, carry_count, now()::text as now from public.tasks where title = $1", [title])).rows[0]));
    expect(written, `${label}: ${JSON.stringify(found)}`).not.toBeNull();
  }

  // The last toast's Undo takes that one back.
  await page
    .getByRole("status")
    .filter({ hasText: `Moved “${presets.nextweek}” to next week` })
    .first()
    .getByRole("button", { name: "Undo" })
    .click();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date is null", [presets.nextweek])).not.toBeNull();
});

test("Move to… opens the day picker beside the ⋯: the next seven days, then Pick a date; the palette's Move to… opens it too", async ({ page }) => {
  await undated();
  await openApp(page, `/project/${projectId}`);
  const menu = await openMenu(page, picked);
  await menu.getByRole("menuitem", { name: "Move to…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Move to…" });
  await expect(picker).toContainText(`For “${picked}”`);
  const days = picker.getByRole("button");
  // Focus moves to the first day; seven days: Today, Tomorrow, then the weekday and the date.
  await expect(days.first()).toBeFocused();
  await expect(days.nth(0)).toHaveText(/^Today/);
  await expect(days.nth(1)).toHaveText(/^Tomorrow/);
  const target = isoPlus(me.today, 3);
  const name = `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday(target)]} ${Number(target.slice(8))}`;
  // The name, then the day's readout ("Sat 10" and "3h spare", or "no working hours").
  await expect(days.nth(3)).toHaveText(new RegExp(`^${name}(?!\\d)`));
  await days.nth(3).click();
  await expect(picker).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date = $2::date", [picked, target])).not.toBeNull();
  await expect(page.getByRole("status").filter({ hasText: picked }).first()).toBeVisible();

  // By keyboard: the palette's Move to… on the selected row, and a typed date.
  await select(page, typed);
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox", { name: "Search or run a command" }).fill("Move to…");
  await expect(palette.getByRole("option", { selected: true })).toHaveText(/^Move to…/);
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  const again = page.getByRole("dialog", { name: "Move to…" });
  await expect(again).toContainText(`For “${typed}”`);
  const later = isoPlus(me.today, 9);
  await again.getByLabel(`Pick a date for ${typed}`).fill(later);
  await expect(again).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date = $2::date", [typed, later])).not.toBeNull();
});

