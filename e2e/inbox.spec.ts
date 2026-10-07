// Inbox (SCREENS.md §5): a quick-add with no day lands here; Today moves it out. The selected row expands to the
// triage actions, "+ Add to Inbox" adds, and Triage all walks the queue one task at a time.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

test("a task without a day goes to the Inbox, and Today moves it to the day", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("inbox");
  await quickAdd(page, title);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText("added today");
  // The row's actions appear on hover, as they do for a person.
  await row.hover();
  await row.getByRole("button", { name: "Today", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("link", { name: /^Today/ }).click();
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
});

test("the selected row expands: an estimate alone keeps it, This week files it undated", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("triage row");
  await quickAdd(page, title);
  const row = page.getByRole("row").filter({ hasText: title });
  // The newest capture is first (once it is drawn): J selects it, and only the selected row expands.
  await expect(page.getByRole("row").first()).toContainText(title);
  await page.keyboard.press("j");
  const triage = page.getByRole("group", { name: `Triage ${title}` });
  await expect(triage).toBeVisible();
  await expect(page.getByRole("group", { name: /^Triage / })).toHaveCount(1);

  await triage.getByRole("button", { name: "Estimate" }).click();
  await page.getByRole("dialog", { name: "Set estimate" }).getByRole("button", { name: "15m", exact: true }).click();
  expect(await waitForRow("select id from public.tasks where title = $1 and estimate_min = 15 and state = 'inbox'", [title])).not.toBeNull();
  await expect(row).toBeVisible();

  await triage.getByRole("button", { name: "This week" }).click();
  await expect(row).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'active' and do_date is null", [title])).not.toBeNull();
});

test("+ Add to Inbox adds through the parser", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("add row");
  const add = page.getByRole("textbox", { name: "Add to Inbox" });
  await add.fill(title);
  await add.press("Enter");
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'inbox'", [title])).not.toBeNull();
});

test("Triage all walks the newest captures one at a time; each key decides and moves on", async ({ page }) => {
  await openApp(page, "/inbox");
  const [older, newer] = [uniqueTitle("walk one"), uniqueTitle("walk two")];
  await quickAdd(page, older);
  await quickAdd(page, newer);
  // The walk takes the Inbox as drawn when it opens: wait for both captures at its head.
  await expect(page.getByRole("row").first()).toContainText(newer);
  await expect(page.getByRole("row").nth(1)).toContainText(older);
  await page.getByRole("button", { name: "Triage all" }).click();
  const walk = page.getByRole("dialog", { name: "Triage" });
  await expect(walk.getByRole("heading", { level: 2 })).toHaveText(newer);
  await page.keyboard.press("s");
  await expect(walk.getByRole("heading", { level: 2 })).toHaveText(older);
  await walk.getByRole("button", { name: /^Someday/ }).click();
  // Ours were the newest; whatever follows is not ours, and Esc leaves it as it was.
  await expect(walk.getByRole("heading", { level: 2, name: older })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(walk).toHaveCount(0);
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'someday'", [newer])).not.toBeNull();
  expect(await waitForRow("select id from public.tasks where title = $1 and state = 'someday'", [older])).not.toBeNull();
});
