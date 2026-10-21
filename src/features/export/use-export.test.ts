import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { LocalDatabase } from "@/data/powersync";
import { buildExport, readSnapshot } from "./build";
import { fetchFinishedTasks } from "./use-export";

describe("readSnapshot", () => {
  it("reads every exported table, leaving out soft-deleted rows where the table has them", async () => {
    const getAll = vi.fn(async (sql: string) => [{ id: sql }]);
    const snapshot = await readSnapshot(getAll as never);
    const sqls = getAll.mock.calls.map((c) => c[0]);
    expect(sqls).toContain("select * from tasks where deleted_at is null");
    expect(sqls).toContain("select * from user_settings");
    // The history of repeating tasks is part of the record: the server keeps it only a week.
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
