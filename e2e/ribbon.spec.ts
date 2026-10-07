// The ribbon's hands (SCREENS.md §2.2 "Interactions", as built 2026-10-07): one real button lies over the drawing,
// named "Spare time breakdown" with the equation in words as its description. Enter opens the breakdown pinned,
// ← → step along the day's segments ("Meeting · …", "Free · 14:00–18:00 · 4h"), "Add something" on free time
// opens quick add holding "today ", and Escape closes the panel.
//
// The ribbon is drawn only on a working day, so the dev account gets working hours over every hour of every day
// for the length of the spec (extra rows beside its own, deleted in afterAll). Before the day rollover the app's
// today has already ended and there is no free time left to step to, so the spec skips then, and in the last
// half hour of the day.
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp } from "./helpers";

let me: DevAccount;
let addedHours: string[] = [];
let skip: string | null = null;

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    if (me.minute < me.rollover * 60) skip = "before the day rollover: the app's today has already ended";
    else if (me.minute > 23 * 60 + 30) skip = "too late in the day for free time to step to";
    if (skip) return;
    addedHours = await addAllDayHours(c, me);
  });
});

test.afterAll(async () => {
  if (addedHours.length > 0) await withDb((c) => c.query("delete from public.work_hours where id = any($1::uuid[])", [addedHours]));
});

test("the breakdown button reads the equation; Enter pins it, the arrows step to free time, and Add something opens quick add for today", async ({ page }) => {
  test.skip(skip !== null, skip ?? "");
  await openApp(page, "/today");
  const ribbon = page.getByRole("region", { name: "Spare time today" });
  const button = ribbon.getByRole("button", { name: "Spare time breakdown" });
  await expect(button).toBeVisible();
  // The equation is read without opening anything: "9h working − … buffer (15% of your working day) − … planned = … spare".
  await expect(button).toHaveAccessibleDescription(/^\S.* working − .* buffer.* − .* planned = .* (spare|over)$/);
  await expect(button).toHaveAttribute("aria-expanded", "false");

  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const panel = ribbon.getByRole("group", { name: "Spare time breakdown" });
  await expect(panel).toBeVisible();
  // The equation, a term a line, the result last.
  const terms = panel.getByRole("listitem");
  await expect(terms.first()).toHaveText(/working$/);
  await expect(terms.last()).toHaveText(/(spare|over)$/);

  // The segment line names what it is in words; → walks along the day until it reaches free time.
  const line = panel.locator("p[aria-live]");
  await expect(line).toHaveText(/^(Meeting|Block|Free|Outside working hours|Over) · /);
  for (let i = 0; i < 40 && !/^Free · /.test((await line.textContent()) ?? ""); i++) await page.keyboard.press("ArrowRight");
  await expect(line).toHaveText(/^Free · \d\d:\d\d–\d\d:\d\d · /);
  const add = panel.getByRole("button", { name: "Add something" });
  await expect(add).toBeVisible();

  // Escape closes the pinned panel and leaves the button where it was.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // Open it again at free time and add: quick add opens holding "today ".
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  for (let i = 0; i < 40 && !/^Free · /.test((await line.textContent()) ?? ""); i++) await page.keyboard.press("ArrowRight");
  await panel.getByRole("button", { name: "Add something" }).click();
  const box = page.getByRole("textbox", { name: "Task" });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("today ");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
});
