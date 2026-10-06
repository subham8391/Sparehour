// Appearance and data (SCREENS.md §18): the theme choice applies at once and
// survives navigation; a JSON export is a real download containing the tasks.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

/** Settings opens on its section list; Appearance and Data are sections of their own (SCREENS.md §18). */
const openSection = (page: Page, name: string) => page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: new RegExp(`^${name}`) }).click();

test("dark theme applies and follows to Today; System restores", async ({ page }) => {
  await openApp(page, "/settings#appearance");
  const theme = page.getByRole("radiogroup", { name: "Theme" });
  await theme.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: /^Today/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "Settings" }).click();
  await openSection(page, "Appearance");
  await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
});

test("the JSON export downloads a file that contains the tasks", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("export");
  await quickAdd(page, title);
  await page.getByRole("link", { name: "Settings" }).click();
  await openSection(page, "Data");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "JSON" }).click()]);
  expect(download.suggestedFilename()).toMatch(/sparehour.*\.json$/);
  const body = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
  expect(body).toContain(title);
  const parsed = JSON.parse(body) as { format: string; tables: { tasks: { title: string }[] } };
  expect(parsed.format).toBe("sparehour-export");
  expect(parsed.tables.tasks.some((t) => t.title === title)).toBe(true);
});
