// Shared steps for the timeline specs (SCREENS.md §2.6): where a minute of the day is on screen at the
// timeline's zoom, a stretch of the day clear of the account's own blocks and meetings to work in, and tasks and
// blocks seeded as postgres, read back on the account's clock.
import { expect, type Locator, type Page } from "@playwright/test";
import type { Client } from "pg";
import { seedKey, withDb, type DevAccount } from "./db";

/** "19:05" for a minute of the day, as the app writes it. */
export function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Pixels per minute at the timeline's zoom: rows of 33 px, of 30, 15 or 5 minutes. */
export async function scaleOf(timeline: Locator): Promise<number> {
  return 33 / Number(await timeline.getAttribute("data-zoom"));
}

/**
 * Brings a minute of the day to the middle of whatever scrolls the timeline: its own box (below the wide band, the
 * morning plan, a phone), or the day pane around it — and that box into the page's view.
 */
export async function showMinute(timeline: Locator, minute: number): Promise<void> {
  await timeline.evaluate((el, m) => {
    const scale = 33 / Number(el.getAttribute("data-zoom"));
    let s: HTMLElement | null = el.parentElement;
    while (s && s !== document.body) {
      const o = getComputedStyle(s).overflowY;
      if ((o === "auto" || o === "scroll") && s.scrollHeight > s.clientHeight) break;
      s = s.parentElement;
    }
    if (!s || s === document.body) {
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + m * scale - window.innerHeight / 2);
      return;
    }
    const r = s.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) s.scrollIntoView({ block: r.height < window.innerHeight ? "center" : "start" });
    const offset = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop;
    s.scrollTop = offset + m * scale - s.clientHeight / 2;
  }, minute);
}

/** Where a minute is on screen, in the blocks' column, once it is in view. Aim a minute past a mark: taps snap to five. */
export async function pointAt(timeline: Locator, minute: number, reveal = true): Promise<{ x: number; y: number }> {
  if (reveal) await showMinute(timeline, minute);
  // Wait for the page to hold still (a scroll still settling would move the minute from under the pointer).
  let box = await timeline.boundingBox();
  for (let i = 0; i < 20; i++) {
    await timeline.page().waitForTimeout(100);
    const next = await timeline.boundingBox();
    if (box && next && next.y === box.y && next.x === box.x) break;
    box = next;
  }
  if (!box) throw new Error("the timeline is not on screen");
  return { x: box.x + Math.round(box.width * 0.6), y: box.y + minute * (await scaleOf(timeline)) };
}

/** A block on the timeline, by its title. */
export function blockOn(timeline: Locator, title: string): Locator {
  return timeline.getByRole("button", { name: new RegExp(`^Block: ${title}, `) });
}

/** A block's accessible name says where it is: "Block: Lunch, 19:00 to 20:00". */
export async function expectBlockAt(block: Locator, start: number, end: number): Promise<void> {
  await expect(block).toHaveAttribute("aria-label", new RegExp(`, ${hhmm(start)} to ${hhmm(end)}(,|$)`));
}

/**
 * A native drag with the mouse, the way pragmatic-drag-and-drop hears it: a press, a nudge to start the drag, then
 * the way to the target in steps. `alt` holds Alt from the start of the drag to the drop (Alt+drag copies).
 */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: () => Promise<{ x: number; y: number }>,
  o: { alt?: boolean; beforeDrop?: () => Promise<void> } = {},
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (o.alt) await page.keyboard.down("Alt");
  await page.mouse.move(from.x + 4, from.y + 6, { steps: 3 });
  const target = await to();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.move(target.x, target.y + 0.5);
  await o.beforeDrop?.();
  await page.mouse.up();
  if (o.alt) await page.keyboard.up("Alt");
}

/**
 * The first start, of a few, with `len` minutes clear of the account's blocks and meetings on its day: CI's seed
 * puts blocks and meetings inside the working day, so the evening comes first.
 */
