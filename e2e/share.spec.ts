// Sharing to Sparehour (the manifest's share_target; DECISIONS.md, amendment 2026-11-14): what another app shares
// opens quick add holding it over the Inbox — the words as the name, the link after "//" as the note — and saving
// it makes an Inbox task. With nothing shared the page says so. Lists are gone: Browse offers none, and an old
// link to one lands on Today.
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { E2E_PREFIX, openApp, waitForSync } from "./helpers";

const n = Date.now().toString(36);
const title = `${E2E_PREFIX}Shared article ${n}`;
const url = `https://example.com/${n}`;

test.afterAll(async () => {
  await withDb((c) => c.query("delete from public.tasks where title = $1", [title]));
});

test("a share becomes a task: quick add opens on the words over the Inbox, the link is the note", async ({ page }) => {
  await openApp(page, "/inbox");
  await page.goto(`/share?text=${encodeURIComponent(`${title} ${url}`)}`);
  await expect(page).toHaveURL(/\/inbox$/);
  const box = page.getByRole("textbox", { name: "Task" });
  await expect(box).toHaveValue(`${title} // ${url}`);
  await waitForSync(page);
  await box.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: `Added “${title}”` })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await waitForRow("select 1 from public.tasks where title = $1 and notes_md = $2 and state = 'inbox'", [title, url])).not.toBeNull();
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
});

test("nothing shared says so; Lists are gone from Browse and an old link to one lands on Today", async ({ page }) => {
  await openApp(page, "/share");
  await expect(page.getByRole("heading", { name: "Nothing came through" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();

  await openApp(page, "/browse");
  await expect(page.getByText("Lists", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Add list/ })).toHaveCount(0);
  for (const old of ["/lists", "/list/25a03bbb-5c39-4e3c-943c-e099d90f8f92"]) {
    const gone = await page.request.get(old, { maxRedirects: 0 });
    expect(gone.status()).toBe(307);
    expect(gone.headers().location).toBe("/today");
  }
});

test("the installed app's Add a task shortcut opens quick add on Today, once", async ({ page }) => {
  // The installed app has synced before: a device on its very first sync redraws the app as the data lands, and a
  // sheet opened in that moment goes with it, shortcut or not.
  await openApp(page, "/inbox");
  // What the manifest's shortcut opens (features/pwa/manifest.ts).
  await page.goto("/today?quickadd=1");
  const box = page.getByRole("textbox", { name: "Task" });
  await expect(box).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");
  // The mark comes off the address, so a reload is an ordinary visit.
  await expect(page).toHaveURL(/\/today$/);
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await page.reload();
  await waitForSync(page);
  await expect(page.getByRole("textbox", { name: "Task" })).toHaveCount(0);
});
