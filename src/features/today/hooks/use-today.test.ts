import { describe, expect, it, vi } from "vitest";

// The hook's queries are not under test here, only the pure steps it composes.
vi.mock("@/data/powersync", () => ({ useQuery: vi.fn(), useLocalDatabase: vi.fn() }));

import { capacityFor, type CapacityBlock } from "@/core/capacity";
import { instant, localDate, localTime } from "@/core/time";
import type { TaskId } from "@/core/types";
import type { TimeBlockRow } from "@/data/schema.client";
import { capacityBlocks, timelineBlocks, type BlockTask } from "./use-today";

const DAY = localDate("2026-09-14");
const NOW = instant("2026-09-14T11:00:00Z");

const row = (id: string, taskId: string | null, start: string, end: string, title: string | null = null): TimeBlockRow =>
  ({ id, task_id: taskId, title, start_at: `2026-09-14T${start}:00Z`, end_at: `2026-09-14T${end}:00Z`, locked: 0, source: "manual" }) as unknown as TimeBlockRow;
const block = (id: string, taskId: string | null, start: string, end: string): CapacityBlock => ({
  id,
  taskId: taskId as TaskId | null,
  startAt: instant(`2026-09-14T${start}:00Z`),
  endAt: instant(`2026-09-14T${end}:00Z`),
});

const tasks = new Map<string, BlockTask>([
  ["open", { title: "Draft the proposal", state: "active" }],
  ["done", { title: "Reply to Priya", state: "done" }],
  ["parked", { title: "Reorganise the drive", state: "someday" }],
  ["dropped", { title: "Old idea", state: "dropped" }],
]);

describe("timelineBlocks", () => {
  it("marks a block done when its task is done or no longer open, never one without a task", () => {
    const drawn = timelineBlocks(
      [row("b1", "open", "09:00", "10:00"), row("b2", "done", "13:00", "14:00"), row("b3", "parked", "14:00", "15:00"), row("b4", "dropped", "15:00", "15:30"), row("b5", null, "16:00", "17:00", "Deep work"), row("b6", "unknown", "17:00", "17:30")],
      tasks,
      "UTC",
      DAY,
    );
    expect(drawn.map((b) => [b.id, b.title, b.done])).toEqual([
      ["b1", "Draft the proposal", false],
      ["b2", "Reply to Priya", true],
      ["b3", "Reorganise the drive", true],
      ["b4", "Old idea", true],
      ["b5", "Deep work", false],
      // A task the device does not have (yet) is not assumed finished.
      ["b6", "Block", false],
    ]);
  });
});

describe("capacityBlocks", () => {
  it("lets go of the part of a finished task's block that has not started, and keeps the part already spent", () => {
    const out = capacityBlocks(
      [block("future", "done", "14:00", "15:00"), block("spanning", "done", "10:30", "11:30"), block("spent", "done", "09:00", "10:00"), block("open", "open", "14:00", "15:00"), block("adhoc", null, "16:00", "17:00")],
      tasks,
      NOW,
    );
    expect(out.map((b) => [b.id, b.startAt.toString(), b.endAt.toString()])).toEqual([
      ["spanning", "2026-09-14T10:30:00Z", "2026-09-14T11:00:00Z"],
      ["spent", "2026-09-14T09:00:00Z", "2026-09-14T10:00:00Z"],
      ["open", "2026-09-14T14:00:00Z", "2026-09-14T15:00:00Z"],
      ["adhoc", "2026-09-14T16:00:00Z", "2026-09-14T17:00:00Z"],
    ]);
  });

  it("so completing a blocked task gives its hour back to the hero", () => {
    const input = (blocks: CapacityBlock[]) =>
      capacityFor({
        day: DAY,
        settings: { timezone: "UTC", bufferPct: 0, defaultEstimateMin: 30 },
        workHours: [{ weekday: 1, start: localTime("09:00"), end: localTime("18:00") }],
        events: [],
        blocks,
        tasks: [],
        now: NOW,
      });
    const blocks = [block("b", "t", "14:00", "15:00")];
    const before = input(capacityBlocks(blocks, new Map([["t", { title: "Write", state: "active" }]]), NOW));
    const after = input(capacityBlocks(blocks, new Map([["t", { title: "Write", state: "done" }]]), NOW));
    expect(before.committedMin).toBe(60);
    expect(after.committedMin).toBe(0);
    expect(after.spareMin - before.spareMin).toBe(60);
  });
});
