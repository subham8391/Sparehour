// Settings → Calendar (SCREENS.md §18) against the seeded account: the
// connection is listed, "counts as busy" is a real write that reaches
// Postgres through sync, and the ribbon knows a calendar is connected.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";
import { openApp } from "./helpers";

const CAL_SQL = "select read from public.calendars c join public.users u on u.id = c.user_id where u.email = $1 and c.external_id = 'primary' and c.read = $2";

test("the connected calendar is listed and 'counts as busy' writes through to Postgres", async ({ page }) => {
  // Today's calendar problem line links here; the section opens on its own.
  await openApp(page, "/settings#calendar");
  await expect(page.getByRole("region", { name: "Calendar" }).getByText("dev@sparehour.local").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
  const busy = page.getByRole("switch", { name: "Counts as busy" }).first();
  const wasOn = (await busy.getAttribute("aria-checked")) === "true";

  await busy.click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();
  expect(await waitForRow(CAL_SQL, ["dev@sparehour.local", !wasOn])).not.toBeNull();

  // The switch reflects the local row; click again only once it has flipped, as a person would,
  // or the second click writes the same value and nothing new reaches Postgres.
  await expect(busy).toHaveAttribute("aria-checked", String(!wasOn));
  await busy.click();
  expect(await waitForRow(CAL_SQL, ["dev@sparehour.local", wasOn])).not.toBeNull();

  await page.getByRole("link", { name: /^Today/ }).click();
  // A connected calendar never asks to be connected; the meetings figure itself only exists on a working day.
  await expect(page.getByRole("link", { name: /connect a calendar/i })).toHaveCount(0);
  await expect(page.getByText(/in meetings|calendar still loading|No working hours today|Out of office today/).first()).toBeVisible();
});
