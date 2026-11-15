// How long a task took, and what the app learns from it (DECISIONS.md, amendment 2026-11-15). Finishing a task
// puts "Took" under its toast: one tap records the length, on the task or on a repeat's finished day, even after
// sync has taken the finished row off the device; Undo takes it back with the completion. From enough of those
// the app says what tasks like this usually take, in quick add, in the task's detail and in Settings, and one tap
// takes the suggestion.
import { expect, test } from "./fixtures";
import { devAccount, waitForRow, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, clickTitle, openApp, quickAdd, uniqueTitle } from "./helpers";

const n = Date.now().toString(36);
const project = `${E2E_PREFIX}Took project ${n}`;
const open = `${E2E_PREFIX}Took open ${n}`;
let projectId = "";

test.beforeAll(async () => {
  await withDb(async (c) => {
    const me = await devAccount(c, DEV_USER.email);
    projectId = (await c.query<{ id: string }>("insert into public.projects (space_id, name, state, sort_key) values ($1, $2, 'active', 'a0') returning id", [me.sid, project])).rows[0].id;
    const finished = (title: string, daysAgo: number, estimate: number | null, actual: number, inProject: boolean) =>
      c.query(
        `insert into public.tasks (space_id, title, sort_key, state, completed_at, estimate_min, actual_min, project_id)
         values ($1, $2, 'a0', 'done', now() - make_interval(days => $3), $4, $5, $6)`,
        [me.sid, `${E2E_PREFIX}Took done ${title} ${n}`, daysAgo, estimate, actual, inProject ? projectId : null],
      );
    // In the project: estimated at 30m, took an hour, six times. Two of them long enough ago to be moved out of the
    // synced table, so what is learned is read from both places.
    for (const [i, daysAgo] of [1, 2, 3, 4, 10, 12].entries()) await finished(`p${i}`, daysAgo, 30, 60, true);
    // Outside any project: no estimate, took 50m, five times.
    for (let i = 0; i < 5; i++) await finished(`u${i}`, i + 1, null, 50, false);
    await c.query("select private.archive_done_tasks()");
    await c.query("insert into public.tasks (space_id, title, sort_key, state, do_date, estimate_min, project_id) values ($1, $2, 'a0', 'active', current_date + 20, 30, $3)", [me.sid, open, projectId]);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("delete from public.finished_tasks where title like $1", [`%${n}`]);
    await c.query("delete from public.tasks where title like $1", [`%${n}`]);
    await c.query("delete from public.projects where id = $1", [projectId]);
  });
});

test("finishing a task asks how long it took: a tap records it, another changes it, and Undo takes it back", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("took");
  await quickAdd(page, `${title} ~30m`);
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: `Complete ${title}` }).click();
  await expect(row).toHaveCount(0);

  // Under the toast: one step under the estimate, the estimate, two over, and More.
  const toast = page.getByRole("status").filter({ hasText: `Completed “${title}”` });
  const took = toast.getByRole("group", { name: "How long it took" });
  await expect(took).toBeVisible();
  await expect(took.getByRole("button")).toHaveText(["15m", "30m", "45m", "1h", "More"]);

  // The completion has uploaded, and a moment later the finished row has left the device: the tap still lands.
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'done'", [title])).not.toBeNull();
  await toast.hover();
  await page.waitForTimeout(2_000);
  await took.getByRole("button", { name: "45m" }).click();
  await expect(took.getByRole("button", { name: "45m" })).toHaveAttribute("aria-pressed", "true");
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'done' and actual_min = 45 and estimate_min = 30", [title])).not.toBeNull();

  // Another length: More has the rest.
  await toast.hover();
  await took.getByRole("button", { name: "More" }).click();
  await took.getByRole("button", { name: "2h" }).click();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and actual_min = 120", [title])).not.toBeNull();

  // Undo takes the completion back, and the length with it.
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'inbox' and completed_at is null and actual_min is null", [title])).not.toBeNull();
});

test("a repeat's length goes on the day that was finished, and the Logbook says it", async ({ page }) => {
  await openApp(page, "/today");
  const title = uniqueTitle("took repeat");
  await quickAdd(page, `${title} today every day ~1h`);
  const row = page.getByRole("row").filter({ hasText: title }).first();
  await row.getByRole("button", { name: `Complete ${title}` }).click();
  const toast = page.getByRole("status").filter({ hasText: `Completed “${title}”` });
  const took = toast.getByRole("group", { name: "How long it took" });
  await expect(took.getByRole("button")).toHaveText(["45m", "1h", "1h 30m", "2h", "More"]);
  await took.getByRole("button", { name: "1h 30m" }).click();
  expect(
    await waitForRow("select 1 from public.task_completions c join public.tasks t on t.id = c.task_id where t.title = $1 and c.actual_min = 90 and t.actual_min is null and t.state = 'active'", [title]),
  ).not.toBeNull();

  await openApp(page, "/logbook");
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText("took 1h 30m");
});

test("what tasks like this usually take is said in quick add, in the detail and in Settings, and one tap takes it", async ({ page }) => {
  test.setTimeout(120_000);
  // Quick add: a line filed in the project, estimated at 30m.
  await openApp(page, "/inbox");
  const title = uniqueTitle("took usual");
  await page.keyboard.press("q");
  const box = page.getByRole("textbox", { name: "Task" });
  await expect(box).toBeFocused();
  await box.fill(`${title} #"${project}" ~30m`);
  const sheet = page.getByRole("dialog").filter({ has: box });
  await expect(sheet.getByText("Tasks like this usually take you 1h.")).toBeVisible();
  await sheet.getByRole("button", { name: "Use 1h" }).click();
  await expect(box).toHaveValue(`${title} #"${project}" ~1h `);
  await expect(sheet.getByText("Tasks like this usually take you")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await waitForRow("select 1 from public.tasks where title = $1 and estimate_min = 60 and project_id = $2", [title, projectId])).not.toBeNull();

  // A line with no estimate and no project: what unestimated tasks took.
  await page.keyboard.press("q");
  await box.fill(`${E2E_PREFIX}Took loose ${n}`);
  await expect(sheet.getByText("Tasks like this usually take you 50m.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);

  // The detail of an open task in the project.
  await openApp(page, `/project/${projectId}`);
  const row = page.getByRole("row").filter({ hasText: open });
  await clickTitle(row.getByRole("button", { name: open, exact: true }));
  const detail = page.getByRole("complementary", { name: "Task" });
  await expect(detail.getByText("Tasks like this usually take you 1h.")).toBeVisible();
  await detail.getByRole("button", { name: "Use 1h" }).click();
  await expect(detail.getByText("Tasks like this usually take you")).toHaveCount(0);
  expect(await waitForRow("select 1 from public.tasks where title = $1 and estimate_min = 60", [open])).not.toBeNull();

  // Settings › Planning, under the default estimate.
  await openApp(page, "/settings#planning");
  await expect(page.getByText("Tasks you finished without an estimate usually took 50m.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 50m" })).toBeVisible();
});
