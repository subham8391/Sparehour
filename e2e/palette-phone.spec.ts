// The palette on a phone (SCREENS.md §12 "Responsive"): a sheet from the header's search icon, rows 48 px, no key
// hints, and the commands that belong to wider screens listed off with the reason. Runs in the phone project.
import { expect, test } from "./fixtures";
import { openApp } from "./helpers";

test("the palette sheet has 48 px rows, and the desktop panes' commands say why they are off", async ({ page }) => {
  await openApp(page, "/today");
  await page.getByRole("button", { name: "Search and commands" }).click();
  const sheet = page.getByRole("dialog", { name: "Command palette" });
  await expect(sheet).toBeVisible();
  const rows = sheet.getByRole("option");
  await expect(rows.first()).toBeVisible();
  for (const row of (await rows.all()).slice(0, 4)) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // No kbd hints on a touch screen.
  await expect(sheet.locator("kbd:visible")).toHaveCount(0);
  await sheet.getByRole("combobox", { name: "Search or run a command" }).fill("Toggle sidebar");
  const toggle = sheet.getByRole("option", { name: /^Toggle sidebar/ });
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(toggle).toContainText("on a wider screen");
});
