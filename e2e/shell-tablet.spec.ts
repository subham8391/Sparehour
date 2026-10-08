// The narrow band's rail on touch (SCREENS.md §1 "Narrow: a 56 px icon rail (labels on long-press)"): a finger held
// on a rail icon shows its name and count beside the rail without navigating, a tap still navigates, and the
// sidebar's fold, which belongs to wider bands, is not there. Runs in the tablet project (820 px, touch, no hover).
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openApp } from "./helpers";

/** A finger held on `target` for `ms`, then lifted, as touch pointer events (the label listens on the document). */
async function hold(page: Page, target: Locator, ms: number) {
  const box = (await target.boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", isPrimary: true, bubbles: true };
  await target.dispatchEvent("pointerdown", at);
  await page.waitForTimeout(ms);
  await target.dispatchEvent("pointerup", at);
}

test("a long-press on a rail icon shows its name and count without navigating; a tap navigates", async ({ page }) => {
  await openApp(page, "/today");
  const rail = page.locator('nav[data-variant="rail"]');
  await expect(rail).toBeVisible();
  // At this width the rail is all there is: no fold button, and no full sidebar to fold.
  await expect(rail.getByRole("button", { name: "Expand sidebar" })).toBeHidden();
  await expect(page.locator('nav[data-variant="full"]')).toBeHidden();

  const inbox = rail.getByRole("link", { name: /^Inbox/ });
  const name = (await inbox.getAttribute("aria-label"))!;
  const label = page.locator("[data-rail-peek]");
  // The label's listener arrives in idle time with the sidebar's other pointer extras: hold until it answers.
  await expect(async () => {
    await hold(page, inbox, 650);
    await expect(label).toHaveText(name, { timeout: 200 });
  }).toPass({ timeout: 15_000 });
  await inbox.dispatchEvent("click");
  await expect(page).toHaveURL(/\/today/);
  // It sits beside the rail, not over it.
  const railBox = (await rail.boundingBox())!;
  expect((await label.boundingBox())!.x).toBeGreaterThanOrEqual(railBox.x + railBox.width);
  await expect(label).toHaveCount(0, { timeout: 4000 });

  // A tap still goes there.
  await inbox.tap();
  await expect(page).toHaveURL(/\/inbox/);
});

