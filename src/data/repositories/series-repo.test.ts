// Series edits (SYSTEM_DESIGN.md §5.2; SCREENS.md §10), run against SQLite:
// just this once, change the rule, skip this occurrence, pause and resume —
// each with its exception rows, its toast and an undo that puts it all back.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { exceptionId } from "@/core/recurrence/exception-id";
import { localSqlite } from "@/test/local-sqlite";
import { SeriesRepo } from "./series-repo";
import { TaskRepo } from "./task-repo";

// Tuesday 6 October 2026, noon UTC.
beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-06T12:00:00Z"), toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

const SERIES = "0d6a3f9e-5b1c-4c2a-9f00-000000000001";

function setup(task: Record<string, string | number | null> = {}) {
  const s = localSqlite();
  s.insert("user_settings", { id: "u1", user_id: "u1", timezone: "UTC", day_rollover_hour: 4 });
  s.insert("tasks", {
    id: SERIES,
    space_id: "s1",
    title: "Water the plants",
    state: "active",
    do_date: "2026-10-12",
    recurrence_rule: "FREQ=WEEKLY;BYDAY=MO",
    recurrence_mode: "fixed",
    recurrence_series_id: SERIES,
    miss_policy: "skip",
    carry_count: 0,
    ...task,
  });
  const history = { record: vi.fn() };
  const entries = () => history.record.mock.calls.map((c) => c[0] as { label: string; toast: boolean; undo: () => Promise<void> });
  return { s, history, entries, repo: new SeriesRepo(s.db, history), tasks: new TaskRepo(s.db, history) };
}

const task = (s: ReturnType<typeof localSqlite>) => s.row("tasks", SERIES)!;
const exceptions = (s: ReturnType<typeof localSqlite>) => s.rows("select occurrence_date, kind, moved_to, deleted_at from recurrence_exceptions order by occurrence_date");

