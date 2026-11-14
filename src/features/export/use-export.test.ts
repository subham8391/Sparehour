import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { LocalDatabase } from "@/data/powersync";
import { buildExport, readSnapshot } from "./build";
import type { FinishedRow } from "@/features/finished/finished";
import { withFinished } from "./older";
import { fetchFinishedTasks, fetchOlderFinished } from "./use-export";

describe("readSnapshot", () => {
  it("reads every exported table, leaving out soft-deleted rows where the table has them", async () => {
    const getAll = vi.fn(async (sql: string) => [{ id: sql }]);
    const snapshot = await readSnapshot(getAll as never);
    const sqls = getAll.mock.calls.map((c) => c[0]);
    expect(sqls).toContain("select * from tasks where deleted_at is null");
    expect(sqls).toContain("select * from user_settings");
    // The history of repeating tasks is part of the record.
    expect(sqls).toContain("select * from task_completions where deleted_at is null");
    expect(sqls).toContain("select * from recurrence_exceptions where deleted_at is null");
    expect(sqls).toHaveLength(16);
    expect(snapshot.tasks).toEqual([{ id: "select * from tasks where deleted_at is null" }]);
  });
});

/** A database whose logbook subscription syncs when `sync` resolves (or never). */
function fakeDb(sync: Promise<void> | "never") {
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(async () => ({
    name: "logbook",
    parameters: null,
    unsubscribe,
    waitForFirstSync: (abort?: AbortSignal) =>
      sync === "never"
        ? new Promise<void>((_, reject) => abort?.addEventListener("abort", () => reject(new Error("aborted"))))
        : sync,
  }));
  const syncStream = vi.fn(() => ({ subscribe }));
  return { db: { syncStream } as unknown as Pick<LocalDatabase, "syncStream">, syncStream, subscribe, unsubscribe };
}

