// The morning plan's arithmetic and words (SCREENS.md §14): the three
// candidate groups, the readout that updates on every tick, and the coach's
// "easiest move" when the day is over. Pure.
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, compareDates, timeFromMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";

export const PLAN_STEPS = ["frame", "pick", "block"] as const;
export type PlanStep = (typeof PLAN_STEPS)[number];

export interface Candidates {
  /** Open, planned before today, not routine. */
  carried: Task[];
  /** Deadline within the next 7 days, or starting today; not already on today. */
  dueThisWeek: Task[];
  /** Inbox and undated active tasks, oldest first; not already on today. */
  fromProjects: Task[];
}

const isOpen = (t: Task) => t.state === "inbox" || t.state === "active";

/**
 * Splits the open tasks into the three picker groups. A task appears in one
 * group only, in the order the picker shows them. Tasks already planned for
 * today are excluded from the later groups (they are already picked).
 */
export function candidates(tasks: readonly Task[], today: LocalDate): Candidates {
  const weekEnd = today.add({ days: 7 });
  const carried: Task[] = [];
  const dueThisWeek: Task[] = [];
  const fromProjects: Task[] = [];
  for (const t of tasks) {
    if (!isOpen(t) || t.routineRunId) continue;
    if (t.doDate && compareDates(t.doDate, today) < 0) {
      carried.push(t);
      continue;
    }
    if (t.doDate && t.doDate.equals(today)) continue;
    if ((t.deadline && compareDates(t.deadline, weekEnd) <= 0) || (t.startDate && t.startDate.equals(today))) {
      dueThisWeek.push(t);
      continue;
    }
    if (!t.doDate) fromProjects.push(t);
  }
  carried.sort((a, b) => b.carryCount - a.carryCount || a.title.localeCompare(b.title));
  dueThisWeek.sort((a, b) => (a.deadline && b.deadline ? compareDates(a.deadline, b.deadline) : a.deadline ? -1 : b.deadline ? 1 : 0) || a.title.localeCompare(b.title));
  fromProjects.sort((a, b) => a.lastTouchedAt.epochMilliseconds - b.lastTouchedAt.epochMilliseconds || a.title.localeCompare(b.title));
  return { carried, dueThisWeek, fromProjects };
}

export interface Readout {
  fitsMin: number;
  pickedMin: number;
  count: number;
  overMin: number;
  /** "40m over · 5h 40m fits today · 6h 20m picked · 7 tasks" */
  line: string;
  /** The coach's sentence when over; null when the day fits. */
  coach: string | null;
}

const estimateOf = (t: Task, defaultEstimateMin: number) => t.estimateMin ?? defaultEstimateMin;

/** What the picked (non-evening) tasks add up to against what fits today. */
export function readout(picked: readonly Task[], fitsMin: number, defaultEstimateMin: number): Readout {
  const daytime = picked.filter((t) => !t.evening);
  const pickedMin = daytime.reduce((s, t) => s + estimateOf(t, defaultEstimateMin), 0);
  const overMin = Math.max(0, pickedMin - fitsMin);
  const head = overMin > 0 ? `${formatMinutes(overMin)} over` : `${formatMinutes(fitsMin - pickedMin)} to spare`;
  const line = `${head} · ${formatMinutes(fitsMin)} fits today · ${formatMinutes(pickedMin)} picked · ${daytime.length} ${daytime.length === 1 ? "task" : "tasks"}`;
  const coach = overMin > 0 ? `${formatMinutes(overMin)} more than fits. Move something to tomorrow, or keep it and let the day breathe less.` : null;
  return { fitsMin, pickedMin, count: daytime.length, overMin, line, coach };
}

export interface EasiestMove {
  task: Task;
  /** "No deadline, and tomorrow has 1h 05m spare. Moving it leaves 10 minutes over — close enough to keep." */
  reason: string;
  leavesOverMin: number;
}

/**
 * The largest picked task with no deadline that fits into tomorrow's spare
 * time, with the reason spelled out; null when nothing qualifies.
 */
