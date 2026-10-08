// The task detail (SCREENS.md §12): every field edits in place and each write
// reaches Postgres — day, deadline, estimate, priority, repeat, a checklist
// step, a tag, notes — and Mark done completes from the panel.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { clickTitle, openApp, quickAdd, uniqueTitle } from "./helpers";

const TASK = "select t.* from public.tasks t where t.title = $1";

test("the detail panel edits every field, and each write lands in Postgres", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("detail");
  await quickAdd(page, title);
  const row = page.getByRole("row").filter({ hasText: title });
  await clickTitle(row.getByRole("button", { name: title, exact: true }));
  const panel = page.getByRole("complementary", { name: "Task" });
  await expect(panel.getByRole("textbox", { name: "Title" })).toHaveValue(title);

  // A popover may close itself once a choice is made; Escape only while it is still open (a second Escape would close the panel).
  const dismiss = async (name: string) => {
    const dialog = page.getByRole("dialog", { name });
    if (await dialog.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
  };

  // Do: tomorrow, by the date field.
  await panel.getByRole("button", { name: /^Do/ }).click();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByRole("dialog", { name: "Do" }).getByLabel("Day").fill(tomorrow);
  await dismiss("Do");
  expect(await waitForRow(`${TASK} and t.do_date = $2`, [title, tomorrow])).not.toBeNull();

  // Deadline: a week out.
  const deadline = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await panel.getByRole("button", { name: /^Deadline/ }).click();
  await page.getByRole("dialog", { name: "Deadline" }).getByLabel("Date").fill(deadline);
  await dismiss("Deadline");
  expect(await waitForRow(`${TASK} and t.deadline = $2`, [title, deadline])).not.toBeNull();

  // Estimate.
  await panel.getByRole("button", { name: /^Estimate/ }).click();
  const minutes = page.getByRole("dialog", { name: "Estimate" }).getByLabel("Minutes");
  await minutes.fill("45");
  await minutes.press("Enter");
  await dismiss("Estimate");
  expect(await waitForRow(`${TASK} and t.estimate_min = 45`, [title])).not.toBeNull();

  // Priority.
  await panel.getByRole("button", { name: /^Priority/ }).click();
  await page.getByRole("dialog", { name: "Priority" }).getByRole("button", { name: "!1 High" }).click();
  await dismiss("Priority");
  expect(await waitForRow(`${TASK} and t.priority = 3`, [title])).not.toBeNull();

  // Repeat: every week.
  await panel.getByRole("button", { name: /^Repeat/ }).click();
  const repeat = page.getByRole("dialog", { name: "Repeat" }).getByLabel("Repeat");
  await repeat.fill("every week");
  await repeat.press("Enter");
  await dismiss("Repeat");
  expect(await waitForRow(`${TASK} and t.recurrence_rule is not null`, [title])).not.toBeNull();
  await expect(panel.getByRole("button", { name: /^Repeat every week/ })).toBeVisible();

  // A checklist step, ticked.
  const step = panel.getByLabel("Add a step");
  await step.fill("First step");
  await step.press("Enter");
  const stepBox = panel.getByRole("checkbox", { name: "Done: First step" });
  await expect(stepBox).toBeVisible();
  // The box is bound to the local database: it reads back checked once the write has landed, a beat after the click.
  await stepBox.click();
  await expect(stepBox).toBeChecked();
  expect(await waitForRow("select c.id from public.checklist_items c join public.tasks t on t.id = c.task_id where t.title = $1 and c.title = 'First step' and c.done", [title])).not.toBeNull();

  // A tag.
  const tagName = `e2e${Date.now().toString(36)}`;
  const tag = panel.getByLabel("Add a tag");
  await tag.fill(tagName);
  await tag.press("Enter");
  await expect(panel.getByRole("button", { name: `Remove tag ${tagName}` })).toBeVisible();
  expect(await waitForRow("select tt.task_id from public.task_tags tt join public.tags g on g.id = tt.tag_id join public.tasks t on t.id = tt.task_id where t.title = $1 and g.name = $2 and tt.deleted_at is null", [title, tagName])).not.toBeNull();

  // Notes save on blur.
  const notes = panel.getByLabel("Notes");
  await notes.fill("Remember the attachment.");
  await panel.getByRole("textbox", { name: "Title" }).click();
  expect(await waitForRow(`${TASK} and t.notes_md = 'Remember the attachment.'`, [title])).not.toBeNull();

  // Mark done from the panel: a repeating task rolls forward a week and records the completion.
  await panel.getByRole("button", { name: "Mark done" }).click();
  const nextWeek = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
  expect(await waitForRow(`${TASK} and t.state = 'active' and t.do_date = $2 and t.completed_at is null`, [title, nextWeek])).not.toBeNull();
  expect(await waitForRow("select c.id from public.task_completions c join public.tasks t on t.id = c.task_id where t.title = $1 and c.occurrence_date = $2 and c.deleted_at is null", [title, tomorrow])).not.toBeNull();
  // The step ticked earlier is fresh again for the next occurrence.
  expect(await waitForRow("select c.id from public.checklist_items c join public.tasks t on t.id = c.task_id where t.title = $1 and c.title = 'First step' and not c.done", [title])).not.toBeNull();
});