describe("fetchFinishedTasks", () => {
  afterEach(() => vi.useRealTimers());

  it("subscribes the logbook stream for the months a finished task can be in, and waits for it", async () => {
    const f = fakeDb(Promise.resolve());
    const finished = await fetchFinishedTasks(f.db, localDate("2026-10-01"), 5_000);
    expect(f.syncStream).toHaveBeenCalledWith("logbook", { months: ["2026-10", "2026-09"] });
    expect(f.subscribe).toHaveBeenCalledWith({ ttl: 3600 });
    expect(finished.synced).toBe(true);
    expect(f.unsubscribe).not.toHaveBeenCalled();
    finished.release();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout and says the finished tasks are missing, without an unhandled rejection", async () => {
    vi.useFakeTimers();
    const f = fakeDb("never");
    const pending = fetchFinishedTasks(f.db, localDate("2026-10-01"), 2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const finished = await pending;
    expect(finished.synced).toBe(false);
    finished.release();
    expect(f.unsubscribe).toHaveBeenCalled();
  });
});

describe("buildExport", () => {
  const snapshot = {
    areas: [],
    projects: [],
    headings: [],
    tasks: [{ id: "t1", title: "Call Mum", state: "inbox", sort_key: "a0" }],
    checklist_items: [],
    tags: [],
    task_tags: [],
    task_completions: [],
    recurrence_exceptions: [],
    time_blocks: [],
    day_plans: [],
    work_hours: [],
    lists: [],
    list_items: [],
    list_item_tags: [],
    user_settings: [],
  };
  const now = new Date("2026-09-14T12:00:00Z");

  it("names the files by the day and gives each its type", async () => {
    const json = buildExport("json", snapshot, now);
    expect(json.name).toBe("sparehour-export-2026-09-14.json");
    expect(json.blob.type).toBe("application/json");
    const parsed = JSON.parse(await json.blob.text());
    expect(parsed.tables.tasks[0].title).toBe("Call Mum");
    expect(parsed.finished_tasks_included).toBe(true);
    const csv = buildExport("csv", snapshot, now);
    expect(csv.name).toBe("sparehour-tasks-2026-09-14.csv");
    expect(await csv.blob.text()).toContain("t1,Call Mum,inbox");
  });

  it("the Markdown export is a zip with one file per list", async () => {
    const md = buildExport("markdown", snapshot, now);
    expect(md.name).toBe("sparehour-markdown-2026-09-14.zip");
    const files = unzipSync(new Uint8Array(await md.blob.arrayBuffer()));
    expect(Object.keys(files)).toContain("README.md");
    expect(Object.keys(files)).toContain("inbox.md");
    expect(new TextDecoder().decode(files["inbox.md"])).toContain("- [ ] Call Mum");
  });

  it("an export made without the finished tasks says so in the file", async () => {
    const json = JSON.parse(await buildExport("json", snapshot, now, { finishedTasks: false }).blob.text());
    expect(json.finished_tasks_included).toBe(false);
    const files = unzipSync(new Uint8Array(await buildExport("markdown", snapshot, now, { finishedTasks: false }).blob.arrayBuffer()));
    expect(new TextDecoder().decode(files["README.md"])).toContain("Finished tasks are not in this export");
  });
});

describe("the export's older finished tasks (DECISIONS.md, amendment 2026-11-14)", () => {
  const base = {
    areas: [],
    projects: [],
    headings: [],
    tasks: [{ id: "t-week", title: "Finished this week", state: "done", completed_at: "2026-11-12T10:00:00Z" }],
    checklist_items: [],
    tags: [{ id: "g1", name: "client" }],
    task_tags: [],
    task_completions: [],
    recurrence_exceptions: [],
    time_blocks: [],
    day_plans: [],
    work_hours: [],
    user_settings: [],
    lists: [],
    list_items: [],
    list_item_tags: [],
  };
  const finished = (over: Partial<FinishedRow>): FinishedRow =>
    ({ id: "t-old", space_id: "s1", title: "Send the invoice", state: "done", evening: false, completed_at: "2026-09-01T16:00:00+00:00", created_at: "2026-08-30T08:00:00+00:00", updated_at: "2026-09-01T16:00:00+00:00", checklist: null, tag_ids: null, blocks: null, occurrence_of: null, occurrence_date: null, actual_min: null, ...over }) as FinishedRow;

  it("unfolds each into the tables the files are built from: the task, its steps in order, its tags; a repeat's day as a completion", () => {
    let n = 0;
    const out = withFinished(
      base,
      [
        finished({ checklist: [{ title: "Attach the PDF", done: true }, { title: "Copy Bea", done: false }], tag_ids: ["g1"] }),
        finished({ id: "c1", title: "Gym", occurrence_of: "t-gym", occurrence_date: "2026-09-02", actual_min: 50, completed_at: "2026-09-02T07:00:00+00:00" }),
      ],
      () => `new-${++n}`,
    );
    expect(out.tasks.map((t) => t.id)).toEqual(["t-week", "t-old"]);
    expect(out.tasks[1]).toMatchObject({ title: "Send the invoice", state: "done", evening: 0, completed_at: "2026-09-01T16:00:00+00:00" });
    expect(Object.keys(out.tasks[1])).not.toEqual(expect.arrayContaining(["checklist", "tag_ids", "occurrence_of"]));
    expect(out.checklist_items).toEqual([
      expect.objectContaining({ id: "new-1", task_id: "t-old", title: "Attach the PDF", done: 1, sort_key: "a0000" }),
      expect.objectContaining({ id: "new-2", task_id: "t-old", title: "Copy Bea", done: 0, sort_key: "a0001" }),
    ]);
    expect(out.task_tags).toEqual([expect.objectContaining({ id: "new-3", task_id: "t-old", tag_id: "g1" })]);
    expect(out.task_completions).toEqual([expect.objectContaining({ id: "c1", task_id: "t-gym", occurrence_date: "2026-09-02", completed_at: "2026-09-02T07:00:00+00:00", actual_min: 50 })]);
    // The snapshot it was given is not changed.
    expect(base.tasks).toHaveLength(1);
  });

  it("leaves a task that is back on the device as the device has it, and an empty answer changes nothing", () => {
    expect(withFinished(base, [finished({ id: "t-week", title: "Stale copy" })]).tasks).toEqual(base.tasks);
    expect(withFinished(base, [])).toBe(base);
  });

  it("the older ones reach every format: the JSON holds the row, and the file says the record is whole", () => {
    const { blob } = buildExport("json", withFinished(base, [finished({})]), new Date("2026-11-14T10:00:00Z"), { finishedTasks: true });
    return blob.text().then((text) => {
      const parsed = JSON.parse(text);
      expect(parsed.tables.tasks.map((t: { id: string }) => t.id)).toEqual(["t-week", "t-old"]);
    });
  });

  it("fetching them answers the rows, or null when the server could not be reached", async () => {
    expect(await fetchOlderFinished(async () => [finished({})])).toHaveLength(1);
    expect(await fetchOlderFinished(async () => Promise.reject(new Error("offline")))).toBeNull();
  });
});
