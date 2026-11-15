// Gaps too short to use are not spare time (DECISIONS.md, amendment 2026-11-15): ten open minutes between two
// meetings hold no task, so Today's number leaves them out, the breakdown names them ("10m in gaps too short to
// use") so it still adds up, and under the pointer or the arrow keys the stretch says what it is.
//
// The day is made known, whatever the account's week looks like: its own working hours for today's weekday are
// taken off (a soft delete, put back exactly in afterAll) and one three-hour window of this spec's own takes their
// place, over a stretch with none of the account's blocks or meetings in it. Two meetings go on the account's
// calendar inside it, ten minutes apart, and the account's open tasks through today are stood aside (they start
// tomorrow; put back exactly), so nothing else is planned. All of it is removed in afterAll.
import type { Client } from "pg";
import { expect, test } from "./fixtures";
import { devAccount, hoursBack, hoursOff, putBack, standAside, withDb, workWeekday, type DevAccount, type HoursOff, type StoodAside } from "./db";
import { DEV_USER, openApp } from "./helpers";
import { hhmm } from "./timeline-helpers";

/** The working window, and where the two meetings sit in it: 30 free, 50 meeting, 10 open, 50 meeting, 40 free. */
const WINDOW = 180;
const A = { from: 30, to: 80, title: "E2E short gap first" };
const B = { from: 90, to: 140, title: "E2E short gap second" };
const EXTERNAL = "e2e-short-gap-";

let me: DevAccount;
let S = 19 * 60;
let skip: string | null = null;
let off: HoursOff[] = [];
let aside: StoodAside[] = [];
let ownHours: string | null = null;
let events: string[] = [];

/** No block and no timed calendar event of the account's between two minutes of its day. */
async function clear(c: Client, start: number, end: number): Promise<boolean> {
  const { rows } = await c.query<{ n: number }>(
    `select (select count(*) from public.time_blocks b where b.user_id = $1 and b.deleted_at is null
                and b.start_at < ($2::date + make_interval(mins => $5)) at time zone $3
                and b.end_at > ($2::date + make_interval(mins => $4)) at time zone $3)
          + (select count(*) from public.calendar_events e where e.user_id = $1 and e.deleted_at is null and not e.all_day
                and e.start_at < ($2::date + make_interval(mins => $5)) at time zone $3
                and e.end_at > ($2::date + make_interval(mins => $4)) at time zone $3) as n`,
    [me.uid, me.today, me.timezone, start, end],
  );
  return Number(rows[0].n) === 0;
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    // What an interrupted run may have left on the calendar.
    await c.query("delete from public.calendar_events where user_id = $1 and external_id like $2", [me.uid, `${EXTERNAL}%`]);
    // A calendar that counts as busy, to put the meetings on.
    const cal = (await c.query<{ id: string }>("select id from public.calendars where user_id = $1 and deleted_at is null and read order by created_at limit 1", [me.uid])).rows[0];
    if (!cal) {
      skip = "the account has no calendar that counts as busy";
      return;
    }
    // The evening first: the seed keeps its blocks and meetings inside the working day.
    const starts = [19 * 60, 20 * 60, 5 * 60, 0];
    let found: number | null = null;
    for (const start of starts) {
      if (await clear(c, start, start + WINDOW)) {
        found = start;
        break;
      }
    }
    if (found === null) {
      skip = "no three hours of the account's day are clear of its blocks and meetings";
      return;
    }
    S = found;

    off = await hoursOff(c, me, workWeekday(me.today));
    ownHours = (
      await c.query<{ id: string }>(
        `insert into public.work_hours (id, space_id, user_id, weekday, start_time, end_time)
         values (gen_random_uuid(), $1, $2, $3, $4::time, $5::time) returning id`,
        [me.sid, me.uid, workWeekday(me.today), hhmm(S), hhmm(S + WINDOW)],
      )
    ).rows[0].id;
    aside = await standAside(c, me);
    for (const m of [A, B]) {
      const { rows } = await c.query<{ id: string }>(
        `insert into public.calendar_events (id, space_id, user_id, calendar_id, external_id, summary, start_at, end_at, busy, status, self_response, event_type)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, ($6::date + make_interval(mins => $7)) at time zone $9, ($6::date + make_interval(mins => $8)) at time zone $9,
                 true, 'confirmed', 'accepted', 'default') returning id`,
        [me.sid, me.uid, cal.id, `${EXTERNAL}${m.from}-${Date.now().toString(36)}`, m.title, me.today, S + m.from, S + m.to, me.timezone],
      );
      events.push(rows[0].id);
    }
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    if (events.length > 0) await c.query("delete from public.calendar_events where id = any($1::uuid[])", [events]);
    events = [];
    if (ownHours) await c.query("delete from public.work_hours where id = $1", [ownHours]);
    await putBack(c, aside);
    await hoursBack(c, off);
  });
});

