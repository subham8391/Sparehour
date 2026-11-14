// Reopening from the older Logbook: the finished row comes back as a task with its steps and the tags that still
// exist, in the state un-completing gives, once; and one undo finishes it again as it was.
import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { reopenedState, restoreFinished, type FinishedToRestore } from "./finished-restore";
import type { UndoRecord } from "./undo";

const finished = (over: Partial<FinishedToRestore> = {}): FinishedToRestore => ({
  id: "t-old",
  space_id: "s1",
  project_id: "p1",
  heading_id: null,
  area_id: null,
  title: "Send the invoice",
  notes_md: "Number 12",
  state: "done",
  priority: 2,
  do_date: "2026-09-01",
  do_time: null,
  deadline: null,
  start_date: null,
  evening: true,
  estimate_min: 45,
  actual_min: null,
  carry_count: 3,
  miss_policy: "carry",
  recurrence_rule: null,
  recurrence_mode: null,
  recurrence_series_id: null,
  recurrence_paused_until: null,
  sort_key: "a4",
  day_sort_key: "a2",
  source: "quickadd",
  completed_at: "2026-09-01T16:00:00.123456+00:00",
  created_at: "2026-08-30T08:00:00+00:00",
  expired_at: "2026-09-02T00:00:00+00:00",
  checklist: [
    { title: "Attach the PDF", done: true },
    { title: "Copy Bea", done: false },
  ],
  tag_ids: ["g-client", "g-gone"],
  blocks: [{ start: "2026-09-01T15:00:00+00:00", end: "2026-09-01T15:45:00+00:00" }],
  occurrence_of: null,
  occurrence_date: null,
  ...over,
});

function setup() {
  const s = localSqlite();
  s.insert("projects", { id: "p1", space_id: "s1", name: "Launch", state: "active", sort_key: "a0" });
  s.insert("headings", { id: "h1", space_id: "s1", project_id: "p1", title: "Prep", sort_key: "a0" });
  s.insert("areas", { id: "a1", space_id: "s1", name: "Work", sort_key: "a0" });
  s.insert("tags", { id: "g-client", space_id: "s1", name: "client" });
  s.insert("tags", { id: "g-gone", space_id: "s1", name: "old", deleted_at: "2026-10-01T00:00:00Z" });
  const records: UndoRecord[] = [];
  return { s, records, history: { record: (r: UndoRecord) => void records.push(r) } };
}

describe("reopenedState", () => {
  it("is the Inbox when nothing files or dates the task, active otherwise", () => {
    expect(reopenedState({})).toBe("inbox");
    for (const filed of [{ project_id: "p" }, { area_id: "a" }, { do_date: "2026-09-01" }, { deadline: "2026-09-01" }, { start_date: "2026-09-01" }]) expect(reopenedState(filed)).toBe("active");
  });
});

describe("restoreFinished", () => {
  it("puts the task back with its steps in order and the tags that still exist; server-owned columns are left out", async () => {
    const { s, history, records } = setup();
    expect(await restoreFinished(s.db, history, finished())).toBe("t-old");
    const [task] = s.rows("select * from tasks");
    expect(task).toMatchObject({ id: "t-old", space_id: "s1", project_id: "p1", title: "Send the invoice", notes_md: "Number 12", state: "active", priority: 2, do_date: "2026-09-01", evening: 1, estimate_min: 45, sort_key: "a4", day_sort_key: "a2", completed_at: null, carry_count: 0, expired_at: null });
    const steps = s.rows("select title, done, task_id from checklist_items order by sort_key");
    expect(steps).toEqual([
      { title: "Attach the PDF", done: 1, task_id: "t-old" },
      { title: "Copy Bea", done: 0, task_id: "t-old" },
    ]);
    expect(s.rows("select tag_id from task_tags")).toEqual([{ tag_id: "g-client" }]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ label: "Reopened “Send the invoice”", toast: true, rows: { tasks: ["t-old"] } });
    expect((records[0].rows.checklist_items as string[]).length).toBe(2);
  });

  it("comes back unfiled when its project, heading or area has been deleted since, and into the Inbox if nothing else places it", async () => {
    const { s, history } = setup();
    s.insert("projects", { id: "p-gone", space_id: "s1", name: "Gone", state: "active", sort_key: "a1", deleted_at: "2026-10-01T00:00:00Z" });
    await restoreFinished(s.db, history, finished({ id: "t-a", project_id: "p-gone", heading_id: "h1", do_date: null }));
    await restoreFinished(s.db, history, finished({ id: "t-b", project_id: "p1", heading_id: "h-gone" }));
    await restoreFinished(s.db, history, finished({ id: "t-c", project_id: null, area_id: "a-gone", do_date: "2026-09-01" }));
    await restoreFinished(s.db, history, finished({ id: "t-d", project_id: null, area_id: "a1", do_date: null }));
    expect(s.rows("select id, project_id, heading_id, area_id, state from tasks order by id")).toEqual([
      { id: "t-a", project_id: null, heading_id: null, area_id: null, state: "inbox" },
      { id: "t-b", project_id: "p1", heading_id: null, area_id: null, state: "active" },
      { id: "t-c", project_id: null, heading_id: null, area_id: null, state: "active" },
      { id: "t-d", project_id: null, heading_id: null, area_id: "a1", state: "active" },
    ]);
  });

  it("undo finishes it again exactly as it was", async () => {
    const { s, history, records } = setup();
    await restoreFinished(s.db, history, finished());
    await records[0].undo();
    expect(s.rows("select state, completed_at from tasks")).toEqual([{ state: "done", completed_at: "2026-09-01T16:00:00.123456+00:00" }]);
  });

  it("writes nothing twice, and leaves a repeat's occurrence alone", async () => {
    const { s, history, records } = setup();
    await restoreFinished(s.db, history, finished({ checklist: null, tag_ids: null, project_id: null, do_date: null }));
    await restoreFinished(s.db, history, finished({ checklist: [{ title: "Again", done: false }] }));
    expect(s.rows("select state from tasks")).toEqual([{ state: "inbox" }]);
    expect(s.rows("select id from checklist_items")).toEqual([]);

    const record = vi.fn();
    expect(await restoreFinished(s.db, { record }, finished({ id: "c1", occurrence_of: "t-gym" }))).toBeNull();
    expect(record).not.toHaveBeenCalled();
    expect(s.rows("select id from tasks")).toHaveLength(1);
    // The second tap wrote nothing, so there is nothing of its own to undo.
    expect(records).toHaveLength(1);
  });
});
