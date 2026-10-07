// The shell's panes on a wide screen (SCREENS.md §1 "Sidebar" and "Context pane", §12 View, §24; DECISIONS.md
// "Medium and narrow Today"): Cmd+\ folds the sidebar to the rail and the choice survives a reload; Cmd+. puts
// Today's day pane away and back (and closes the open task first), and elsewhere closes and reopens the task
// detail; the context pane's edge resizes it with the keyboard and a drag, remembered per view. Runs in the
// desktop project (1280 × 720: the wide band).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, removeOwn, seedKey, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `s${Date.now().toString(36)}`;
const T = { today: `${E2E_PREFIX}shell today ${n}`, inbox: `${E2E_PREFIX}shell inbox ${n}` };

test.beforeAll(async () => {
  await withDb(async (c) => {
    const me = await devAccount(c, DEV_USER.email);
    const add = (title: string, state: string, doDate: string | null) =>
      c.query("insert into public.tasks (id, space_id, title, state, do_date, sort_key) values (gen_random_uuid(), $1, $2, $3, $4, $5)", [me.sid, title, state, doDate, seedKey("97")]);
    await add(T.today, "active", me.today);
    await add(T.inbox, "inbox", null);
  });
});
test.afterAll(async () => {
  await withDb((c) => removeOwn(c, Object.values(T)));
});

const fullNav = (page: Page) => page.locator('nav[data-variant="full"]');
const railNav = (page: Page) => page.locator('nav[data-variant="rail"]');
const taskPane = (page: Page) => page.getByRole("complementary", { name: "Task" });
const dayPane = (page: Page) => page.getByRole("complementary", { name: "Your day" });
const width = async (page: Page, name: string) => (await page.getByRole("complementary", { name }).boundingBox())!.width;
/** Opens a task's detail from its row's title, as a click does on a desktop. */
async function openTask(page: Page, title: string) {
  await page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: title, exact: true }).click();
  await expect(taskPane(page).getByRole("textbox", { name: "Title" })).toHaveValue(title);
}

test("Cmd+\\ folds the sidebar to the rail and opens it again; the button does the same; a reload keeps the choice", async ({ page }) => {
  await openApp(page, "/inbox");
  await expect(fullNav(page)).toBeVisible();
  await expect(railNav(page)).toBeHidden();

  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(fullNav(page)).toBeHidden();
  await expect(railNav(page)).toBeVisible();
  // The rail names every view, Inbox and Today with their counts.
  await expect(railNav(page).getByRole("link", { name: /^Inbox/ })).toHaveAttribute("title", "Inbox");
  await expect(railNav(page).getByRole("link", { name: /^Today/ })).toBeVisible();

  // The choice is this device's and is stamped before the first paint: no flash of the full sidebar.
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.sidebar)).toBe("rail");
  await expect(railNav(page)).toBeVisible();
  await expect(fullNav(page)).toBeHidden();

  // Expand sidebar, and focus lands on the full sidebar's own toggle rather than on the page.
  await railNav(page).getByRole("button", { name: "Expand sidebar" }).click();
  await expect(fullNav(page)).toBeVisible();
  await expect(fullNav(page).getByRole("button", { name: "Collapse sidebar" })).toBeFocused();
  await fullNav(page).getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(railNav(page).getByRole("button", { name: "Expand sidebar" })).toBeFocused();

  // The palette lists it under View.
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByPlaceholder("Search or run a command…").fill("Toggle sidebar");
  await page.keyboard.press("Enter");
  await expect(fullNav(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sparehour.sidebar"))).toBeNull();
});

test("Cmd+. on Today puts the day pane away and back, remembered; with a task open it closes the task first", async ({ page }) => {
  await openApp(page, "/today");
  const day = dayPane(page);
  test.skip((await day.count()) === 0, "not a working day: no day pane");
  await expect(day).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Period");
  await expect(day).toBeHidden();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: T.today })).toBeVisible();
  await expect(dayPane(page)).toBeHidden();
  await page.keyboard.press("ControlOrMeta+Period");
  await expect(dayPane(page)).toBeVisible();

  // ⋯ › Show timeline is the same switch, for a pointer.
  await page.getByRole("button", { name: "Today options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Show timeline" }).click();
  await expect(dayPane(page)).toBeHidden();
  await page.getByRole("button", { name: "Today options" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Show timeline" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("menuitemcheckbox", { name: "Show timeline" }).click();
  await expect(dayPane(page)).toBeVisible();

  // A task open in the pane's place: Cmd+. closes it and puts the pane away; again brings the day back.
  await openTask(page, T.today);
  await expect(dayPane(page)).toBeHidden();
  await page.keyboard.press("ControlOrMeta+Period");
  await expect(taskPane(page)).toHaveCount(0);
  await expect(dayPane(page)).toBeHidden();
  await page.keyboard.press("ControlOrMeta+Period");
  await expect(dayPane(page)).toBeVisible();
});

test("Cmd+. elsewhere closes the open task and opens it again", async ({ page }) => {
  await openApp(page, "/inbox");
  await openTask(page, T.inbox);
  await page.keyboard.press("ControlOrMeta+Period");
  await expect(taskPane(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Period");
  await expect(taskPane(page).getByRole("textbox", { name: "Title" })).toHaveValue(T.inbox);
});

test("the task pane's edge resizes it from the keyboard and with a drag, kept per view and over a reload", async ({ page }) => {
  await openApp(page, "/inbox");
  await openTask(page, T.inbox);
  const edge = page.getByRole("separator", { name: "Resize the task pane" });
  await expect(edge).toHaveAttribute("aria-valuenow", "384");
  expect(Math.round(await width(page, "Task"))).toBe(384);

  await edge.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(edge).toHaveAttribute("aria-valuenow", "416");
  await expect.poll(async () => Math.round(await width(page, "Task"))).toBe(416);
  // The arrows were the edge's: the list's selection did not move.
  await expect(page.getByRole("row").filter({ hasText: T.inbox })).toBeVisible();

  // A drag to the left widens it, held inside the range.
  const box = (await edge.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 400, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(edge).toHaveAttribute("aria-valuenow", "560");
  // No sideways page scroll for it.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  await page.reload();
  await openTask(page, T.inbox);
  expect(Math.round(await width(page, "Task"))).toBe(560);

  // Another view keeps its own width.
  await page.goto("/someday");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("[data-view]")!).getPropertyValue("--pane-w"))).toBe("");

  // Enter puts the default back.
  await page.goto("/inbox");
  await openTask(page, T.inbox);
  await page.getByRole("separator", { name: "Resize the task pane" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => Math.round(await width(page, "Task"))).toBe(384);
});

test("Today's day pane has its own edge from the wide band", async ({ page }) => {
  await openApp(page, "/today");
  test.skip((await dayPane(page).count()) === 0, "not a working day: no day pane");
  const edge = page.getByRole("separator", { name: "Resize the day pane" });
  await expect(edge).toHaveAttribute("aria-valuenow", "344");
  await edge.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(edge).toHaveAttribute("aria-valuenow", "408");
  await expect.poll(async () => Math.round(await width(page, "Your day"))).toBe(408);
  await page.keyboard.press("Enter");
  await expect.poll(async () => Math.round(await width(page, "Your day"))).toBe(344);
});
