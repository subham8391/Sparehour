// Finished tasks are kept (migration 20261114000100; DECISIONS.md, amendment 2026-11-14). The contract: the nightly
// job moves a task finished more than a week ago out of `tasks` into `finished_tasks` with its steps, tags and
// blocks folded into the row, and a repeat's old completion records become rows there too; a task finished this
// week and everything still open stay as they were; one a person deleted is not kept. A person reads only their
// own, a page at a time, and writes none of it; a task put back in `tasks` leaves `finished_tasks`.
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, inTx as inTxOn, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();
const inTx = (fn: (c: Client) => Promise<void>) => inTxOn(admin, fn);

type Row = Record<string, unknown>;

async function task(c: Client, sid: string, title: string, over: { state?: string; finishedAgo?: string | null; cols?: Row } = {}): Promise<string> {
  const cols = over.cols ?? {};
  const names = Object.keys(cols);
  const { rows } = await c.query<{ id: string }>(
    `insert into public.tasks (space_id, title, sort_key, state, completed_at${names.map((n) => `, ${n}`).join("")})
     values ($1, $2, 'a0', $3, case when $4::text is null then null else now() - $4::interval end${names.map((_, i) => `, $${i + 5}`).join("")}) returning id`,
    [sid, title, over.state ?? "done", over.finishedAgo === undefined ? "8 days" : over.finishedAgo, ...names.map((n) => cols[n])],
  );
  return rows[0].id;
}

const page = async (c: Client, args: Row = {}) => {
  const names = Object.keys(args);
  const { rows } = await c.query<Row>(`select *, completed_at::text as at from public.finished_tasks_page(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`, names.map((n) => args[n]));
  return rows;
};
const titles = (rows: Row[]) => rows.map((r) => r.title);

