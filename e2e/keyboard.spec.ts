// The keyboard layer (SCREENS.md §23): G chords navigate, ? explains, ⌘K runs
// a command, / opens search — from anywhere, with nothing focused.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

test("G chords, the shortcuts overlay, the palette and / all work from Today", async ({ page }) => {
  await openApp(page, "/today");
  await page.keyboard.press("g");
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/\/inbox/);
  await page.keyboard.press("g");
  await page.keyboard.press("u");
  await expect(page).toHaveURL(/\/upcoming/);

  await page.keyboard.press("Shift+?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByPlaceholder("Search or run a command…").fill("Go to Someday");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/someday/);

  await page.keyboard.press("/");
  await expect(page).toHaveURL(/\/search/);
});

test("Enter renames the selected row in place, Space opens it, and Esc lets go one layer at a time", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("rename");
  await quickAdd(page, title);
  // The newest capture is the Inbox's first row (once it is drawn): J selects it and focus follows it, so it is read out.
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(page.getByRole("row").first()).toContainText(title);
  await page.keyboard.press("j");
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(row).toBeFocused();

  await page.keyboard.press("Enter");
  const field = page.getByRole("textbox", { name: "Title" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(title);
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await field.press("End");
  await page.keyboard.type(" tomorrow");
  await page.keyboard.press("Enter");
  // A plain rename: the words are the title, nothing is parsed.
  const renamed = `${title} tomorrow`;
  await expect(page.getByRole("row").filter({ hasText: renamed })).toHaveAttribute("aria-current", "true");
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'inbox' and do_date is null", [renamed])).not.toBeNull();

  await page.keyboard.press(" ");
  await expect(page.getByRole("complementary", { name: "Task" })).toBeVisible();
  // One layer per press: the panel first, then the selection.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: renamed })).toHaveAttribute("aria-current", "true");
  await page.locator("body").press("Escape");
  await expect(page.getByRole("row").filter({ hasText: renamed })).not.toHaveAttribute("aria-current", "true");
});
