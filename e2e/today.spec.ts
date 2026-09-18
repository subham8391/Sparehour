// Today (SCREENS.md §2): the day, the ribbon, quick-add into the list, and a
// block from the keyboard — every write proven in Postgres.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, quickAdd, uniqueTitle } from "./helpers";

const DAY_HEADING = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} [A-Z][a-z]+$/;

test.describe("Today", () => {
  test("shows the date, the spare-time ribbon and the sidebar after the first sync", async ({ page }) => {
    await openApp(page, "/today");
    await expect(page.getByRole("heading", { level: 1, name: DAY_HEADING })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Today/ })).toHaveAttribute("aria-current", "page");
    const ribbon = page.getByText(/spare|over|Not a working day/).first();
    await expect(ribbon).toBeVisible();
  });

  test("quick-add puts a task on today's list and it reaches Postgres", async ({ page }) => {
    await openApp(page, "/today");
    const title = uniqueTitle("quick add");
    await quickAdd(page, `${title} today ~15m`);
    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByText("15m")).toBeVisible();
    const stored = await waitForRow<{ state: string; estimate_min: number }>("select state, estimate_min from public.tasks where title = $1", [title]);
    expect(stored).toMatchObject({ state: "active", estimate_min: 15 });
  });

  test("B blocks the selected task in the next free gap; Remove takes the block away for good", async ({ page }) => {
    await openApp(page, "/today");
    const timeline = page.getByTestId("timeline");
    test.skip((await timeline.count()) === 0, "not a working day: no timeline to block on");

    const title = uniqueTitle("block me");
    await quickAdd(page, `${title} today ~30m`);
    const row = page.getByRole("listitem").filter({ hasText: title });
    // The title selects the row and opens the detail (which hides the timeline); Escape closes the detail and keeps the selection.
    // The chips are not a place to click: the hover actions sit over them.
    await row.getByRole("button", { name: title, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: "Task" })).toHaveCount(0);
    await expect(row).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("b");

    const block = timeline.getByRole("button", { name: new RegExp(`^Block: ${title}`) });
    await expect(block).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: `Blocked “${title}”` })).toBeVisible();
    // The block chip shows the start time (its square is drawn, not typed); the task has no other time.
    await expect(row.getByText(/^\d\d:\d\d$/)).toBeVisible();
    const created = await waitForRow<{ id: string }>("select b.id from public.time_blocks b join public.tasks t on t.id = b.task_id where t.title = $1 and b.deleted_at is null", [title]);
    expect(created).not.toBeNull();

    await block.click();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(block).toHaveCount(0);
    await expect(row.getByText(/^\d\d:\d\d$/)).toHaveCount(0);
    const removed = await waitForRow<{ id: string }>("select id from public.time_blocks where id = $1 and deleted_at is not null", [created!.id]);
    expect(removed).not.toBeNull();
  });
});
