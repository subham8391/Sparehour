// A hardware keyboard on a touch screen (SCREENS.md §24 "Touch"): the ? button, kbd hints and the overlay's key table
// wait for a real keypress, then stay for the visit. Runs in the tablet project (820 px, touch, no hover).
import { expect, test } from "./fixtures";
import { openApp } from "./helpers";

test("the first hardware keypress brings back the ? button, kbd hints and the overlay's keys", async ({ page }) => {
  await openApp(page, "/inbox");
  const rail = page.locator('nav[data-variant="rail"]');
  await expect(rail.getByRole("button", { name: "Search and commands" })).toBeVisible();
  // Keyless: no ? beside Settings, and the overlay (from the palette) explains instead of listing keys.
  await expect(rail.getByRole("button", { name: "Keyboard shortcuts" })).toBeHidden();
  await expect(page.locator("html")).not.toHaveAttribute("data-keys", /.*/);

  // A key pressed outside a field is a hardware keyboard's: Escape changes nothing else on the page.
  await page.locator("body").press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-keys", "");
  await rail.getByRole("button", { name: "Keyboard shortcuts" }).click();
  const overlay = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(overlay.getByRole("searchbox", { name: "Search shortcuts" })).toBeVisible();
  await expect(overlay.locator("kbd").first()).toBeVisible();
  await expect(overlay.getByText("These need a keyboard.", { exact: false })).toBeHidden();
});
