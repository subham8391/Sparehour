// axe against the real routes (SYSTEM_DESIGN.md §11.5): zero serious or
// critical violations on the screens the exit criteria name. Everything
// milder is printed so it is seen, not silently accepted.
import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openApp } from "./helpers";

async function audit(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const milder = result.violations.filter((v) => !blocking.includes(v));
  for (const v of milder) console.log(`[axe ${label}] ${v.impact}: ${v.id} — ${v.help} (${v.nodes.length})`);
  expect(blocking.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)).toEqual([]);
}

test.describe("accessibility", () => {
  for (const path of ["/today", "/inbox", "/upcoming", "/someday", "/logbook", "/settings", "/search?q=proposal"]) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await openApp(page, path);
      await audit(page, path);
    });
  }

  test("a project page and open quick-add have no serious or critical violations", async ({ page }) => {
    await openApp(page, "/today");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Acme" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acme");
    await audit(page, "/project");
    await page.keyboard.press("q");
    // Exact: a project's own add row is named "Add a task", which a loose match would also take.
    await expect(page.getByRole("textbox", { name: "Task", exact: true })).toBeFocused();
    await audit(page, "quick-add");
  });
});
