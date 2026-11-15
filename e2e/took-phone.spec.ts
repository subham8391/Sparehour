// "Took" on a phone (DECISIONS.md, amendment 2026-11-15): the four lengths stay on one line under the toast, so it
// covers two rows of the list and not three; More is at the end of that line and opens the rest, which wrap.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp, uniqueTitle } from "./helpers";

test("the toast asks on one line; a tap records, More opens the rest", async ({ page }) => {
  await openApp(page, "/inbox");
  const title = uniqueTitle("took phone");
  await page.getByRole("button", { name: "Add a task" }).click();
  const box = page.getByRole("textbox", { name: "Task" });
  await box.fill(`${title} ~30m`);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);

  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: `Complete ${title}` }).click();
  const toast = page.getByRole("status").filter({ hasText: `Completed “${title}”` });
  const took = toast.getByRole("group", { name: "How long it took" });
  await expect(took.getByRole("button")).toHaveText(["15m", "30m", "45m", "1h", "More"]);

  // One line of 44 px chips, inside the toast's width: nothing wraps and nothing pushes the toast wider.
  const chips = await took.getByRole("button").evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), height: Math.round(r.height) })));
  expect(new Set(chips.map((c) => c.top)).size).toBe(1);
  expect(chips.every((c) => c.height >= 44)).toBe(true);
  const [toastBox, viewport] = [await toast.boundingBox(), page.viewportSize()];
  expect(toastBox && viewport && toastBox.x >= 0 && toastBox.x + toastBox.width <= viewport.width).toBe(true);

  await took.getByRole("button", { name: "45m" }).tap();
  await expect(took.getByRole("button", { name: "45m" })).toHaveAttribute("aria-pressed", "true");
  expect(await waitForRow("select 1 from public.tasks where title = $1 and state = 'done' and actual_min = 45", [title])).not.toBeNull();

  // More sits at the end of the line; open, the rest wrap under it.
  await took.getByRole("button", { name: "More" }).scrollIntoViewIfNeeded();
  await took.getByRole("button", { name: "More" }).tap();
  await expect(took.getByRole("button", { name: "4h" })).toBeVisible();
  await took.getByRole("button", { name: "2h" }).tap();
  expect(await waitForRow("select 1 from public.tasks where title = $1 and actual_min = 120", [title])).not.toBeNull();
});
