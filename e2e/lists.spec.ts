// Lists (DECISIONS.md, amendment 2026-10-22): a list made on the Lists page opens; a list inside it shows the path
// above its name and sits under its parent in the sidebar; a pasted block becomes one item a line; the ring moves an
// item to doing and done; the item's sheet keeps a rating, a link and a tag; "Turn into a task" leaves the item and
// adds an Inbox task; the sort is the list's own; deleting the parent takes its list and items, and Undo brings them
// back. Every name here starts with "E2E ", so afterAll and the teardown remove them.
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { E2E_PREFIX, openApp } from "./helpers";

const n = `l${Date.now().toString(36)}`;
const parent = `${E2E_PREFIX}Anime ${n}`;
const child = `${E2E_PREFIX}Action ${n}`;
const titles = [`${E2E_PREFIX}Attack on Titan ${n}`, `${E2E_PREFIX}Jujutsu Kaisen ${n}`, `${E2E_PREFIX}Demon Slayer ${n}`];

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.list_items where title like $1", [`%${n}`]);
    await c.query("delete from public.lists where name like $1", [`%${n}`]);
    await c.query("delete from public.tasks where title like $1", [`%${n}`]);
    await c.query("delete from public.tags where name = $1", [`e2e-${n}`]);
  });
});

test("a list holds lists and items: paste many, status, rating, link, tag, to a task, sort, delete and undo", async ({ page }) => {
  // The sidebar's "+" opens the Lists page's form.
  await openApp(page, "/today");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Add list" }).click();
  const name = page.getByRole("textbox", { name: "List name" });
  await name.fill(parent);
  await name.press("Enter");
  await expect(page).toHaveURL(/\/list\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: parent })).toBeVisible();

  // A list inside it: the path above its name, and the parent's chevron in the sidebar folds it out.
  await page.getByRole("button", { name: "List actions" }).click();
  await page.getByRole("menuitem", { name: "New list inside" }).click();
  const sub = page.getByRole("textbox", { name: "New list name" });
  await sub.fill(child);
  await sub.press("Enter");
  await expect(page.getByRole("heading", { name: child })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Where this list is" }).getByRole("link", { name: parent })).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Main" });
  await sidebar.getByRole("button", { name: `Expand ${parent}` }).click();
  await expect(sidebar.getByRole("link", { name: child })).toHaveAttribute("aria-current", "page");

  // A pasted block: one item a line, the numbers and bullets taken off.
  const add = page.getByRole("textbox", { name: `Add to ${child}` });
  await add.focus();
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, `1. ${titles[0]}\n2. ${titles[1]}\n- ${titles[2]}\n`);
  for (const t of titles) await expect(page.getByRole("button", { name: t, exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Added 3 items" })).toBeVisible();

  // The ring: to do → doing → done.
  await page.getByRole("button", { name: new RegExp(`^${titles[2]}: To do`) }).click();
  await page.getByRole("button", { name: new RegExp(`^${titles[2]}: Doing`) }).click();
  expect(await waitForRow("select status from public.list_items where title = $1 and status = 'done'", [titles[2]])).not.toBeNull();

  // The sheet: a rating, a link (https added), a tag.
  await page.getByRole("button", { name: titles[0], exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: "4 stars" }).click();
  const link = sheet.getByRole("textbox", { name: "Link" });
  await link.fill("myanimelist.net/anime/16498");
  await link.press("Enter");
  const tag = sheet.getByRole("combobox", { name: "Add a tag" });
  await tag.fill(`@e2e-${n}`);
  await tag.press("Enter");
  await expect(sheet.getByText(`@e2e-${n}`)).toBeVisible();
  expect(
    await waitForRow("select rating, url from public.list_items where title = $1 and rating = 4 and url = 'https://myanimelist.net/anime/16498'", [titles[0]]),
  ).not.toBeNull();

  // Turn into a task: an Inbox task with the link in its notes; the item stays.
  await sheet.getByRole("button", { name: "Turn into a task" }).click();
  await expect(sheet.getByRole("button", { name: "Added to the Inbox" })).toHaveAttribute("aria-disabled", "true");
  const task = await waitForRow<{ notes_md: string }>("select notes_md from public.tasks where title = $1 and deleted_at is null and project_id is null and area_id is null", [titles[0]]);
  expect(task?.notes_md).toContain("https://myanimelist.net/anime/16498");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(`^${titles[0]}`) }).last()).toBeVisible();

  // The sort is the list's own: by name puts Attack, Demon, Jujutsu in that order; "Done" shows only the finished.
  await page.getByRole("combobox", { name: "Sort items" }).selectOption("name");
  expect(await waitForRow("select 1 from public.lists where name = $1 and item_order = 'name'", [child])).not.toBeNull();
  await page.getByRole("radio", { name: "Done" }).click();
  await expect(page.locator("[data-list-item]")).toHaveCount(1);
  await page.getByRole("radio", { name: "All" }).click();
  await expect(page.locator("[data-list-item]")).toHaveCount(3);

  // Deleting the parent takes its list and items, after saying so; Undo puts them back.
  await page.getByRole("navigation", { name: "Where this list is" }).getByRole("link", { name: parent }).click();
  await expect(page.getByRole("heading", { name: parent })).toBeVisible();
  await page.getByRole("button", { name: "List actions" }).click();
  await page.getByRole("menuitem", { name: "Delete list…" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("1 list and 3 items inside it go too.");
  await confirm.getByRole("button", { name: "Delete list" }).click();
  await expect(page).toHaveURL(/\/lists$/);
  expect(await waitForRow("select 1 from public.list_items where title = $1 and deleted_at is not null", [titles[1]])).not.toBeNull();
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: new RegExp(parent) })).toBeVisible();
  expect(await waitForRow("select 1 from public.list_items where title = $1 and deleted_at is null", [titles[1]])).not.toBeNull();
});
