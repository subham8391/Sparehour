// Menus on a phone (SCREENS.md §3, §8, §24, DESIGN_SYSTEM.md §4a, as built 2026-10-07): below 640 px a row's ⋯ is a
// bottom sheet — at the screen's bottom edge, above the tab bar and the FAB, 48 px rows — that a choice, Escape or
// the scrim closes, handing focus back to the ⋯. Its Move to… is a sheet of days, its Move to project… a picker
// sheet of 44 px rows. The Logbook's filters sit behind a Filter button, in a sheet of 44 px rows, and stay in the
// URL.
//
// The tasks live in projects of the spec's own, so the lists hold only them however crowded the account is.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, seedKey, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `p${Date.now().toString(36)}`;
const home = `${E2E_PREFIX}phone menus ${n}`;
const dest = `${E2E_PREFIX}phone dest ${n}`;
const T = {
  sheet: `${E2E_PREFIX}phone sheet ${n}`,
  days: `${E2E_PREFIX}phone days ${n}`,
  filed: `${E2E_PREFIX}phone filed ${n}`,
  done: `${E2E_PREFIX}phone done ${n}`,
  doneElsewhere: `${E2E_PREFIX}phone done elsewhere ${n}`,
};

let me: DevAccount;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    for (const [key, name, sort] of [
      ["home", home, "97"],
      ["dest", dest, "98"],
    ] as const) {
      ids[key] = (
        await c.query<{ id: string }>("insert into public.projects (id, space_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, 'active', $3) returning id", [me.sid, name, seedKey(sort)])
      ).rows[0].id;
    }
    for (const [i, title] of [T.sheet, T.days, T.filed].entries()) {
      await c.query("insert into public.tasks (id, space_id, project_id, title, state, priority, estimate_min, sort_key) values (gen_random_uuid(), $1, $2, $3, 'active', 0, 20, $4)", [
        me.sid,
        ids.home,
        title,
        `a${i}`,
      ]);
    }
    // Finished yesterday at noon in the account's zone: one in the spec's project, one in none.
    for (const [title, project] of [
      [T.done, ids.home],
      [T.doneElsewhere, null],
    ] as const) {
      await c.query(
        `insert into public.tasks (id, space_id, project_id, title, state, priority, estimate_min, sort_key, completed_at)
         values (gen_random_uuid(), $1, $2, $3, 'done', 0, 30, 'a9', ((($4::date - 1) + time '12:00') at time zone $5))`,
        [me.sid, project, title, me.today, me.timezone],
      );
    }
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.tasks where title = any($1) or project_id = any($2::uuid[])", [Object.values(T), [ids.home, ids.dest].filter(Boolean)]);
    await c.query("delete from public.projects where id = any($1::uuid[])", [[ids.home, ids.dest].filter(Boolean)]);
  });
});

/** The spec's open tasks back in its project with no day (each test starts from there, run once or again). */
const reset = () =>
  withDb((c) => c.query("update public.tasks set project_id = $2, do_date = null, do_time = null, evening = false where title = any($1)", [[T.sheet, T.days, T.filed], ids.home]));

const row = (page: Page, title: string) => page.getByRole("main").getByRole("row").filter({ hasText: title });

/** Whether a point at the element's middle lands on the element itself: nothing (the tab bar, the FAB) covers it. */
const uncovered = (el: Element) => {
  const r = el.getBoundingClientRect();
  return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
};

test("a row's ⋯ is a bottom sheet of 48 px rows above the tab bar; Escape, the scrim and a choice close it and focus goes back to the ⋯", async ({ page }) => {
  await reset();
  await openApp(page, `/project/${ids.home}`);
  const vp = page.viewportSize()!;
  const trigger = row(page, T.sheet).getByRole("button", { name: "More actions" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "More actions" });
  await expect(menu).toBeVisible();
  // The presets are there, in the same sheet.
  await expect(menu.getByRole("menuitem", { name: "In 4 hours", exact: true })).toBeVisible();
  const items = menu.getByRole("menuitem");
  for (let i = 0; i < (await items.count()); i++) {
    const box = (await items.nth(i).boundingBox())!;
    expect(box.height, `item ${i} is a 48 px row`).toBeGreaterThanOrEqual(47.5);
  }
  // At the bottom edge, and its last row is not under the tab bar or the FAB.
  const last = items.last();
  await last.scrollIntoViewIfNeeded();
  expect(await last.evaluate(uncovered)).toBe(true);
  const sheet = (await menu.boundingBox())!;
  expect(sheet.y + sheet.height).toBeGreaterThan(vp.height - 80);

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // A tap on the scrim, above the sheet.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(vp.width / 2, 24);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // A choice does what it says and closes the sheet.
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Tomorrow", exact: true }).click();
  await expect(menu).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date = $2::date", [T.sheet, isoPlus(me.today, 1)])).not.toBeNull();
  await expect(trigger).toBeFocused();
});

test("from the row's ⋯, Move to… is a sheet of days and Move to project… a picker sheet of 44 px rows", async ({ page }) => {
  await reset();
  await openApp(page, `/project/${ids.home}`);
  await row(page, T.days).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menu", { name: "More actions" }).getByRole("menuitem", { name: "Move to…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Move to…" });
  await expect(picker).toContainText(`For “${T.days}”`);
  const days = picker.getByRole("button", { name: /^(Today|Tomorrow|\w{3} \d+)/ });
  await expect(days).toHaveCount(7);
  for (let i = 0; i < 7; i++) expect((await days.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await days.nth(2).click();
  await expect(picker).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and do_date = $2::date", [T.days, isoPlus(me.today, 2)])).not.toBeNull();

  await row(page, T.filed).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menu", { name: "More actions" }).getByRole("menuitem", { name: "Move to project…", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Move this task to a project" });
  await expect(sheet).toBeVisible();
  const options = sheet.getByRole("option");
  for (let i = 0; i < Math.min(5, await options.count()); i++) expect((await options.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByRole("combobox").fill(dest);
  await sheet.getByRole("option", { name: dest }).click();
  await expect(sheet).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and project_id = $2", [T.filed, ids.dest])).not.toBeNull();
  await expect(row(page, T.filed)).toHaveCount(0);
});

test("the Logbook's Filter button opens a sheet of 44 px rows; a project narrows the list, the button counts it, and the URL keeps it", async ({ page }) => {
  await openApp(page, "/logbook");
  await expect(row(page, T.done)).toBeVisible();
  await expect(row(page, T.doneElsewhere)).toBeVisible();
  // Inline filters are for wider screens: here there is the one button.
  await expect(page.getByRole("radiogroup", { name: "Show" })).toBeHidden();
  await page.getByRole("button", { name: /^Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter the Logbook" });
  const choice = sheet.getByRole("radio", { name: `#${home}` });
  await choice.scrollIntoViewIfNeeded();
  expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await choice.click();
  await expect(choice).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveURL(new RegExp(`project=${ids.home}`));
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row(page, T.done)).toBeVisible();
  await expect(row(page, T.doneElsewhere)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Filter/ })).toContainText("· 1");
  await expect(page.getByRole("button", { name: `Remove filter #${home}` })).toBeVisible();
});
