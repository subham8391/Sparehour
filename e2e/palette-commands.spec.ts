// The last M1 package (P37): the searchable ? overlay grouped as SCREENS.md §24, the sidebar's pointer paths to the
// palette and the overlay, and a sample of the palette's newer commands — Export data, Sign out's confirmation in the
// palette, Add tag, Add time block, Clear the slate, Sync now, and Block it off Today.
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, waitForRow, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, openApp, quickAdd, uniqueTitle } from "./helpers";
import type { Page } from "@playwright/test";

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });
const field = (page: Page) => palette(page).getByRole("combobox", { name: "Search or run a command" });

/** ⌘K, the words, and Enter on the top match. */
async function runCommand(page: Page, words: string) {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toBeVisible();
  await field(page).fill(words);
  await expect(palette(page).getByRole("option", { selected: true })).toHaveText(new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  await page.keyboard.press("Enter");
}

test("the ? overlay is grouped as §24 and searchable by action or key; Esc clears the search, then closes", async ({ page }) => {
  await openApp(page, "/today");
  await page.keyboard.press("Shift+?");
  const overlay = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(overlay).toBeVisible();
  const list = overlay.getByRole("region", { name: "All shortcuts" });
  await expect(list.getByRole("heading", { level: 3 })).toHaveText([
    "Global",
    "Navigation (G then a key)",
    "List and selection",
    "Editing the selected task",
    "Scheduling and snooze",
    "Timeline and calendar",
    "Rituals and the day",
  ]);
  // The keys that are no command are there too, and the conflicts are noted under the key.
  await expect(list.getByText("Unwind one layer")).toBeVisible();
  await expect(list.getByText("Lock / unlock the selected block")).toBeVisible();
  await expect(list.getByText("Shift+S is the start date")).toBeVisible();

  const search = overlay.getByRole("searchbox", { name: "Search shortcuts" });
  await expect(search).toBeFocused();
  await search.fill("evening");
  await expect(list.getByRole("term")).toHaveCount(3);
  await expect(list.getByText("This evening")).toBeVisible();
  await search.fill("shift d");
  await expect(list.getByText("Deadline")).toBeVisible();
  await expect(list.getByText("Do-date picker")).toHaveCount(0);
  await search.fill("zebra");
  await expect(list.getByRole("status")).toHaveText("No shortcut matches “zebra”.");

  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
});

test("the sidebar's search control opens the palette, with its ⌘K hint, and ? beside Settings opens the overlay", async ({ page }) => {
  await openApp(page, "/inbox");
  const nav = page.locator('nav[data-variant="full"]');
  const search = nav.getByRole("button", { name: "Search and commands" });
  await expect(search).toBeVisible();
  await expect(search.locator("kbd")).toHaveText(/^(⌘K|Ctrl\+K)$/);
  await search.click();
  await expect(palette(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  // Search proper is a row away: the same words, in Search with its filters.
  await field(page).fill("proposal");
  await palette(page).getByRole("option", { name: "Search for “proposal”" }).click();
  await expect(page).toHaveURL(/\/search\?q=proposal/);

  await nav.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("the narrow band's rail has the search control too", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await openApp(page, "/inbox");
  const rail = page.locator('nav[data-variant="rail"]');
  await rail.getByRole("button", { name: "Search and commands" }).click();
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await rail.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});

test("Export data lands on Settings › Data, at the export", async ({ page }) => {
  await openApp(page, "/today");
  await runCommand(page, "Export data");
  await expect(page).toHaveURL(/\/settings#data$/);
  const data = page.getByRole("region", { name: "Data" });
  await expect(data.getByText("Export everything")).toBeInViewport();
  await expect(data.getByRole("button", { name: "JSON" })).toBeVisible();
});

test("Sign out asks inside the palette, and Stay signed in leaves everything as it was", async ({ page }) => {
  await openApp(page, "/today");
  await runCommand(page, "Sign out");
  const asked = palette(page).getByRole("group", { name: "Sign out" });
  // Either the question, or — with changes still waiting — the same warning Settings gives.
  await expect(asked).toContainText(/Sign out of Sparehour on this device\?|reached your account yet/);
  await expect(asked.getByRole("button", { name: "Stay signed in" })).toBeVisible();
  // Esc is one layer: back to the list.
  await page.keyboard.press("Escape");
  await expect(asked).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await palette(page).getByRole("group", { name: "Sign out" }).getByRole("button", { name: "Stay signed in" }).click();
  await expect(palette(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/today/);
});

test("Add tag makes a tag on its own, which the @ picker then offers", async ({ page }) => {
  const name = `e2e-palette-${Date.now().toString(36)}`;
  await openApp(page, "/inbox");
  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill("Add tag…");
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveValue("Add tag ");
  await field(page).pressSequentially(name);
  await expect(palette(page).getByRole("option").first()).toHaveText(`Add tag “${name}”`);
  await page.keyboard.press("Enter");
  await expect(palette(page)).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: `Added tag @${name}` })).toBeVisible();
  expect(await waitForRow("select id from public.tags where name = $1 and deleted_at is null", [name])).not.toBeNull();
  // No task carries it.
  await withDb(async (c) => expect((await c.query("select count(*)::int as n from public.task_tags l join public.tags t on t.id = l.tag_id where t.name = $1", [name])).rows[0].n).toBe(0));
});

test.describe("Add time block", () => {
  // Working hours over the whole day, so the spec does not depend on today being a working day.
  let added: string[] = [];
  test.beforeAll(async () => {
    added = await withDb(async (c) => addAllDayHours(c, await devAccount(c, DEV_USER.email)));
  });
  test.afterAll(async () => {
    await withDb((c) => c.query("delete from public.work_hours where id = any($1)", [added]));
  });

  test("places a block of your own on today's timeline, 30 minutes, ready to rename", async ({ page }) => {
    const title = uniqueTitle("palette block");
    await openApp(page, "/inbox");
    await runCommand(page, "Add time block");
    await expect(page).toHaveURL(/\/today/);
    const name = page.getByRole("complementary", { name: "Your day" }).getByRole("textbox", { name: "Block name" });
    await expect(name).toBeFocused({ timeout: 15_000 });
    await name.fill(title);
    await name.press("Enter");
    const row = await waitForRow<{ start_at: string; end_at: string; task_id: string | null }>("select start_at, end_at, task_id from public.time_blocks where title = $1 and deleted_at is null", [title]);
    expect(row).not.toBeNull();
    expect(row!.task_id).toBeNull();
    expect(new Date(row!.end_at).getTime() - new Date(row!.start_at).getTime()).toBe(30 * 60_000);
  });
});

test("Clear the slate opens Today's own confirmation", async ({ page }) => {
  await openApp(page, "/inbox");
  await runCommand(page, "Clear the slate…");
  await expect(page).toHaveURL(/\/today/);
  const sheet = page.getByRole("dialog", { name: "Clear the slate" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("Sync now runs in the palette and says how it went", async ({ page }) => {
  await openApp(page, "/today");
  await runCommand(page, "Sync now");
  const said = palette(page).getByRole("group", { name: "Sync now" }).getByRole("status");
  await expect(said).not.toHaveText(/^(Syncing…)?$/, { timeout: 20_000 });
  await palette(page).getByRole("button", { name: "Done" }).click();
  await expect(palette(page)).toHaveCount(0);
});

test("off a timeline, Block it is listed off with the reason", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("block off today");
  await quickAdd(page, title);
  await expect(page.getByRole("row").first()).toContainText(title);
  await page.keyboard.press("j");
  await expect(page.getByRole("row").filter({ hasText: title })).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill("Block it");
  const option = palette(page).getByRole("option", { name: /^Block it/ });
  await expect(option).toHaveAttribute("aria-disabled", "true");
  await expect(option).toContainText("where a timeline is shown");
  await page.keyboard.press("Escape");
  expect(title.startsWith(E2E_PREFIX)).toBe(true);
});
