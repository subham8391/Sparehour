// Quick-add on a phone (SCREENS.md §11, §22; PRODUCT_SPEC.md §5.1–§5.2): the
// "evening" suggestion chip alone makes a task for this evening, a fact chip's
// remove control is a 44 px target that keeps the words in the title, and a
// tag being typed is offered as a tappable chip.
import { expect, test } from "./fixtures";
import { devAccount, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

let me: DevAccount;
const tag = `e2e${Date.now().toString(36)}phone`;

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    await c.query("insert into public.tags (id, space_id, name) values (gen_random_uuid(), $1, $2)", [me.sid, tag]);
  });
});

test("the evening chip alone files the task for this evening; chips are tapped, and removing one keeps its words", async ({ page }) => {
  test.skip(me.minute < me.rollover * 60, "before the day rollover the app's Today is yesterday, not the day 'evening' is read against");
  await openApp(page, "/today");
  await page.getByRole("button", { name: "Add a task" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a task" });
  const box = sheet.getByRole("textbox", { name: "Task", exact: true });
  const strip = page.locator(`[id="${await box.getAttribute("aria-describedby")}"]`);

  const evening = uniqueTitle("phone call mum");
  await box.fill(evening);
  await sheet.getByRole("group", { name: "Suggestions" }).getByRole("button", { name: "evening", exact: true }).click();
  await expect(box).toHaveValue(`${evening} evening`);
  await expect(strip).toContainText("Today, evening");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByRole("status").filter({ hasText: `Added “${evening}”` })).toBeVisible();
  expect(await waitForRow("select id from public.tasks where title = $1 and do_date = $2::date and evening", [evening, me.today])).not.toBeNull();

  // A tag being typed is offered as a chip to tap.
  const tagged = uniqueTitle("phone tag");
  await box.fill(`${tagged} @${tag.slice(0, -2)}`);
  await sheet.getByRole("group", { name: "Tags" }).getByRole("button", { name: `@${tag}`, exact: true }).click();
  await expect(box).toHaveValue(`${tagged} @${tag} `);

  // Each fact chip's remove control is a full 44 px target on a phone; tapping it keeps the words in the title.
  await box.fill(`${tagged} @${tag} ~45m`);
  const remove = strip.getByRole("button", { name: "Remove “45m”" });
  const size = await remove.boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(44);
  expect(size?.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  await expect(remove).toHaveCount(0);
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByRole("status").filter({ hasText: `Added “${tagged} ~45m”` })).toBeVisible();
  expect(
    await waitForRow(
      `select t.id from public.tasks t join public.task_tags tt on tt.task_id = t.id and tt.deleted_at is null join public.tags g on g.id = tt.tag_id
        where t.title = $1 and t.estimate_min is null and g.name = $2`,
      [`${tagged} ~45m`, tag],
    ),
  ).not.toBeNull();
});
