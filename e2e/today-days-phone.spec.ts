// Today's day arrows on a phone (SCREENS.md §2.1, DESIGN_SYSTEM.md §4a): beside the title, 44 px, and a tap steps
// the day — the tap path for `[` and `]`.
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, withDb } from "./db";
import { DEV_USER, openApp } from "./helpers";

test("the day arrows are 44 px targets and step Today a day at a time", async ({ page }) => {
  const me = await withDb((c) => devAccount(c, DEV_USER.email));
  await openApp(page, "/today");
  const next = page.getByRole("button", { name: "Next day" });
  const prev = page.getByRole("button", { name: "Previous day" });
  for (const arrow of [prev, next]) {
    const box = await arrow.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  await next.click();
  await expect(page).toHaveURL(new RegExp(`/today\\?day=${isoPlus(me.today, 1)}$`));
  const back = page.getByRole("button", { name: "back to today" });
  await expect(back).toBeVisible();
  expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(page).toHaveURL(/\/today$/);
});
