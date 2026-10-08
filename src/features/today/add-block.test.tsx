// @vitest-environment jsdom
// The palette's Add time block on today's day pane (DECISIONS.md "Palette Add tag and Add time block"): an untitled
// 30-minute block of your own in the next free gap from now, chosen as `B` chooses, selected, and its title opened
// for renaming once it is drawn. Only while the pane shows today.
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { requestAddBlock, resetAddBlock } from "@/features/blocking/add-block-request";
import type { PlacingApi, PlacingDay } from "@/features/blocking/use-placing";
import type { TimelineBlock } from "./hooks/use-today";
import { registerTimeline } from "./timeline-request";

vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("./calendar-state", async (original) => ({ ...(await original<typeof import("./calendar-state")>()), useCalendarState: () => ({ issue: null, writes: { on: false, off: null } }) }));

const { useAddBlock } = await import("./day-pane");

function day(over: Partial<PlacingDay> = {}): PlacingDay {
  return {
    day: localDate("2026-10-08"),
    zone: "UTC",
    blocks: [],
    // 10:00–10:20 is too short for 30 minutes; 11:00–12:00 fits.
    free: [
      { start: 600, end: 620 },
      { start: 660, end: 720 },
    ],
    dayStart: 540,
    dayEnd: 1020,
    nowMinute: 590,
    defaultEstimateMin: 30,
    findTask: () => undefined,
    onPlaced: vi.fn(),
    ...over,
  };
}

const placer = (over: Partial<PlacingApi> = {}) => ({ createAdHoc: vi.fn(async () => "b9"), selectedBlockId: null, ...over }) as unknown as PlacingApi;
const drawn: TimelineBlock = { id: "b9", taskId: null, title: "Block", start: 660, end: 690, locked: false };

afterEach(() => resetAddBlock());

describe("Add time block on today's day pane", () => {
  it("places 30 minutes in the next free gap that fits from now, shows the day, then opens the title to rename", async () => {
    const timeline = vi.fn();
    const stop = registerTimeline({ run: timeline, hasBlock: () => true });
    const d = day();
    const p = placer();
    const { rerender } = renderHook(({ dd, pp }) => useAddBlock(dd, pp, null), { initialProps: { dd: d, pp: p } });
    expect(requestAddBlock()).toBe(true);
    expect(d.onPlaced).toHaveBeenCalled();
    expect(p.createAdHoc).toHaveBeenCalledWith(660, 690);
    await Promise.resolve();
    // Written but not drawn yet: nothing to rename.
    rerender({ dd: d, pp: p });
    expect(timeline).not.toHaveBeenCalled();
    // Drawn and selected: its title opens.
    rerender({ dd: { ...d, blocks: [drawn] }, pp: placer({ selectedBlockId: "b9", createAdHoc: p.createAdHoc }) });
    expect(timeline).toHaveBeenCalledWith("rename-block");
    // Once.
    rerender({ dd: { ...d, blocks: [drawn] }, pp: placer({ selectedBlockId: "b9", createAdHoc: p.createAdHoc }) });
    expect(timeline).toHaveBeenCalledTimes(1);
    stop();
  });

  it("waits while the pane shows another day, and makes nothing while blocking is paused", () => {
    const p = placer();
    const { rerender } = renderHook(({ dd, off }) => useAddBlock(dd, p, off), { initialProps: { dd: day({ nowMinute: null }), off: null as string | null } });
    expect(requestAddBlock()).toBe(false);
    expect(p.createAdHoc).not.toHaveBeenCalled();
    // Back on today, paused: the waiting request is taken, and nothing is made.
    rerender({ dd: day(), off: "Blocking is paused." });
    expect(p.createAdHoc).not.toHaveBeenCalled();
  });

  it("taken as soon as the pane shows today when it was asked for elsewhere", () => {
    expect(requestAddBlock()).toBe(false);
    const p = placer();
    renderHook(() => useAddBlock(day(), p, null));
    expect(p.createAdHoc).toHaveBeenCalledWith(660, 690);
  });
});
