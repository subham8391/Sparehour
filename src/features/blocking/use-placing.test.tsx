// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { Task, TaskId } from "@/core/types";
import type { TimelineBlock } from "@/features/today/hooks/use-today";
import { BlockingProvider, useBlocking } from "./blocking-provider";
import { nextBlockLength, usePlacing, type PlacingDay } from "./use-placing";

const repo = { create: vi.fn(async () => "new"), move: vi.fn(), duplicate: vi.fn(async () => "copy"), remove: vi.fn(), setLocked: vi.fn(), rename: vi.fn() };
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [{ id: "u1", personal_space_id: "s1" }] }) }));
vi.mock("./use-block-repo", () => ({ useBlockRepo: () => repo }));

const task = (id: string, estimateMin: number | null): Task => ({ id: id as TaskId, title: `Task ${id}`, estimateMin }) as unknown as Task;
const tasks = [task("t1", 180), task("t2", 30)];
const block = (id: string, taskId: string | null, start: number, end: number, locked = false): TimelineBlock => ({ id, taskId: taskId as TaskId | null, title: "x", start, end, locked });

function setup(over: Partial<PlacingDay> = {}) {
  const day: PlacingDay = {
    day: localDate("2026-10-07"),
    zone: "UTC",
    blocks: [],
    free: [{ start: 540, end: 1020 }],
    dayStart: 540,
    dayEnd: 1020,
    nowMinute: 600,
    defaultEstimateMin: 30,
    findTask: (id) => tasks.find((t) => t.id === id),
    ...over,
  };
  const wrapper = ({ children }: { children: ReactNode }) => <BlockingProvider>{children}</BlockingProvider>;
  return renderHook(() => ({ placer: usePlacing(day), blocking: useBlocking() }), { wrapper });
}

beforeEach(() => {
  for (const f of Object.values(repo)) f.mockClear();
});

describe("nextBlockLength", () => {
  it("is what the task's blocks leave of its estimate, or the whole estimate once it is covered", () => {
    expect(nextBlockLength({ estimateMin: 180 }, [], 30)).toBe(180);
    expect(nextBlockLength({ estimateMin: 180 }, [{ start: 540, end: 630 }], 30)).toBe(90);
    expect(nextBlockLength({ estimateMin: 180 }, [{ start: 540, end: 720 }], 30)).toBe(180);
    expect(nextBlockLength({ estimateMin: null }, [], 30)).toBe(30);
  });
});

describe("usePlacing", () => {
  it("B places a task in the next free gap from now, on the day's own date, and selects the block", async () => {
    const { result } = setup();
    expect(result.current.blocking.available).toBe(true);
    await act(async () => result.current.blocking.blockTask("t2"));
    expect(repo.create).toHaveBeenCalledWith({ spaceId: "s1", userId: "u1", taskId: "t2", title: "Task t2", startAt: "2026-10-07T10:00:00Z", endAt: "2026-10-07T10:30:00Z" });
    expect(result.current.placer.selectedBlockId).toBe("new");
  });

  it("a task with a block takes a second one for what is left; one whose blocks cover it just has its first selected", async () => {
    const { result } = setup({ blocks: [block("b1", "t1", 540, 630)] });
    await act(async () => result.current.blocking.blockTask("t1"));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ taskId: "t1", startAt: "2026-10-07T10:00:00Z", endAt: "2026-10-07T11:30:00Z" }));
    const covered = setup({ blocks: [block("b2", "t2", 540, 570)] });
    repo.create.mockClear();
    await act(async () => covered.result.current.blocking.blockTask("t2"));
    expect(repo.create).not.toHaveBeenCalled();
    expect(covered.result.current.placer.selectedBlockId).toBe("b2");
  });

  it("moves keep the length, resizes set both edges, and a locked block stays put", () => {
    const { result } = setup({ blocks: [block("b1", null, 600, 645), block("b2", null, 700, 760, true)] });
    act(() => result.current.placer.moveBlock("b1", 812));
    expect(repo.move).toHaveBeenCalledWith("b1", "2026-10-07T13:30:00Z", "2026-10-07T14:15:00Z");
    act(() => result.current.placer.resizeBlock("b1", 590, 660));
    expect(repo.move).toHaveBeenLastCalledWith("b1", "2026-10-07T09:50:00Z", "2026-10-07T11:00:00Z");
    repo.move.mockClear();
    act(() => result.current.placer.moveBlock("b2", 900));
    act(() => result.current.placer.resizeBlock("b2", 700, 800));
    expect(repo.move).not.toHaveBeenCalled();
  });

  it("copies a block at a new time and selects the copy; draws blocks of your own with no task", async () => {
    const { result } = setup({ blocks: [block("b1", "t1", 600, 645)] });
    await act(async () => result.current.placer.duplicateBlock("b1", 900));
    expect(repo.duplicate).toHaveBeenCalledWith("b1", "2026-10-07T15:00:00Z", "2026-10-07T15:45:00Z");
    expect(result.current.placer.selectedBlockId).toBe("copy");
    await act(async () => void (await result.current.placer.createAdHoc(720, 780)));
    expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: null, title: null, startAt: "2026-10-07T12:00:00Z", endAt: "2026-10-07T13:00:00Z" }));
  });

  it("tap-to-schedule: the next tap places the waiting task; Escape lets go", async () => {
    const { result } = setup();
    act(() => result.current.placer.setPlacing("t2"));
    expect(result.current.placer.placingTask?.id).toBe("t2");
    await act(async () => result.current.placer.tapSlot(843));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ taskId: "t2", startAt: "2026-10-07T14:05:00Z" }));
    expect(result.current.placer.placingTask).toBeUndefined();
    act(() => result.current.placer.setPlacing("t2"));
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.placer.placingTask).toBeUndefined();
  });
});
