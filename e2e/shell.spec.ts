// The shell's panes on a wide screen (SCREENS.md §1 "Sidebar" and "Context pane", §12 View, §24; DECISIONS.md
// "Medium and narrow Today"): Cmd+\ folds the sidebar to the rail and the choice survives a reload; Cmd+. puts
// Today's day pane away and back (and closes the open task first), and elsewhere closes and reopens the task
// detail; the context pane's edge resizes it with the keyboard and a drag, remembered per view. Runs in the
// desktop project (1280 × 720: the wide band).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, removeOwn, seedKey, withDb } from "./db";
import { clickTitle, DEV_USER, E2E_PREFIX, openApp, waitForSync } from "./helpers";

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
  await clickTitle(page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: title, exact: true }));
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

// The sync chip's detail on the rail reaches over the main column; drawn inside the sidebar (sticky, a layer of its
// own) its lower half went under the add bar ("Storage not protected" lost its install steps).
test("the rail's sync detail is drawn over the main column, add bar included, and Escape closes it", async ({ page }) => {
  await openApp(page, "/inbox");
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(railNav(page)).toBeVisible();

  await railNav(page).locator("button[data-state]").click();
  const panel = page.getByRole("region", { name: "Sync status" });
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  const rail = (await railNav(page).boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(rail.x + rail.width + 100); // it does reach over the main column
  // Whatever is drawn topmost at each corner of the detail (the lower ones over the add bar's footer) is the detail itself.
  const points = [
    [box.x + 8, box.y + 8],
    [box.x + box.width - 8, box.y + 8],
    [box.x + 8, box.y + box.height - 8],
    [box.x + box.width - 8, box.y + box.height - 8],
  ];
  for (const [x, y] of points) {
    expect(await page.evaluate(([px, py]) => Boolean(document.elementFromPoint(px, py)?.closest('[aria-label="Sync status"]')), [x, y]), `${x},${y}`).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(fullNav(page)).toBeVisible();
});

// The fold moves (DESIGN_SYSTEM.md §7 "Sidebar"): the full sidebar's width runs down to the rail's and the rail comes
// in only then, so the two are never side by side and the view's edge moves one way; opening runs it back out. With
// reduced motion the two swap at once, and a load never animates the sidebar.
test("folding and opening the sidebar moves the view's edge one way, never draws both navs, and is instant with reduced motion", async ({ page }) => {
  await openApp(page, "/inbox");
  await expect(fullNav(page)).toBeVisible();
  // Every frame of one toggle, read in the page so a slow runner cannot miss the move.
  const run = (name: string) =>
    page.evaluate(async (name) => {
      const full = document.querySelector('nav[data-variant="full"]') as HTMLElement;
      const rail = document.querySelector('nav[data-variant="rail"]') as HTMLElement;
      const region = document.querySelector('[role="region"][aria-label="Content"]') as HTMLElement;
      const drawn = (el: Element) => getComputedStyle(el).display !== "none";
      // Focused first, as a keyboard user's toggle is, so focus has somewhere to move from.
      const toggle = document.querySelector(`nav [aria-label="${name}"]`) as HTMLElement;
      toggle.focus();
      toggle.click();
      const moves = full.getAnimations().some((a) => (a as CSSTransition).transitionProperty === "width");
      const edges: number[] = [];
      let both = false;
      const start = performance.now();
      while (performance.now() - start < 600) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        edges.push(Math.round(region.getBoundingClientRect().left));
        both ||= drawn(full) && drawn(rail);
      }
      return { moves, edges, both, sidebar: document.documentElement.dataset.sidebar ?? null };
    }, name);
  const oneWay = (edges: number[], down: boolean) => edges.every((e, i) => i === 0 || (down ? e <= edges[i - 1] : e >= edges[i - 1]));

  const fold = await run("Collapse sidebar");
  expect(fold.moves).toBe(true);
  expect(fold.both).toBe(false);
  expect(oneWay(fold.edges, true)).toBe(true);
  expect(fold.edges.at(-1)).toBeLessThan(fold.edges[0]);
  expect(fold.sidebar).toBe("rail");
  await expect(railNav(page).getByRole("button", { name: "Expand sidebar" })).toBeFocused();

  const open = await run("Expand sidebar");
  expect(open.moves).toBe(true);
  expect(open.both).toBe(false);
  expect(oneWay(open.edges, false)).toBe(true);
  expect(open.edges.at(-1)).toBe(fold.edges[0]);
  expect(open.sidebar).toBeNull();

  // A load draws the open sidebar still.
  await page.reload();
  await expect(fullNav(page)).toBeVisible();
  expect(await fullNav(page).evaluate((nav) => nav.getAnimations().length)).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const instant = await run("Collapse sidebar");
  expect(instant.moves).toBe(false);
  expect(new Set(instant.edges).size).toBe(1);
  expect(instant.sidebar).toBe("rail");
  await page.evaluate(() => localStorage.removeItem("sparehour.sidebar"));
});

test("Cmd+. on Today puts the day pane away and back, remembered; with a task open it closes the task first", async ({ page }) => {
  await openApp(page, "/today");
  const day = dayPane(page);
  test.skip((await day.count()) === 0, "not a working day: no day pane");
  await expect(day).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Period");
  await expect(day).toBeHidden();
  await page.reload();
  // A reload opens the local database and syncs again (pwa.spec.ts): the list is drawn after that.
  await waitForSync(page);
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
  await waitForSync(page);
  await openTask(page, T.inbox);
  expect(Math.round(await width(page, "Task"))).toBe(560);

  // Another view keeps its own width. The frame that carries the view is drawn once the local database is open.
  await page.goto("/someday");
  const someday = page.locator('[data-view="someday"]');
  await expect(someday).toBeAttached();
  expect(await someday.evaluate((el) => getComputedStyle(el).getPropertyValue("--pane-w"))).toBe("");

  // Enter puts the default back.
  await page.goto("/inbox");
  await waitForSync(page);
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
