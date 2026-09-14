// The canonical day every doc and mockup uses: Tue 15 Sept 2026, Europe/London,
// 9h workday, 2h of meetings, 1h 20m buffer, 2h 20m planned → 3h 20m spare.
import { instant, localDate, localTime } from "../../time";
import type { TaskId } from "../../types";
import type { CapacityBlock, CapacityEvent, CapacityInput, CapacityTask, WorkWindow } from "../index";

export const ZONE = "Europe/London";
export const DAY = localDate("2026-09-15");
const at = (hhmm: string) => instant(`2026-09-15T${hhmm}:00+01:00`);

export const WORK_HOURS: WorkWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start: localTime("09:00"),
  end: localTime("18:00"),
}));

export const event = (id: string, start: string, end: string, extra: Partial<CapacityEvent> = {}): CapacityEvent => ({
  id,
  startAt: at(start),
  endAt: at(end),
  startDate: null,
  endDate: null,
  allDay: false,
  busy: true,
  status: "confirmed",
  selfResponse: "accepted",
  eventType: "default",
  isOurs: false,
  calendarRead: true,
  ...extra,
});

export const block = (id: string, taskId: string | null, start: string, end: string): CapacityBlock => ({
  id,
  taskId: taskId as TaskId | null,
  startAt: at(start),
  endAt: at(end),
});

export const task = (id: string, estimateMin: number | null, extra: Partial<CapacityTask> = {}): CapacityTask => ({
  id: id as TaskId,
  state: "active",
  doDate: DAY,
  estimateMin,
  evening: false,
  daySortKey: null,
  ...extra,
});

export const SETTINGS = { timezone: ZONE, bufferPct: 15, defaultEstimateMin: 30 };

export const REFERENCE_DAY: CapacityInput = {
  day: DAY,
  settings: SETTINGS,
  workHours: WORK_HOURS,
  events: [
    event("standup", "09:15", "09:30"),
    event("design-review", "11:30", "12:15"),
    event("dana-1on1", "14:00", "14:30"),
    event("acme-sync", "15:00", "15:30"),
  ],
  blocks: [
    block("b-proposal", "proposal", "09:45", "11:15"),
    block("b-prep", "prep", "13:30", "13:50"),
    block("b-pr", "pr", "16:00", "16:25"),
  ],
  tasks: [
    task("proposal", 90),
    task("prep", 20),
    task("pr", 25),
    task("bill", 5),
    task("call-mum", 20, { evening: true }),
    task("read", null, { evening: true }),
  ],
  now: at("09:41"),
};