export function easiestMove(picked: readonly Task[], overMin: number, tomorrowSpareMin: number | null, defaultEstimateMin: number): EasiestMove | null {
  if (overMin <= 0 || tomorrowSpareMin === null) return null;
  const movable = picked
    .filter((t) => !t.deadline && !t.evening && estimateOf(t, defaultEstimateMin) <= tomorrowSpareMin)
    .sort((a, b) => estimateOf(b, defaultEstimateMin) - estimateOf(a, defaultEstimateMin));
  const task = movable[0];
  if (!task) return null;
  const leavesOverMin = Math.max(0, overMin - estimateOf(task, defaultEstimateMin));
  const tail = leavesOverMin === 0 ? "Moving it makes the day fit." : leavesOverMin <= 15 ? `Moving it leaves ${formatMinutes(leavesOverMin)} over — close enough to keep.` : `Moving it leaves ${formatMinutes(leavesOverMin)} over.`;
  return { task, reason: `No deadline, and tomorrow has ${formatMinutes(tomorrowSpareMin)} spare. ${tail}`, leavesOverMin };
}

/**
 * The frame step's one line of prose, in place of stat tiles (brief P5):
 * "Working 09:00 to 18:00 with 2 meetings (1h) and 4h 30m planned. 1 task
 * carried over." The spare figure itself lives in the hero above it.
 */
export function frameLine(c: Pick<Capacity, "state" | "windows" | "busy" | "busyMin" | "committedMin" | "unscheduledMin"> | null, carried: number): string {
  const tail = carried === 0 ? "Nothing carried over." : `${carried} ${carried === 1 ? "task" : "tasks"} carried over.`;
  if (!c || c.state === "no_work_day") return `No working hours today. ${tail}`;
  const hours = `${formatTime(timeFromMinutes(c.windows[0].start))} to ${formatTime(timeFromMinutes(c.windows[c.windows.length - 1].end))}`;
  const meetings = c.busy.length === 0 ? "no meetings" : `${c.busy.length} ${c.busy.length === 1 ? "meeting" : "meetings"} (${formatMinutes(c.busyMin)})`;
  const planned = c.committedMin + c.unscheduledMin;
  const plan = planned === 0 ? "nothing planned yet" : `${formatMinutes(planned)} planned`;
  return `Working ${hours} with ${meetings} and ${plan}. ${tail}`;
}

/** "Planned at 8:42" for the Today header. */
export function plannedLabel(time: string): string {
  return `Planned at ${time}`;
}

export interface PullIn {
  task: Task;
  source: "deadline" | "starts today" | "inbox" | "someday";
}

/**
 * The returning-user empty day (ONBOARDING.md §4): at most three things to
 * pull in, deterministic — deadlines in the next 3 days with no day, tasks
 * starting today, then the oldest inbox tasks. Someday only when the rest
 * yield nothing, and labelled.
 */
export function pullInSuggestions(tasks: readonly Task[], today: LocalDate, limit = 3): PullIn[] {
  const soon = today.add({ days: 3 });
  const out: PullIn[] = [];
  const seen = new Set<string>();
  const take = (list: Task[], source: PullIn["source"]) => {
    for (const t of list) {
      if (out.length >= limit) return;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ task: t, source });
    }
  };
  const open = tasks.filter((t) => isOpen(t) && !t.routineRunId && !(t.doDate && t.doDate.equals(today)));
  take(
    open.filter((t) => !t.doDate && t.deadline && compareDates(t.deadline, soon) <= 0).sort((a, b) => compareDates(a.deadline as LocalDate, b.deadline as LocalDate)),
    "deadline",
  );
  take(
    open.filter((t) => t.startDate && t.startDate.equals(today)),
    "starts today",
  );
  take(
    open.filter((t) => t.state === "inbox").sort((a, b) => a.lastTouchedAt.epochMilliseconds - b.lastTouchedAt.epochMilliseconds),
    "inbox",
  );
  if (out.length === 0) {
    take(
      tasks.filter((t) => t.state === "someday").sort((a, b) => a.lastTouchedAt.epochMilliseconds - b.lastTouchedAt.epochMilliseconds),
      "someday",
    );
  }
  return out;
}