describe("Just this once", () => {
  it("moves the occurrence and writes a move exception named by its scheduled day; undo takes both back", async () => {
    const { s, repo, entries } = setup();
    await repo.moveOnce(SERIES, { doDate: localDate("2026-10-14") });
    expect(task(s)).toMatchObject({ do_date: "2026-10-14", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO" });
    expect(exceptions(s)).toEqual([{ occurrence_date: "2026-10-12", kind: "move", moved_to: "2026-10-14", deleted_at: null }]);
    expect(s.row("recurrence_exceptions", exceptionId(SERIES, "2026-10-12"))).not.toBeNull();
    expect(entries()[0]).toMatchObject({ label: "Moved “Water the plants” to Wed 14 Oct, just this once", toast: true });
    await entries()[0].undo();
    expect(task(s).do_date).toBe("2026-10-12");
    expect(exceptions(s)[0].deleted_at).not.toBeNull();
  });

  it("the series goes back to its rule after: completing the moved one records the scheduled day and lands on the next Monday", async () => {
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const { s, repo, tasks } = setup();
    await repo.moveOnce(SERIES, { doDate: localDate("2026-10-14") });
    await tasks.complete(SERIES);
    expect(task(s).do_date).toBe("2026-10-19");
    expect(s.rows("select occurrence_date from task_completions where deleted_at is null")).toEqual([{ occurrence_date: "2026-10-12" }]);
  });

  it("a second move updates the same exception, and moving back to its own day removes it", async () => {
    const { s, repo } = setup();
    await repo.moveOnce(SERIES, { doDate: localDate("2026-10-14") });
    await repo.moveOnce(SERIES, { doDate: localDate("2026-10-15") });
    expect(exceptions(s)).toEqual([{ occurrence_date: "2026-10-12", kind: "move", moved_to: "2026-10-15", deleted_at: null }]);
    await repo.moveOnce(SERIES, { doDate: localDate("2026-10-12") });
    expect(task(s).do_date).toBe("2026-10-12");
    expect(exceptions(s)[0].deleted_at).not.toBeNull();
  });

  it("an exception the server has soft-deleted comes back by being inserted deleted and then cleared", async () => {
    const { s, repo } = setup();
    await repo.moveOnce(SERIES, { doDate: localDate("2026-10-14") });
    await repo.moveOnce(SERIES, { doDate: localDate("2026-10-12") });
    s.drop("recurrence_exceptions", exceptionId(SERIES, "2026-10-12"));
    await repo.moveOnce(SERIES, { doDate: localDate("2026-10-13") });
    expect(exceptions(s)).toEqual([{ occurrence_date: "2026-10-12", kind: "move", moved_to: "2026-10-13", deleted_at: null }]);
  });
});

describe("Change the rule", () => {
  it("from a moved day: the rule moves onto it, future one-off changes are dropped and counted, and undo restores everything", async () => {
    const { s, repo, entries } = setup();
    s.insert("recurrence_exceptions", { id: "e-past", space_id: "s1", series_id: SERIES, occurrence_date: "2026-09-28", kind: "skip", moved_to: null });
    s.insert("recurrence_exceptions", { id: "e-next", space_id: "s1", series_id: SERIES, occurrence_date: "2026-10-19", kind: "skip", moved_to: null });
    await repo.changeRuleFrom(SERIES, { doDate: localDate("2026-10-14") });
    expect(task(s)).toMatchObject({ do_date: "2026-10-14", recurrence_rule: "FREQ=WEEKLY;BYDAY=WE" });
    expect(s.row("recurrence_exceptions", "e-next")?.deleted_at).not.toBeNull();
    expect(s.row("recurrence_exceptions", "e-past")?.deleted_at).toBeNull();
    expect(entries()[0]).toMatchObject({ label: "“Water the plants” now repeats every Wednesday · dropped 1 one-off change", toast: true });
    await entries()[0].undo();
    expect(task(s)).toMatchObject({ do_date: "2026-10-12", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO" });
    expect(s.row("recurrence_exceptions", "e-next")?.deleted_at).toBeNull();
  });

  it("from a day already past: the task goes to the first day of the new schedule from today", async () => {
    const { s, repo } = setup({ do_date: "2026-10-05" });
    await repo.changeRuleFrom(SERIES, { doDate: localDate("2026-10-01") });
    expect(task(s)).toMatchObject({ recurrence_rule: "FREQ=WEEKLY;BYDAY=TH", do_date: "2026-10-08" });
  });

  it("a new rule typed in restarts the series on its first day from today", async () => {
    const { s, repo, entries } = setup();
    await repo.changeRule(SERIES, "FREQ=WEEKLY;BYDAY=FR", "fixed");
    expect(task(s)).toMatchObject({ recurrence_rule: "FREQ=WEEKLY;BYDAY=FR", do_date: "2026-10-09" });
    expect(entries()[0].label).toBe("“Water the plants” now repeats every Friday");
  });
});

describe("Skip this occurrence", () => {
  it("moves on to the next occurrence with its deadline, writes no completion, and undo brings it back", async () => {
    const { s, repo, entries } = setup({ deadline: "2026-10-13" });
    await repo.skip(SERIES);
    expect(task(s)).toMatchObject({ do_date: "2026-10-19", deadline: "2026-10-20", state: "active" });
    expect(s.rows("select id from task_completions")).toEqual([]);
    expect(exceptions(s)).toEqual([{ occurrence_date: "2026-10-12", kind: "skip", moved_to: null, deleted_at: null }]);
    expect(entries()[0]).toMatchObject({ label: "Skipped “Water the plants” this time · next Mon 19 Oct", toast: true });
    await entries()[0].undo();
    expect(task(s)).toMatchObject({ do_date: "2026-10-12", deadline: "2026-10-13" });
    expect(exceptions(s)[0].deleted_at).not.toBeNull();
  });

  it("a missed one skips to the first occurrence still ahead", async () => {
    const { s, repo } = setup({ do_date: "2026-10-03", recurrence_rule: "FREQ=DAILY" });
    await repo.skip(SERIES);
    expect(task(s).do_date).toBe("2026-10-06");
  });

  it("does nothing to a task that does not repeat", async () => {
    const { s, repo, history } = setup({ recurrence_rule: null });
    await repo.skip(SERIES);
    expect(task(s).do_date).toBe("2026-10-12");
    expect(history.record).not.toHaveBeenCalled();
  });
});

describe("Pause and resume", () => {
  it("pausing until a day hides the task until the schedule's first day from then; resume brings it back from today", async () => {
    const { s, repo, entries } = setup({ do_date: "2026-10-05" });
    await repo.pause(SERIES, localDate("2026-10-14"));
    expect(task(s)).toMatchObject({ recurrence_paused_until: "2026-10-14", do_date: "2026-10-19" });
    expect(entries()[0].label).toBe("Paused “Water the plants” until Wed 14 Oct");
    await repo.resume(SERIES);
    expect(task(s)).toMatchObject({ recurrence_paused_until: null, do_date: "2026-10-12" });
    expect(entries()[1].label).toBe("Resumed “Water the plants” · next Mon 12 Oct");
    await entries()[1].undo();
    expect(task(s)).toMatchObject({ recurrence_paused_until: "2026-10-14", do_date: "2026-10-19" });
    await entries()[0].undo();
    expect(task(s)).toMatchObject({ recurrence_paused_until: null, do_date: "2026-10-05" });
  });
});
