// Quick add says what a line would do to its day before it is saved (DECISIONS.md, amendment 2026-11-14): the
// strip's last line reads "Leaves 2h 50m spare tomorrow" from the same capacity Upcoming shows, a line with no
// estimate counts as the default and says so, and a line with no day, or one for the evening, says nothing.
// Nothing is saved here. Working hours cover every day for the run, so the day named is always a working day.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, withDb } from "./db";
import { DEV_USER, openApp } from "./helpers";

let hours: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    hours = await addAllDayHours(c, await devAccount(c, DEV_USER.email));
  });
});

test.afterAll(async () => {
  if (hours.length) await withDb((c) => c.query("delete from public.work_hours where id = any($1::uuid[])", [hours]));
});

/** "2h 50m" → 170. */
const minutes = (words: string): number => {
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(words.trim());
  if (!m || (!m[1] && !m[2])) throw new Error(`not a duration: ${words}`);
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
};

/** Before the day rolls over, "tomorrow" is two days from the app's today, so the day is named another way. */
const LEAVES = /Leaves (.+) spare (?:today|tomorrow|on .+?)(?: · counted as (.+))?$/;

async function dayLine(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Task" }).fill(text);
  return page.locator("[data-day-effect]");
}

test("the strip says what the task leaves of its day, and counts a missing estimate as the default", async ({ page }) => {
  await openApp(page, "/inbox");
  await page.keyboard.press("q");
  await expect(page.getByRole("textbox", { name: "Task" })).toBeFocused();

  // Tomorrow's tasks reach a fresh device a moment after the sheet opens (later days are streamed when asked for),
  // and each one that lands moves the figure. So the three readings are taken together, and taken again if the day
  // changed under them (seen once, with rows an interrupted run had left on tomorrow).
  const read = async (text: string) => LEAVES.exec((await (await dayLine(page, text)).textContent()) ?? "");
  await expect(async () => {
    const long = await read("E2E day line tomorrow ~45m");
    expect(long).not.toBeNull();
    const left45 = minutes(long?.[1] ?? "");
    // A shorter task leaves exactly that much more of the same day.
    expect(minutes((await read("E2E day line tomorrow ~15m"))?.[1] ?? "")).toBe(left45 + 30);
    // No estimate: counted as the default, and the line says so.
    const assumed = await read("E2E day line tomorrow");
    const counted = minutes(assumed?.[2] ?? "");
    expect(minutes(assumed?.[1] ?? "")).toBe(left45 + 45 - counted);
  }).toPass({ timeout: 30_000 });
  // It is part of the strip the box is described by, so a screen reader hears it with the parse.
  const stripId = await page.getByRole("textbox", { name: "Task" }).getAttribute("aria-describedby");
  await expect(page.locator(`[id="${stripId}"]`)).toContainText("· counted as ");

  // No day, or the evening: nothing is taken from a working day, so nothing is said.
  await expect(await dayLine(page, "E2E day line")).toHaveCount(0);
  await expect(await dayLine(page, "E2E day line tomorrow evening")).toHaveCount(0);
  await page.keyboard.press("Escape");
});
