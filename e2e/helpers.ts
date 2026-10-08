// Shared steps: the dev account, waiting for the first sync, unique titles.
import { expect, type Locator, type Page } from "@playwright/test";

export const DEV_USER = { email: "dev@sparehour.local", password: "sparehour" };

/** Every row a test creates starts with this, so the teardown can find it. */
export const E2E_PREFIX = "E2E ";

export function uniqueTitle(what: string): string {
  return `${E2E_PREFIX}${what} ${Date.now().toString(36)}`;
}

/**
 * Opens a route and waits until the first sync is done. A fresh browser
 * context has an empty local database: the shell paints, the restore gate
 * takes over while PowerSync delivers the account (SYSTEM_DESIGN.md §10.4),
 * and only then is the sync chip "synced" (or "storage not protected", which
 * is synced without a persistence grant). Waiting for anything earlier races
 * the gate.
 */
export async function openApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForSync(page);
}

export async function waitForSync(page: Page): Promise<void> {
  await expect(page.locator("[data-state]").first()).toHaveAttribute("data-state", /^(synced|unprotected)$/, { timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Restoring your data…" })).toHaveCount(0);
}

/** Quick-add: `Q` opens it, Enter saves and keeps it open, Escape closes it. */
/**
 * Clicks a row's title where its words are, as a person does. The title button spans the row, and from `sm` the row's
 * hover actions sit over its right-hand part (they end where the estimate chip begins), so its centre can be an action.
 */
export async function clickTitle(title: Locator): Promise<void> {
  const box = await title.boundingBox();
  await title.click(box ? { position: { x: Math.min(12, box.width / 2), y: box.height / 2 } } : undefined);
}

export async function quickAdd(page: Page, text: string): Promise<void> {
  await page.keyboard.press("q");
  const box = page.getByRole("textbox", { name: "Task" });
  await expect(box).toBeFocused();
  await box.fill(text);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
}

/** The sync chip's words, from the sidebar (desktop) — "Synced …", "Offline", "Syncing…", "Sync problem". */
export function syncChip(page: Page) {
  return page.getByRole("navigation", { name: "Main" }).locator("[data-state]").first();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 5 Oct" for an ISO date, as the app writes a day this year (core/time/format-day). */
export function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The weekday of an ISO date: 0 is Sunday. */
export function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
