// Touch targets on a tablet (SCREENS.md §0 "every target ≥ 44 × 44 px" on every band; DECISIONS.md, M1 gap rulings
// "Touch targets"): a pointer that cannot hover gets 44 px hit areas at any width, the sidebar and its rail included,
// while a mouse keeps the 36 / 28 px desktop scale. Segmented controls alone follow R7 (36 px from `sm`), and a control
// that is words inside a sentence (a link, or the ribbon's "… — move X to tomorrow") is an inline target (WCAG 2.5.8
// "Inline"), so both are left out. Runs in the `tablet` project: Chromium emulating an 820 px touch screen with no hover.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, seedKey, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `t${Date.now().toString(36)}`;
const project = `${E2E_PREFIX}tablet ${n}`;
const T = { today: `${E2E_PREFIX}tablet today ${n}`, inbox: `${E2E_PREFIX}tablet inbox ${n}`, filed: `${E2E_PREFIX}tablet filed ${n}` };
let projectId = "";

test.beforeAll(async () => {
  await withDb(async (c) => {
    const me = await devAccount(c, DEV_USER.email);
    projectId = (await c.query<{ id: string }>("insert into public.projects (id, space_id, name, state, sort_key) values (gen_random_uuid(), $1, $2, 'active', $3) returning id", [me.sid, project, seedKey("96")])).rows[0].id;
    const add = (title: string, state: string, extra: { project_id?: string; do_date?: string } = {}) =>
      c.query("insert into public.tasks (id, space_id, project_id, title, state, priority, do_date, sort_key) values (gen_random_uuid(), $1, $2, $3, $4, 3, $5, $6)", [
        me.sid,
        extra.project_id ?? null,
        title,
        state,
        extra.do_date ?? null,
        seedKey("96"),
      ]);
    await add(T.today, "active", { do_date: me.today });
    await add(T.inbox, "inbox");
    await add(T.filed, "active", { project_id: projectId });
  });
});

/** Every visible control whose hit area (its box, or a pseudo-element drawn as one) is under 44 px either way. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      "button, a[href], summary, select, [role='button'], [role='menuitem'], [role='switch'], input[type='checkbox'], input[type='radio']",
    );
    for (const el of controls) {
      // R7 (segmented controls by width) and anything hidden from people.
      if (el.closest("[data-segmented], [aria-hidden='true'], [inert]")) continue;
      const style = getComputedStyle(el);
      // A control inside a sentence: a link in a paragraph, or a button set as the paragraph's own words (inline, among
      // other words). A button drawn as a box of its own in a paragraph (flex, inline-flex: "Trim today") is still a target.
      const p = el.closest("p");
      const words = (p?.textContent ?? "").trim().length > (el.textContent ?? "").trim().length;
      if (p && (el.matches("a") || (words && (style.display === "inline" || style.display === "inline-block")))) continue;
      if (style.visibility === "hidden" || style.pointerEvents === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const pseudo = (which: "::before" | "::after") => {
        const p = getComputedStyle(el, which);
        return p.content !== "none" && p.position === "absolute" ? { w: parseFloat(p.width) || 0, h: parseFloat(p.height) || 0 } : { w: 0, h: 0 };
      };
      const before = pseudo("::before");
      const after = pseudo("::after");
      const w = Math.max(r.width, before.w, after.w);
      const h = Math.max(r.height, before.h, after.h);
      if (w < 43.5 || h < 43.5) {
        const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return out;
  });
}

test("a touch screen at 820 px gets 44 px targets on Today, Inbox, Upcoming, a project and Settings", async ({ page }) => {
  // Six full loads in one context, each waiting for its sync (about ten seconds apiece after the first navigation).
  test.setTimeout(180_000);
  // The device this project emulates: no hover, a coarse pointer, between `sm` and `md`.
  expect(await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches)).toBe(true);
  for (const [path, title] of [
    ["/today", T.today],
    ["/inbox", T.inbox],
    ["/upcoming", null],
    [`/project/${projectId}`, T.filed],
    ["/settings", null],
  ] as const) {
    await openApp(page, path);
    if (title) await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
    expect(await smallTargets(page), `controls under 44 px on ${path}`).toEqual([]);
    // No page-level sideways scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  // A row's ⋯ sheet or popover: 48 px rows on touch.
  const row = (await openApp(page, "/today"), page.getByRole("row").filter({ hasText: T.today }));
  await row.getByRole("button", { name: "More actions" }).click();
  const items = page.getByRole("menu", { name: "More actions" }).getByRole("menuitem");
  await expect(items.first()).toBeVisible();
  for (let i = 0; i < (await items.count()); i++) expect((await items.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
});

test("the row shows the priority mark and opens the estimate presets from its chip on touch", async ({ page }) => {
  await openApp(page, `/project/${projectId}`);
  const row = page.getByRole("row").filter({ hasText: T.filed });
  await expect(row.getByRole("img", { name: "priority 1" })).toBeVisible();
  await row.getByRole("button", { name: /^No estimate — counted as/ }).click();
  const dialog = page.getByRole("dialog", { name: "Estimate" });
  await dialog.getByRole("button", { name: "45m", exact: true }).click();
  await expect(row.getByRole("button", { name: "Estimate 45m" })).toBeVisible();
});
