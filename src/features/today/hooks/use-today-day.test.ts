// @vitest-environment jsdom
// Today on another day (SCREENS.md §2.1; DECISIONS.md "Today on another day"): the model over an in-memory
// database for today, a later day and a day that has passed. A later day has its own tasks and blocks and is
// reckoned from its start, not from now; a day that has passed keeps only its blocks; Carried over is today's alone.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import { localSqlite, type Row } from "@/test/local-sqlite";

const h = vi.hoisted(() => ({ answer: (() => []) as (sql: string, params: readonly unknown[]) => unknown[] }));
vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string, params?: unknown[]) => ({ data: h.answer(sql, params ?? []), isLoading: false }),
  useLocalDatabase: () => ({}),
}));
vi.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => ({ markAsked: vi.fn() }) }));

import { useToday } from "./use-today";

// Wednesday 7 October 2026, 10:00 UTC; 09:00–17:00 every day (work_hours.weekday 0 = Monday).
const NOW = instant("2026-10-07T10:00:00Z");
const WORK = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ id: `w${weekday}`, weekday, start_time: "09:00:00", end_time: "17:00:00", deleted_at: null }));
const TASKS: Row[] = [
  { id: "carried", title: "Reply to the landlord", do_date: "2026-10-05", carry_count: 1 },
  { id: "left-yesterday", title: "File the receipts", do_date: "2026-10-06", carry_count: 1 },
  { id: "today-1", title: "Draft the plan", do_date: "2026-10-07", estimate_min: 60 },
  { id: "tom-1", title: "Call the bank", do_date: "2026-10-08", estimate_min: 60 },
  { id: "tom-eve", title: "Read the novel", do_date: "2026-10-08", estimate_min: 45, evening: 1 },
  { id: "later", title: "Book the venue", do_date: "2026-10-10", estimate_min: 30 },
];
const BLOCKS: Row[] = [
  { id: "b-today", task_id: "today-1", title: null, start_at: "2026-10-07T09:00:00Z", end_at: "2026-10-07T10:00:00Z" },
  { id: "b-tom", task_id: null, title: "Gym", start_at: "2026-10-08T07:00:00Z", end_at: "2026-10-08T08:00:00Z" },
  { id: "b-past", task_id: null, title: "Deep work", start_at: "2026-10-06T15:00:00Z", end_at: "2026-10-06T16:00:00Z" },
];

beforeEach(() => {
  const db = localSqlite();
  TASKS.forEach((t, i) => db.insert("tasks", { space_id: "s1", state: "active", deleted_at: null, sort_key: `a${i}`, day_sort_key: `a${i}`, start_date: null, evening: 0, ...t }));
  BLOCKS.forEach((b) => db.insert("time_blocks", { user_id: "u1", deleted_at: null, locked: 0, source: "manual", ...b }));
  h.answer = (sql, params) => {
    if (sql === SETTINGS_SQL) return [{ id: "set1", timezone: "UTC", day_rollover_hour: 4, buffer_pct: 0, default_estimate_min: 30 }];
    if (sql === WORK_HOURS_SQL) return WORK;
    try {
      return db.rows(sql, params as (string | number | null)[]);
    } catch {
      return []; // tables the harness does not have (calendars, events, connections): empty, as with no calendar
    }
  };
});

const model = (day?: string) => renderHook(() => useToday(NOW, day ? localDate(day) : null)).result.current;
const ids = (tasks: readonly { id: string }[]) => tasks.map((t) => t.id);

describe("useToday on today", () => {
  it("is today, with Carried over, today's list and blocks, and a finish counted from now", () => {
    const m = model();
    expect(m).toMatchObject({ onToday: true, past: false });
    expect(m.day.toString()).toBe("2026-10-07");
    expect(ids(m.carried)).toEqual(["carried", "left-yesterday"]);
    expect(ids(m.todayTasks)).toEqual(["today-1"]);
    expect(m.blocks.map((b) => b.id)).toEqual(["b-today"]);
    expect(m.capacity?.day.toString()).toBe("2026-10-07");
  });

  it("a ?day= naming today is today", () => {
    expect(model("2026-10-07")).toMatchObject({ onToday: true, past: false });
  });
});

describe("useToday on a later day", () => {
  it("shows that day's tasks, evening and blocks, and no Carried over", () => {
    const m = model("2026-10-08");
    expect(m).toMatchObject({ onToday: false, past: false });
    expect(m.today.toString()).toBe("2026-10-07");
    expect(m.day.toString()).toBe("2026-10-08");
    expect(m.carried).toEqual([]);
    expect(m.freshAsks).toEqual([]);
    expect(ids(m.todayTasks)).toEqual(["tom-1"]);
    expect(ids(m.eveningTasks)).toEqual(["tom-eve"]);
    expect(m.blocks.map((b) => [b.id, b.title, b.start])).toEqual([["b-tom", "Gym", 7 * 60]]);
  });

  it("measures that day from its start: no now, so its finish is where the work runs out", () => {
    const c = model("2026-10-08").capacity;
    expect(c?.day.toString()).toBe("2026-10-08");
    // An hour unscheduled from 09:00, the evening and the early block kept out: done by 10:00.
    expect(c?.unscheduledMin).toBe(60);
    expect(c?.eveningMin).toBe(45);
    expect(c?.projectedFinish?.toString()).toBe("10:00:00");
  });

  it("a later day further out leaves the days between alone", () => {
    expect(ids(model("2026-10-10").todayTasks)).toEqual(["later"]);
    expect(ids(model("2026-10-09").todayTasks)).toEqual([]);
  });
});

describe("useToday on a day that has passed", () => {
  it("keeps only its blocks: what was left open there is today's Carried over", () => {
    const m = model("2026-10-06");
    expect(m).toMatchObject({ onToday: false, past: true });
    expect(m.carried).toEqual([]);
    expect(m.todayTasks).toEqual([]);
    expect(m.eveningTasks).toEqual([]);
    expect(m.blocks.map((b) => [b.id, b.title])).toEqual([["b-past", "Deep work"]]);
    expect(m.capacity?.unscheduledMin).toBe(0);
    expect(m.capacity?.committedMin).toBe(60);
  });
});
