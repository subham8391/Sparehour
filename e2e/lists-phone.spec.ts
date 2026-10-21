// Lists on a phone (DECISIONS.md, amendment 2026-10-22): Browse lists them with what each holds and "Add list"; a
// list has no task add bar or FAB (its own add row instead); an item opens as a bottom sheet; a row's ⋯ is the tap
// path to Move up, and "Pick one for me" picks an open item. The spec's rows are its own and removed in afterAll.
import { expect, test } from "./fixtures";
import { devAccount, seedKey, waitForRow, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `p${Date.now().toString(36)}`;
const list = `${E2E_PREFIX}Books ${n}`;
const first = `${E2E_PREFIX}Dune ${n}`;
const second = `${E2E_PREFIX}Piranesi ${n}`;

test.beforeAll(async () => {
  await withDb(async (c) => {
    const me = await devAccount(c, DEV_USER.email);
    const id = (await c.query<{ id: string }>("insert into public.lists (id, space_id, name, emoji, sort_key) values (gen_random_uuid(), $1, $2, '📚', $3) returning id", [me.sid, list, seedKey("91")])).rows[0].id;
    await c.query("insert into public.list_items (id, space_id, list_id, title, sort_key) values (gen_random_uuid(), $1, $2, $3, 'a0'), (gen_random_uuid(), $1, $2, $4, 'a1')", [me.sid, id, first, second]);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.lists where name = $1", [list]);
  });
});

test("Browse lists them; a list's item opens as a sheet and its ⋯ moves it up", async ({ page }) => {
  await openApp(page, "/browse");
  const row = page.getByRole("link", { name: new RegExp(`${list}.*2 items`) });
  await expect(row).toBeVisible();
  await expect(page.getByRole("link", { name: "Add list" })).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { name: list })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a task" })).toHaveCount(0);

  await page.getByRole("button", { name: second, exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("radiogroup", { name: "Rating" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: `Actions for ${second}` }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect(page.locator("[data-list-item]").first()).toContainText(second);
  expect(
    await waitForRow(`select 1 from public.list_items a, public.list_items b where a.title = $1 and b.title = $2 and a.sort_key collate "C" < b.sort_key collate "C"`, [second, first]),
  ).not.toBeNull();

  await page.getByRole("button", { name: "Pick one for me" }).click();
  await expect(page.getByRole("dialog")).toContainText(new RegExp(`${first}|${second}`));
});
