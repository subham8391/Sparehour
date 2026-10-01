// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRow } from "@/data/schema.client";

// The local database as the hook sees it: the open list through today, and the frozen rows read back by id.
const db = vi.hoisted(() => ({ open: [] as unknown[], live: [] as unknown[], loading: false }));
vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => {
    if (/state in \('inbox','active'\)/.test(sql)) return { data: db.open, isLoading: db.loading };
    if (/id in \(/.test(sql)) return { data: db.live, isLoading: false };
    return { data: [], isLoading: false };
  },
}));

import { localDate } from "@/core/time";
import { useShutdownCarry } from "./shutdown-carry";

const TODAY = localDate("2026-09-14");
const row = (id: string, title: string, over: Partial<TaskRow> = {}): TaskRow => ({ id, title, state: "active", do_date: "2026-09-14", evening: 0, ...over }) as unknown as TaskRow;

function repo() {
  return { reschedule: vi.fn(async () => {}), setState: vi.fn(async () => {}), updateMany: vi.fn(async () => {}) };
}

function setup(over: { dayKnown?: boolean; settled?: boolean } = {}) {
  const tasks = repo();
  const hook = renderHook((p: { dayKnown: boolean; settled: boolean }) => useShutdownCarry({ today: TODAY, tasks, ...p }), { initialProps: { dayKnown: true, settled: true, ...over } });
  return { tasks, ...hook };
}

beforeEach(() => {
  db.open = [row("u1", "Book dentist"), row("u2", "Research CalDAV", { do_date: "2026-09-12" }), row("e1", "Read", { evening: 1 })];
  db.live = [...db.open];
  db.loading = false;
});

describe("useShutdownCarry", () => {
  it("waits for the person's day and the first read before it freezes the list, and leaves evening tasks out", () => {
    db.loading = true;
    const { result, rerender } = setup({ dayKnown: false });
    expect(result.current.ready).toBe(false);
    db.loading = false;
    rerender({ dayKnown: false, settled: true });
    expect(result.current.ready).toBe(false);
    rerender({ dayKnown: true, settled: true });
    expect(result.current.ready).toBe(true);
    expect(result.current.rows.map((r) => [r.task.id, r.outcome])).toEqual([
      ["u1", null],
      ["u2", null],
    ]);
  });

  it("Move all to tomorrow is one write for every waiting row, and the rows stay with their outcome once they leave the open list", () => {
    const { result, rerender, tasks } = setup();
    act(() => result.current.carry("u2", "keep"));
    act(() => result.current.carryAll());
    // One statement, one undo entry: the repository names it "Moved 2 tasks to tomorrow" (or the title for one).
    expect(tasks.updateMany).toHaveBeenCalledTimes(1);
    expect(tasks.updateMany).toHaveBeenCalledWith(["u1"], { doDate: localDate("2026-09-15") }, "Moved {title} to tomorrow");
    expect(tasks.reschedule).not.toHaveBeenCalled();
    // The write lands: u1 leaves the open list for tomorrow.
    db.open = [db.open[1]];
    db.live = [row("u1", "Book dentist", { do_date: "2026-09-15" }), row("u2", "Research CalDAV", { do_date: "2026-09-12" })];
    rerender({ dayKnown: true, settled: true });
    expect(result.current.rows.map((r) => [r.task.id, r.outcome])).toEqual([
      ["u1", "tomorrow"],
      ["u2", "kept"],
    ]);
  });

  it("moves all waiting rows at once when there are several, and an undo puts them back to waiting", () => {
    const { result, rerender, tasks } = setup();
    act(() => result.current.carryAll());
    expect(tasks.updateMany).toHaveBeenCalledWith(["u1", "u2"], { doDate: localDate("2026-09-15") }, "Moved {title} to tomorrow");
    db.open = [];
    db.live = [row("u1", "Book dentist", { do_date: "2026-09-15" }), row("u2", "Research CalDAV", { do_date: "2026-09-15" })];
    rerender({ dayKnown: true, settled: true });
    expect(result.current.rows.map((r) => r.outcome)).toEqual(["tomorrow", "tomorrow"]);
    // The toast's Undo restores both rows' days.
    db.live = [row("u1", "Book dentist"), row("u2", "Research CalDAV", { do_date: "2026-09-12" })];
    rerender({ dayKnown: true, settled: true });
    expect(result.current.rows.map((r) => r.outcome)).toEqual([null, null]);
  });

  it("each row's answer goes to the repository; Keep for today writes nothing", () => {
    const { result, rerender, tasks } = setup();
    act(() => result.current.carry("u1", "tomorrow"));
    act(() => result.current.carry("u2", "drop"));
    expect(tasks.reschedule).toHaveBeenCalledWith("u1", localDate("2026-09-15"));
    expect(tasks.setState).toHaveBeenCalledWith("u2", "dropped");
    db.live = [row("u1", "Book dentist", { do_date: "2026-09-15" }), row("u2", "Research CalDAV", { state: "dropped" })];
    rerender({ dayKnown: true, settled: true });
    expect(result.current.rows.map((r) => r.outcome)).toEqual(["tomorrow", "dropped"]);
    tasks.reschedule.mockClear();
    tasks.setState.mockClear();
    db.live = [row("u1", "Book dentist"), row("u2", "Research CalDAV", { do_date: "2026-09-12" })];
    act(() => result.current.carry("u1", "keep"));
    expect(result.current.rows[0].outcome).toBe("kept");
    expect(tasks.reschedule).not.toHaveBeenCalled();
    expect(tasks.setState).not.toHaveBeenCalled();
  });
});
