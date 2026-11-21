// A made-up day for the browser preview and the views' tests: Wednesday 18 November 2026, 13:20, nine to six. The
// tasks, the meetings and the blocks are invented; every figure, gap, lane and finish time is the shared capacity
// engine's own answer for them (nothing is typed in as a number), as today.tsx hands the real ones on.
import { capacityFor, type Capacity, type CapacityBlock, type CapacityEvent, type CapacityTask, type WorkWindow } from "@/core/capacity";
import { instant, localDate, localTime } from "@/core/time";
import type { Task } from "@/core/types";
import type { AddableTask } from "@/features/blocking/use-placing";
import type { TimelineBlock, TimelineMeeting } from "@/features/today/hooks/use-today";

export const TODAY = localDate("2026-11-18");
const ZONE = "UTC";
/** 13:20 */
export const NOW_MIN = 13 * 60 + 20;
const NOW = instant("2026-11-18T13:20:00Z");
const at = (hhmm: string) => instant(`2026-11-18T${hhmm}:00Z`);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** A task with only what Today reads. */
export const task = (id: string, title: string, over: Partial<Omit<Task, "projectId">> & { projectId?: string; ask?: boolean } = {}): Task =>
  ({ id, title, state: "active", projectId: null, doDate: TODAY, doTime: null, deadline: null, startDate: null, evening: false, estimateMin: null, carryCount: 0, daySortKey: null, ...over }) as unknown as Task;

const WORK_HOURS: WorkWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: localTime("09:00"), end: localTime("18:00") }));

const event = (id: string, from: string, to: string, over: Partial<CapacityEvent> = {}): CapacityEvent => ({ id, startAt: at(from), endAt: at(to), startDate: null, endDate: null, allDay: false, busy: true, status: "confirmed", selfResponse: "accepted", eventType: "default", isOurs: false, calendarRead: true, ...over });

export interface TodayFixture {
  capacity: Capacity;
  blocks: TimelineBlock[];
  meetings: TimelineMeeting[];
  carried: (Task & { ask?: boolean })[];
  tasks: Task[];
  evening: Task[];
  done: Task[];
  blocksByTask: Map<string, TimelineBlock[]>;
  projectNames: Map<string, string>;
  addable: AddableTask[];
}

/** `over`: more planned than the day holds. `empty`: nothing planned, nothing carried. `off`: a day without working hours. */
export function todayFixture({ state = "open", now = true }: { state?: "open" | "over" | "empty" | "off"; /** False for another day: no now, no elapsed part. */ now?: boolean } = {}): TodayFixture {
  const empty = state === "empty" || state === "off";
  const carried = empty ? [] : [task("c1", "Run 5k", { estimateMin: 30, carryCount: 4, doDate: TODAY.subtract({ days: 4 }), ask: true }), task("c2", "Take B12 Vit", { carryCount: 2, doDate: TODAY.subtract({ days: 2 }) })];
  const tasks = empty
    ? []
    : [
        task("t1", "Write the quarterly report for the board", { estimateMin: 90, projectId: "p1" }),
        task("t2", "Call the bank", { projectId: "p2" }),
        task("t3", "Review the budget", { estimateMin: state === "over" ? 300 : 45 }),
      ];
  const evening = empty ? [] : [task("e1", "Read two chapters", { estimateMin: 30, evening: true })];
  const done = empty ? [] : [task("d1", "Send the invoice", { estimateMin: 20, state: "done" })];
  const events = empty ? [] : [event("m1", "10:00", "11:00"), event("m2", "15:00", "15:30", { selfResponse: "needsAction" })];
  const meetings: TimelineMeeting[] = empty
    ? []
    : [
        { start: minutes("10:00"), end: minutes("11:00"), title: "Design review" },
        { start: minutes("15:00"), end: minutes("15:30"), title: "1:1 with Ana", unanswered: true },
      ];
  const block = (id: string, taskId: string | null, title: string, from: string, to: string, over: Partial<TimelineBlock> = {}): TimelineBlock => ({ id, taskId: taskId as TimelineBlock["taskId"], title, start: minutes(from), end: minutes(to), locked: false, source: "manual", done: false, pushState: null, sync: null, ...over });
  const blocks = empty ? [] : [block("b1", "t1", "Write the quarterly report for the board", "11:00", "12:30"), block("b2", null, "Lunch", "12:30", "13:00", { locked: true }), block("b3", "t2", "Call the bank", "16:00", "16:35", { sync: "will" })];
  const capacityBlocks: CapacityBlock[] = blocks.map((b) => ({ id: b.id, taskId: b.taskId, startAt: at(`${String(Math.floor(b.start / 60)).padStart(2, "0")}:${String(b.start % 60).padStart(2, "0")}`), endAt: at(`${String(Math.floor(b.end / 60)).padStart(2, "0")}:${String(b.end % 60).padStart(2, "0")}`) }));
  const load: CapacityTask[] = [...tasks, ...evening].map((t) => ({ id: t.id, state: t.state, doDate: t.doDate, estimateMin: t.estimateMin, evening: t.evening, daySortKey: t.daySortKey }));
  const capacity = capacityFor({
    day: state === "off" ? TODAY.add({ days: 3 }) : TODAY,
    settings: { timezone: ZONE, bufferPct: 15, defaultEstimateMin: 35 },
    workHours: WORK_HOURS,
    events,
    blocks: capacityBlocks,
    tasks: load,
    now: now && state !== "off" ? NOW : undefined,
  });
  const blocksByTask = new Map<string, TimelineBlock[]>();
  for (const b of blocks) if (b.taskId) blocksByTask.set(b.taskId, [...(blocksByTask.get(b.taskId) ?? []), b]);
  return {
    capacity,
    blocks,
    meetings,
    carried,
    tasks,
    evening,
    done,
    blocksByTask,
    projectNames: new Map([
      ["p1", "Acme"],
      ["p2", "Home"],
    ]),
    addable: [
      { id: "t3", title: "Review the budget", minutes: 45, blocked: false },
      { id: "t1", title: "Write the quarterly report for the board", minutes: 90, blocked: true },
    ],
  };
}