export async function quietStretch(c: Client, me: DevAccount, len = 240): Promise<number> {
  for (const start of [19 * 60, 20 * 60, 5 * 60, 0]) {
    const end = Math.min(24 * 60, start + len);
    const { rows } = await c.query<{ n: number }>(
      `select (select count(*) from public.time_blocks b where b.user_id = $1 and b.deleted_at is null
                  and b.start_at < ($2::date + make_interval(mins => $5)) at time zone $3
                  and b.end_at > ($2::date + make_interval(mins => $4)) at time zone $3)
            + (select count(*) from public.calendar_events e where e.user_id = $1 and e.deleted_at is null and not e.all_day
                  and e.start_at < ($2::date + make_interval(mins => $5)) at time zone $3
                  and e.end_at > ($2::date + make_interval(mins => $4)) at time zone $3) as n`,
      [me.uid, me.today, me.timezone, start, end],
    );
    if (Number(rows[0].n) === 0) return start;
  }
  return 19 * 60;
}

/** A task on the account's day (or another), as postgres, with a real sort key; returns its id. */
export async function seedTask(
  c: Client,
  me: DevAccount,
  title: string,
  o: { estimate?: number | null; doDate?: string | null; deadline?: string | null; key?: string } = {},
): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.tasks (id, space_id, title, state, do_date, deadline, estimate_min, sort_key)
     values (gen_random_uuid(), $1, $2, 'active', $3::date, $4::date, $5, $6) returning id`,
    [me.sid, title, o.doDate === undefined ? me.today : o.doDate, o.deadline ?? null, o.estimate === undefined ? 30 : o.estimate, o.key ?? seedKey(String(Date.now() % 1e9))],
  );
  return rows[0].id;
}

/** A block on the account's day, from `start` to `end` minutes, as postgres; returns its id. */
export async function seedBlock(c: Client, me: DevAccount, o: { taskId: string | null; title: string | null; start: number; end: number }): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.time_blocks (id, space_id, user_id, task_id, title, start_at, end_at, locked, source, push_state)
     values (gen_random_uuid(), $1, $2, $3, $4, ($5::date + make_interval(mins => $6)) at time zone $8, ($5::date + make_interval(mins => $7)) at time zone $8, false, 'manual', 'local')
     returning id`,
    [me.sid, me.uid, o.taskId, o.title, me.today, o.start, o.end, me.timezone],
  );
  return rows[0].id;
}

/** A block as Postgres has it, on the account's clock. */
export interface StoredBlock {
  id: string;
  title: string | null;
  task_id: string | null;
  s: string;
  e: string;
  locked: boolean;
  gone: boolean;
}

export const BLOCK_COLUMNS = `b.id, b.title, b.task_id, to_char(b.start_at at time zone s.timezone, 'HH24:MI') as s,
  to_char(b.end_at at time zone s.timezone, 'HH24:MI') as e, b.locked, b.deleted_at is not null as gone`;

/** The live blocks of a task, by its title, earliest first. */
export async function blocksOfTask(c: Client, title: string): Promise<StoredBlock[]> {
  return (
    await c.query<StoredBlock>(
      `select ${BLOCK_COLUMNS} from public.time_blocks b join public.tasks t on t.id = b.task_id join public.user_settings s on s.user_id = b.user_id
        where t.title = $1 and b.deleted_at is null order by b.start_at`,
      [title],
    )
  ).rows;
}

/** Polls until a task's live blocks read as `want` ("19:00–20:00" each, earliest first). */
export async function expectTaskBlocks(title: string, want: string[]): Promise<void> {
  await expect.poll(async () => (await withDb((c) => blocksOfTask(c, title))).map((b) => `${b.s}–${b.e}`), { timeout: 15_000 }).toEqual(want);
}

/** The live blocks of your own (no task) with this title, earliest first. */
export async function ownBlocks(c: Client, title: string): Promise<StoredBlock[]> {
  return (
    await c.query<StoredBlock>(
      `select ${BLOCK_COLUMNS} from public.time_blocks b join public.user_settings s on s.user_id = b.user_id
        where b.task_id is null and b.title = $1 and b.deleted_at is null order by b.start_at`,
      [title],
    )
  ).rows;
}

/** Polls until the blocks of your own with this title read as `want`. */
export async function expectOwnBlocks(title: string, want: string[]): Promise<void> {
  await expect.poll(async () => (await withDb((c) => ownBlocks(c, title))).map((b) => `${b.s}–${b.e}`), { timeout: 15_000 }).toEqual(want);
}
