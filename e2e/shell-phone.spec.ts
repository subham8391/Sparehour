// Today on a phone (SCREENS.md §2.8 "the ribbon card (sticky on scroll)", §22; DESIGN_SYSTEM.md §5 ritual row): the
// ribbon card and the List · Day row stay under the top edge while the lists scroll beneath them, without covering
// the first row at rest; Plan my day scrolls with the lists. Runs in the phone project (Pixel 7).
import { expect, test } from "./fixtures";
import { devAccount, removeOwn, seedKey, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `p${Date.now().toString(36)}`;
// Enough of today's own rows that the page scrolls whatever else the dev account has.
const TITLES = Array.from({ length: 14 }, (_, i) => `${E2E_PREFIX}sticky ${n} ${String(i).padStart(2, "0")}`);

test.beforeAll(async () => {
  await withDb(async (c) => {
    const me = await devAccount(c, DEV_USER.email);
    for (const title of TITLES) {
      await c.query("insert into public.tasks (id, space_id, title, state, do_date, sort_key) values (gen_random_uuid(), $1, $2, 'active', $3, $4)", [me.sid, title, me.today, seedKey("98")]);
    }
  });
});
test.afterAll(async () => {
  await withDb((c) => removeOwn(c, TITLES));
});

test("the ribbon card and List · Day stay under the top edge while Today's lists scroll", async ({ page }) => {
  await openApp(page, "/today");
  const card = page.getByRole("region", { name: "Spare time today" });
  test.skip((await card.count()) === 0, "not a working day, or the day is shut down: no ribbon card");
  await expect(page.getByRole("row").filter({ hasText: TITLES[0] })).toBeVisible();
  const hero = page.locator('[data-hero="sticky"]');
  await expect(hero).toContainText("Day");

  // At rest nothing is covered: the first row of the list starts below the stuck block.
  const heroAtRest = (await hero.boundingBox())!;
  const firstRow = (await page.getByRole("row").first().boundingBox())!;
  expect(firstRow.y).toBeGreaterThanOrEqual(heroAtRest.y + heroAtRest.height - 1);

  // Scrolled well down, the card and the List · Day control are still at the top, and still work.
  await page.getByRole("row").filter({ hasText: TITLES[TITLES.length - 1] }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 400));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const stuck = (await hero.boundingBox())!;
  expect(Math.round(stuck.y)).toBe(0);
  await expect(card).toBeInViewport();
  const day = page.getByRole("button", { name: "Day", exact: true });
  await expect(day).toBeInViewport();
  // Rows pass beneath it on paper, never over it: the control is what a tap there reaches.
  const at = (await day.boundingBox())!;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-hero]") !== null, [at.x + at.width / 2, at.y + at.height / 2])).toBe(true);
  await day.click();
  await expect(page.getByTestId("timeline")).toBeVisible();

  // Plan my day is not part of the stuck block: it scrolls away with the lists.
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(hero.getByTestId("ritual-actions")).toHaveCount(0);
});
