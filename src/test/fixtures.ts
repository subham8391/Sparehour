// Shared fixtures for component tests: a task with every field, and a
// working day's capacity. Real values, never lorem.
import type { Capacity } from "@/core/capacity";
import { instant, localDate, localTime } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";

export const TODAY = localDate("2026-09-14");
export const NOW = instant("2026-09-14T09:30:00Z");

export function taskFixture(id: string, title: string, over: Partial<Task> = {}): Task {
  return {
    id: id as TaskId,
    spaceId: "s1" as SpaceId,
    projectId: null,
    headingId: null,
    title,
    notes: null,
    state: "active",
    priority: 0,
    doDate: TODAY,
    doTime: null,
    deadline: null,
    startDate: null,
    evening: false,
    estimateMin: 30,
    carryCount: 0,
    lastCarriedAt: null,
    lastTouchedAt: instant("2026-09-14T08:00:00Z"),
    missPolicy: "carry",
    recurrenceRule: null,
    recurrenceMode: null,
    recurrenceSeriesId: null,
    recurrencePausedUntil: null,
    sortKey: "a0",
    daySortKey: "a0",
    routineRunId: null,
    ...over,
  };
}

export const capacityFixture: Capacity = {
  day: TODAY,
  state: "comfortable",
  reason: null,
  workMin: 540,
  busyMin: 60,
  bufferMin: 80,
  committedMin: 45,
  unscheduledMin: 0,
  spareMin: 355,
  overMin: 0,
  eveningMin: 0,
  outsideHoursMin: 0,
  unansweredMin: 0,
  allDayNotes: [],
  windows: [{ start: 540, end: 1080 }],
  busy: [{ start: 600, end: 660 }],
  blocks: [{ start: 585, end: 630 }],
  free: [
    { start: 540, end: 585 },
    { start: 660, end: 1080 },
  ],
  projectedFinish: localTime("16:25"),
  overflowMin: 0,
};