/** "2h 50m" → 170, "0m" → 0. */
const minutes = (words: string): number => {
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(words.trim());
  if (!m || (!m[1] && !m[2])) throw new Error(`not a duration: ${words}`);
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
};

/** The duration a term of the breakdown opens with: "25m buffer (15% of your working day)" → 25. */
const lead = (term: string | undefined): number => minutes(/^((?:\d+h)?\s?(?:\d+m)?)\s/.exec(term ?? "")?.[1] ?? "");

test("ten minutes between two meetings are named in the breakdown and left out of the spare figure", async ({ page }) => {
  test.skip(skip !== null, skip ?? "");
  await openApp(page, "/today");
  const ribbon = page.getByRole("region", { name: "Spare time today" });
  const button = ribbon.getByRole("button", { name: "Spare time breakdown" });
  await expect(button).toBeVisible();
  // The calendar mirror reaches a fresh device a moment after the first sync: the sentence is read once both
  // meetings are in it.
  await expect(button).toHaveAccessibleDescription(/^3h working − 1h 40m in meetings − 10m in gaps too short to use − .* buffer.* − .* planned = .* (spare|over)$/, { timeout: 30_000 });

  // The sentence adds up, and the figure is ten minutes less than work − meetings − buffer − planned.
  const describedBy = await button.getAttribute("aria-describedby");
  const sentence = (await page.locator(`[id="${describedBy}"]`).textContent()) ?? "";
  const [left, result] = sentence.split(" = ");
  const terms = left.split(" − ");
  const work = lead(terms.find((t) => / working$/.test(t)));
  const meetings = lead(terms.find((t) => / in meetings$/.test(t)));
  const gaps = lead(terms.find((t) => / in gaps too short to use$/.test(t)));
  const buffer = lead(terms.find((t) => / buffer/.test(t)));
  const planned = lead(terms.find((t) => / planned$/.test(t)));
  expect(terms).toHaveLength(5);
  expect(work).toBe(WINDOW);
  expect(meetings).toBe(A.to - A.from + (B.to - B.from));
  expect(gaps).toBe(B.from - A.to);
  expect(planned).toBe(0);
  const figure = /^(.+) (spare|over)$/.exec(result.trim());
  expect(figure).not.toBeNull();
  const spare = minutes(figure?.[1] ?? "") * (figure?.[2] === "over" ? -1 : 1);
  expect(spare).toBe(work - meetings - buffer - planned - 10);
  // The hero says the same figure.
  await expect(ribbon.getByText(figure?.[1] ?? "", { exact: true }).first()).toBeVisible();

  // The panel lists the gaps as a term of their own, after the meetings.
  await button.focus();
  await page.keyboard.press("Enter");
  const panel = ribbon.getByRole("group", { name: "Spare time breakdown" });
  await expect(panel).toBeVisible();
  const lines = panel.getByRole("listitem");
  await expect(lines).toHaveCount(6);
  await expect(lines.nth(1)).toHaveText(/1h 40m in meetings$/);
  await expect(lines.nth(2)).toHaveText(/10m in gaps too short to use$/);

  // Along the day the ten minutes say what they are, between the two meetings; the stretches around them are Free.
  const line = panel.locator("p[aria-live]");
  await expect(line).toHaveText(`Free · ${hhmm(S)}–${hhmm(S + A.from)} · 30m`);
  await page.keyboard.press("ArrowRight");
  await expect(line).toHaveText(new RegExp(`^Meeting · .* · ${hhmm(S + A.from)}–${hhmm(S + A.to)} · 50m$`));
  await page.keyboard.press("ArrowRight");
  await expect(line).toHaveText(`Too short to use · ${hhmm(S + A.to)}–${hhmm(S + B.from)} · 10m`);
  // It is still open time: something can be added there by hand.
  await expect(panel.getByRole("button", { name: "Add something" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(line).toHaveText(new RegExp(`^Meeting · .* · ${hhmm(S + B.from)}–${hhmm(S + B.to)} · 50m$`));
  await page.keyboard.press("ArrowRight");
  await expect(line).toHaveText(`Free · ${hhmm(S + B.to)}–${hhmm(S + WINDOW)} · 40m`);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
