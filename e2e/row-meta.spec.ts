// A row's quiet facts on a pointer device (SCREENS.md §2.4, §9; PRODUCT_SPEC.md §8.1, §9.2): the priority mark, the
// tags from the list's own query, the dashed estimate guess in the account's default with its presets in place (and
// E on the selected row), and a project task not started yet shown dimmed with the day it starts.
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, restoreSettings, saveSettings, seedKey, waitForRow, withDb, type DevAccount, type SavedSettings } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `m${Date.now().toString(36)}`;
const T = { today: `${E2E_PREFIX}meta today ${n}`, keyed: `${E2E_PREFIX}meta keyed ${n}`, later: `${E2E_PREFIX}meta later ${n}` };
const project = `${E2E_PREFIX}meta ${n}`;
const tag = `e2e${n}`;
let me: DevAccount;
let saved: SavedSettings | null = null;
let projectId = "";
const TASK = "select id from public.tasks where title = $1";

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    saved = await saveSettings(c, me, ["default_estimate_min"]);
    await c.query("update public.user_settings set default_estimate_min = 45 where user_id = $1", [me.uid]);
    projectId = (await c.query<{ id: string }>("insert into public.projects (id, space_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, 'active', $3) returning id", [me.sid, project, seedKey("95")])).rows[0].id;
    const add = async (title: string, extra: { do_date?: string; start_date?: string; project_id?: string; priority?: number }) =>
      (
        await c.query<{ id: string }>(
          `insert into public.tasks (id, space_id, project_id, title, state, priority, do_date, start_date, sort_key, day_sort_key)
           values (gen_random_uuid(), $1, $2, $3, 'active', $4, $5, $6, $7, $7) returning id`,
          [me.sid, extra.project_id ?? null, title, extra.priority ?? 0, extra.do_date ?? null, extra.start_date ?? null, seedKey("0")],
        )
      ).rows[0].id;
    const today = await add(T.today, { do_date: me.today, priority: 3 });
    await add(T.keyed, { project_id: projectId });
    await add(T.later, { project_id: projectId, start_date: isoPlus(me.today, 9) });
    const tagId = (await c.query<{ id: string }>("insert into public.tags (id, space_id, name) values (gen_random_uuid(), $1, $2) returning id", [me.sid, tag])).rows[0].id;
    await c.query("insert into public.task_tags (id, space_id, task_id, tag_id) values (gen_random_uuid(), $1, $2, $3)", [me.sid, today, tagId]);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => restoreSettings(c, me, saved));
});

test("a Today row: the !1 mark, its tag, the guess in the account's default and the presets from the chip", async ({ page }) => {
  await openApp(page, "/today");
  const row = page.getByRole("row").filter({ hasText: T.today });
  await expect(row.getByRole("img", { name: "priority 1" })).toHaveText("!!");
  await expect(row.getByText(`@${tag}`)).toBeVisible();
  const chip = row.getByRole("button", { name: "No estimate — counted as 45m" });
  await expect(chip).toHaveText("45m?");
  await chip.click();
  const presets = page.getByRole("dialog", { name: "Estimate" });
  await expect(presets.getByRole("button", { name: /^\d/ })).toHaveText(["15m", "30m", "45m", "1h", "1h 30m", "2h", "3h", "4h"]);
  await presets.getByRole("button", { name: "1h 30m", exact: true }).click();
  expect(await waitForRow(`${TASK} and estimate_min = 90`, [T.today])).not.toBeNull();
  await expect(row.getByRole("button", { name: "Estimate 1h 30m" })).toBeVisible();
});

test("a project: E on the selected row opens the same presets; a task not started yet is dimmed with its start day", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const later = page.getByRole("row").filter({ hasText: T.later });
  await expect(later.getByText(/^Starts /)).toBeVisible();
  await expect(later.getByText(T.later)).toHaveClass(/\btext-ink-3\b/);

  // Select the row the way a pointer does (its title opens the detail too; Escape closes that and keeps the selection).
  const keyed = page.getByRole("row").filter({ hasText: T.keyed });
  await keyed.getByRole("button", { name: T.keyed, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(keyed).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("e");
  const presets = page.getByRole("dialog", { name: "Estimate" });
  await expect(presets.getByRole("spinbutton", { name: "Minutes" })).toBeFocused();
  await presets.getByRole("button", { name: "15m", exact: true }).click();
  expect(await waitForRow(`${TASK} and estimate_min = 15`, [T.keyed])).not.toBeNull();
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
});
