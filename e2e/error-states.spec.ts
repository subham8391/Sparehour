// SCREENS.md §21 "Unexpected failure": a part of a screen that throws while drawing fails in place, with what
// happened in plain words, Try again and Copy details — never a blank screen and never a stack trace — and the rest
// of the screen keeps working. The pane boundary's tripwire (`window.__sparehourFail`, ui/pane-boundary.tsx) makes
// Today's list fail on purpose.
import { expect, test } from "./fixtures";
import { openApp } from "./helpers";

test("Today's list fails in place: the header and ribbon stay, and Try again draws the list again", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __sparehourFail?: string }).__sparehourFail = "Today’s list";
  });
  await openApp(page, "/today");

  const failed = page.getByRole("heading", { name: "Today’s list stopped before it finished drawing." });
  await expect(failed).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy details" })).toBeVisible();
  await expect(page.getByText(/Something went wrong|at \w+ \(/)).toHaveCount(0);
  // The rest of Today still works: its date heading and the ribbon (or the no-working-hours line).
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/spare|over|No working hours today|Out of office today/).first()).toBeVisible();

  await page.evaluate(() => {
    delete (window as unknown as { __sparehourFail?: string }).__sparehourFail;
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(failed).toHaveCount(0);
  // The list's own Today section is back, its count after the label ("Today4 · 1h 05m" to the accessibility tree).
  await expect(page.getByRole("heading", { level: 2, name: /^Today\s*\d/ })).toBeVisible();
});
