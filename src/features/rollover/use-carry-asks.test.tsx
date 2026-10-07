// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { taskFixture } from "@/test/fixtures";
import { useCarryAsks, useRecordAsks } from "./use-carry-asks";

// One task was asked this morning; another a while ago.
const rows = [
  { id: "x", carry_asked_at: "2026-10-06 07:00:00+00" },
  { id: "old", carry_asked_at: "2026-10-05T09:00:00Z" },
];
const useQuery = vi.fn((sql: string, params: unknown[]) => ({ data: sql.includes("where 0") ? [] : rows, isLoading: false, params }));
vi.mock("@/data/powersync", () => ({ useQuery: (sql: string, params: unknown[]) => useQuery(sql, params) }));

const TODAY = localDate("2026-10-06");
const NOW = instant("2026-10-06T09:00:00Z");
const carried = ["a", "b", "c"].map((id) => taskFixture(id, id, { carryCount: 3, doDate: localDate("2026-10-05") }));

describe("useCarryAsks", () => {
  it("counts today's asks across all tasks (one already used), and reads the window from the day before", () => {
    const { result } = renderHook(() => useCarryAsks(carried, { carryAskAfter: 3, today: TODAY, zone: "UTC", now: NOW }));
    expect([...result.current.asks]).toEqual(["a"]);
    expect(result.current.fresh).toEqual(["a"]);
    expect(useQuery).toHaveBeenLastCalledWith(expect.stringContaining("carry_asked_at"), ["2026-10-05"]);
  });

  it("counts a task whose own row says it was asked today, before the asked query catches up", () => {
    useQuery.mockImplementationOnce(() => ({ data: [], isLoading: false, params: [] }));
    const four = ["a", "b", "c", "d"].map((id) => taskFixture(id, id, { carryCount: 3, doDate: localDate("2026-10-05") }));
    // a and b were just recorded: their rows carry the stamp, the asked query is still the old (empty) one.
    const stamped = four.map((t, i) => (i < 2 ? { ...t, carryAskedAt: instant("2026-10-06T08:59:00Z") } : t));
    const { result } = renderHook(() => useCarryAsks(stamped, { carryAskAfter: 3, today: TODAY, zone: "UTC", now: NOW }));
    expect([...result.current.asks]).toEqual(["a", "b"]);
    expect(result.current.fresh).toEqual([]);
  });

  it("reads nothing while no task is at the threshold or the setting is not here", () => {
    useQuery.mockClear();
    const { result } = renderHook(() => useCarryAsks(carried, { carryAskAfter: null, today: TODAY, zone: "UTC", now: NOW }));
    expect(result.current.asks.size).toBe(0);
    expect(useQuery).toHaveBeenLastCalledWith(expect.stringContaining("where 0"), []);
  });
});

describe("useRecordAsks", () => {
  it("records new asks once they are on screen, and only once", () => {
    const markAsked = vi.fn(async () => {});
    const { rerender } = renderHook(({ visible, fresh }: { visible: boolean; fresh: string[] }) => useRecordAsks(fresh, markAsked, visible), { initialProps: { visible: false, fresh: ["a", "b"] } });
    expect(markAsked).not.toHaveBeenCalled();
    rerender({ visible: true, fresh: ["a", "b"] });
    expect(markAsked).toHaveBeenCalledWith(["a", "b"], expect.any(String));
    rerender({ visible: true, fresh: ["a", "b"] });
    rerender({ visible: true, fresh: ["b"] });
    expect(markAsked).toHaveBeenCalledTimes(1);
  });
});