describe.skipIf(admin === null)("finished tasks contract", () => {
  afterAll(async () => {
    await admin?.end();
  });

  it("moves week-old done tasks with their steps, tags and blocks; keeps recent and open ones where they were", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "finished-a@contract.test");
      const sid = await spaceOf(c, uid);
      const project = (await c.query<{ id: string }>("insert into public.projects (space_id, name, sort_key) values ($1, 'Launch', 'a0') returning id", [sid])).rows[0].id;
      const old = await task(c, sid, "Finished last week", { cols: { project_id: project, notes_md: "Sent to Bea", estimate_min: 45, priority: 2 } });
      const fresh = await task(c, sid, "Finished on Tuesday", { finishedAgo: "2 days" });
      const open = await task(c, sid, "Still open", { state: "active", finishedAgo: null });
      const deleted = await task(c, sid, "Finished, then deleted", { cols: { deleted_at: new Date() } });

      await c.query("insert into public.checklist_items (space_id, task_id, title, done, sort_key) values ($1, $2, 'First step', true, 'a0'), ($1, $2, 'Second step', false, 'a1')", [sid, old]);
      const tag = (await c.query<{ id: string }>("insert into public.tags (space_id, name) values ($1, 'client') returning id", [sid])).rows[0].id;
      await c.query("insert into public.task_tags (space_id, task_id, tag_id) values ($1, $2, $3)", [sid, old, tag]);
      const block = (
        await c.query<{ id: string }>(
          `insert into public.time_blocks (space_id, user_id, task_id, start_at, end_at, push_state)
           values ($1, $2, $3, now() - interval '8 days', now() - interval '8 days' + interval '45 minutes', 'local') returning id`,
          [sid, uid, old],
        )
      ).rows[0].id;

      // The job sweeps the whole database (the seed has old done rows of its own), so count at least ours.
      const { rows } = await c.query<{ n: number }>("select private.archive_done_tasks() as n");
      expect(rows[0].n).toBeGreaterThanOrEqual(1);

      const left = (await c.query<{ id: string }>("select id from public.tasks where id = any($1::uuid[])", [[old, fresh, open, deleted]])).rows.map((r) => r.id).sort();
      expect(left).toEqual([fresh, open].sort());
      const kept = (await c.query<Row>("select * from public.finished_tasks where space_id = $1", [sid])).rows;
      expect(kept).toHaveLength(1);
      expect(kept[0]).toMatchObject({
        id: old,
        title: "Finished last week",
        state: "done",
        project_id: project,
        notes_md: "Sent to Bea",
        estimate_min: 45,
        priority: 2,
        checklist: [
          { title: "First step", done: true },
          { title: "Second step", done: false },
        ],
        tag_ids: [tag],
        occurrence_of: null,
      });
      expect(kept[0].completed_at).toBeInstanceOf(Date);
      expect((kept[0].blocks as { start: string; end: string }[]).map((b) => Date.parse(b.end) - Date.parse(b.start))).toEqual([45 * 60_000]);

      // Out of the synced tables, as the purge took them; the block is soft-deleted for the calendar worker.
      expect((await c.query<{ n: number }>("select count(*)::int as n from public.checklist_items where task_id = $1", [old])).rows[0].n).toBe(0);
      expect((await c.query<{ n: number }>("select count(*)::int as n from public.task_tags where task_id = $1", [old])).rows[0].n).toBe(0);
      const b = (await c.query<{ task_id: string | null; deleted_at: Date | null }>("select task_id, deleted_at from public.time_blocks where id = $1", [block])).rows[0];
      expect(b.task_id).toBeNull();
      expect(b.deleted_at).not.toBeNull();

      // A task with nothing attached keeps its row narrow: no empty arrays.
      const bare = await task(c, sid, "Nothing attached");
      await c.query("select private.archive_done_tasks()");
      expect((await c.query<Row>("select checklist, tag_ids, blocks from public.finished_tasks where id = $1", [bare])).rows[0]).toEqual({ checklist: null, tag_ids: null, blocks: null });
    }));

  it("a repeat's old completion records become rows of their own, once; recent ones stay", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "finished-b@contract.test");
      const sid = await spaceOf(c, uid);
      const gym = await task(c, sid, "Gym", { state: "active", finishedAgo: null, cols: { recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", estimate_min: 60 } });
      const made = await c.query<{ id: string; occurrence_date: string }>(
        `insert into public.task_completions (space_id, task_id, occurrence_date, completed_at, actual_min)
         values ($1, $2, current_date - 15, now() - interval '15 days', 50), ($1, $2, current_date - 1, now() - interval '1 day', null)
         returning id, occurrence_date::text`,
        [sid, gym],
      );
      const [oldCompletion, recentCompletion] = made.rows;

      await c.query("select private.archive_done_tasks()");
      await c.query("select private.archive_done_tasks()");

      const kept = (await c.query<Row>("select id, title, state, estimate_min, actual_min, occurrence_of, occurrence_date::text, do_date::text, recurrence_rule from public.finished_tasks where space_id = $1", [sid])).rows;
      expect(kept).toEqual([
        { id: oldCompletion.id, title: "Gym", state: "done", estimate_min: 60, actual_min: 50, occurrence_of: gym, occurrence_date: oldCompletion.occurrence_date, do_date: oldCompletion.occurrence_date, recurrence_rule: "FREQ=WEEKLY;BYDAY=MO" },
      ]);
      // The repeating task itself stays, with the completion still inside the week.
      expect((await c.query<{ state: string }>("select state from public.tasks where id = $1", [gym])).rows[0].state).toBe("active");
      expect((await c.query<{ id: string }>("select id from public.task_completions where space_id = $1", [sid])).rows.map((r) => r.id)).toEqual([recentCompletion.id]);
    }));

  it("is read a page at a time by its owner only, with the Logbook's filters, and written by no one signed in", () =>
    inTx(async (c) => {
      const me = await newUser(c, "finished-c@contract.test");
      const other = await newUser(c, "finished-c2@contract.test");
      const mine = await spaceOf(c, me);
      const theirs = await spaceOf(c, other);
      const area = (await c.query<{ id: string }>("insert into public.areas (space_id, name, sort_key) values ($1, 'Work', 'a0') returning id", [mine])).rows[0].id;
      const project = (await c.query<{ id: string }>("insert into public.projects (space_id, area_id, name, sort_key) values ($1, $2, 'Launch', 'a0') returning id", [mine, area])).rows[0].id;
      const tag = (await c.query<{ id: string }>("insert into public.tags (space_id, name) values ($1, 'Client') returning id", [mine])).rows[0].id;
      const invoice = await task(c, mine, "Send the invoice", { finishedAgo: "10 days", cols: { project_id: project } });
      const rent = await task(c, mine, "Pay the rent", { finishedAgo: "20 days", cols: { notes_md: "invoice number 12" } });
      const filed = await task(c, mine, "File the receipts", { finishedAgo: "30 days", cols: { area_id: area } });
      await c.query("insert into public.task_tags (space_id, task_id, tag_id) values ($1, $2, $3)", [mine, rent, tag]);
      // Two finished in one instant, as a bulk complete writes them.
      await task(c, mine, "Twin A", { finishedAgo: "40 days" });
      await task(c, mine, "Twin B", { finishedAgo: "40 days" });
      await task(c, theirs, "Someone else's invoice", { finishedAgo: "10 days" });
      await c.query("select private.archive_done_tasks()");

      await asUser(c, me);
      expect(titles(await page(c))).toEqual(["Send the invoice", "Pay the rent", "File the receipts", expect.stringMatching(/^Twin/), expect.stringMatching(/^Twin/)]);
      // Words: every word, in the title or the note, any case.
      expect(titles(await page(c, { p_words: ["INVOICE"] }))).toEqual(["Send the invoice", "Pay the rent"]);
      expect(titles(await page(c, { p_words: ["invoice", "send"] }))).toEqual(["Send the invoice"]);
      expect(titles(await page(c, { p_words: ["100%"] }))).toEqual([]);
      // The Logbook's filters: a project, an area (its own tasks and its projects'), a tag by name, a span of days.
      expect(titles(await page(c, { p_project: project }))).toEqual(["Send the invoice"]);
      expect(titles(await page(c, { p_area: area }))).toEqual(["Send the invoice", "File the receipts"]);
      expect(titles(await page(c, { p_tag: "client" }))).toEqual(["Pay the rent"]);
      const span = (await c.query<{ a: Date; b: Date }>("select now() - interval '25 days' as a, now() - interval '15 days' as b")).rows[0];
      expect(titles(await page(c, { p_from: span.a, p_to: span.b }))).toEqual(["Pay the rent"]);
      // Pages: the cursor is the last row seen, so two finished in the same instant are both reached, once each.
      const first = await page(c, { p_limit: 4 });
      // The instant goes back as it was read, to the microsecond (a JS Date would round it).
      const second = await page(c, { p_limit: 4, p_before: first[3].at, p_after_id: first[3].id });
      expect(titles([...first, ...second]).sort()).toEqual(["File the receipts", "Pay the rent", "Send the invoice", "Twin A", "Twin B"]);
      // The table itself: only their own rows, and no writes.
      expect(titles((await c.query<Row>("select title from public.finished_tasks where title like '%invoice%'")).rows)).toEqual(["Send the invoice"]);
      for (const sql of [`update public.finished_tasks set title = 'Mine now'`, `delete from public.finished_tasks`, `insert into public.finished_tasks (space_id, title, sort_key, state, completed_at) values ('${mine}', 'Made up', 'a0', 'done', now())`]) {
        await c.query("savepoint refused");
        await expect(c.query(sql)).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint refused");
      }
      await c.query("savepoint refused");
      await expect(c.query("select private.archive_done_tasks()")).rejects.toThrow(/permission denied/);
      await c.query("rollback to savepoint refused");

      await asUser(c, other);
      expect(titles(await page(c))).toEqual(["Someone else's invoice"]);
      expect(titles(await page(c, { p_project: project }))).toEqual([]);
      await asAdmin(c);
      expect([invoice, filed].every(Boolean)).toBe(true);
    }));

  it("a task put back in tasks leaves finished_tasks, in its own space only", () =>
    inTx(async (c) => {
      const me = await newUser(c, "finished-d@contract.test");
      const other = await newUser(c, "finished-d2@contract.test");
      const mine = await spaceOf(c, me);
      const theirs = await spaceOf(c, other);
      const old = await task(c, mine, "Reopen me", { finishedAgo: "30 days" });
      const notMine = await task(c, theirs, "Not yours", { finishedAgo: "30 days" });
      await c.query("select private.archive_done_tasks()");

      // Reopen, as the app writes it: the same id, through the usual upload, as the person.
      await asUser(c, me);
      const out = await c.query<{ r: { applied: string[]; rejected: unknown[] } }>("select public.apply_mutations('dev-1', $1::jsonb) as r", [
        JSON.stringify([
          { client_id: "c1", op: "PUT", table: "tasks", id: old, data: { space_id: mine, title: "Reopen me", state: "inbox", sort_key: "a0", priority: 0, evening: false, miss_policy: "carry", source: "quickadd" } },
          // Someone else's finished id, written into my space: mine is made, theirs is untouched.
          { client_id: "c2", op: "PUT", table: "tasks", id: notMine, data: { space_id: mine, title: "Borrowed id", state: "inbox", sort_key: "a1", priority: 0, evening: false, miss_policy: "carry", source: "quickadd" } },
        ]),
      ]);
      expect(out.rows[0].r.rejected).toEqual([]);
      await asAdmin(c);
      expect((await c.query<{ state: string }>("select state from public.tasks where id = $1", [old])).rows[0].state).toBe("inbox");
      expect((await c.query<{ id: string }>("select id from public.finished_tasks where id = any($1::uuid[])", [[old, notMine]])).rows.map((r) => r.id)).toEqual([notMine]);
      // Finished again and a week on, it is filed again.
      await c.query("update public.tasks set state = 'done', completed_at = now() - interval '9 days' where id = $1", [old]);
      await c.query("select private.archive_done_tasks()");
      expect((await c.query<{ n: number }>("select count(*)::int as n from public.finished_tasks where id = $1", [old])).rows[0].n).toBe(1);
    }));

  it("has every column a task has, so nothing a task carries is lost when it is filed", () =>
    inTx(async (c) => {
      const cols = async (table: string) =>
        (await c.query<{ c: string }>("select column_name || ':' || data_type as c from information_schema.columns where table_schema = 'public' and table_name = $1 order by 1", [table])).rows.map((r) => r.c);
      const finished = new Set(await cols("finished_tasks"));
      expect((await cols("tasks")).filter((col) => !finished.has(col))).toEqual([]);
      // It is never synced: devices keep a week, and the rest is asked for.
      expect((await c.query("select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'finished_tasks'")).rows).toEqual([]);
    }));
});
