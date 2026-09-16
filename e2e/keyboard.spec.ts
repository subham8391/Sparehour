// The keyboard layer (SCREENS.md §23): G chords navigate, ? explains, ⌘K runs
// a command, / opens search — from anywhere, with nothing focused.
import { expect, test } from "./fixtures";
import { openApp } from "./helpers";

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
