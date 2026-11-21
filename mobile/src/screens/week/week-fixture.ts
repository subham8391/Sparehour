// A made-up week for the browser preview and the view's tests: Sat 21 November 2026 is today. The tasks are invented;
// every bar and readout is the shared capacity engine's own answer for them (nothing is typed in as a figure), and
// the days, the later groups and the sheet's cells are built by the web's own code, as week.tsx builds the real ones.
import { capacityFor, type Capacity, type CapacityTask, type WorkWindow } from "@/core/capacity";
import { instant, localDate, localTime, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { capacityRange, laterReadout, nextSevenDays, nothingAhead, rangeTitle, weekDays, type ColumnDay, type StripDay } from "@/features/upcoming/agenda";
import { laterGroups, type LaterGroup } from "@/features/upcoming/later";
import { weekTotalLine, weekWindow, type DayReadout, type WeekMode } from "@/features/upcoming/week";

export const TODAY = localDate("2026-11-21");
const ZONE = "UTC";
const day = (ahead: number) => TODAY.add({ days: ahead });

/** A task with only what the Week screen reads. */
export const task = (id: string, title: string, over: Partial<Omit<Task, "projectId">> & { projectId?: string } = {}): Task =>
  ({ id, title, state: "active", projectId: null, doDate: null, doTime: null, deadline: null, startDate: null, evening: false, estimateMin: null, carryCount: 0, daySortKey: null, ...over }) as unknown as Task;

const WORK_HOURS: WorkWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: localTime("09:00"), end: localTime("18:00") }));

export interface WeekFixture {
  title: string;
  totalLine: string | null;
  days: ColumnDay[];
  later: LaterGroup[];
  laterReadouts: Map<string, DayReadout>;
  unplanned: Task[];
  nextDays: StripDay[];
  projectNames: Map<string, string>;
  noneAhead: boolean;
}

export function weekFixture({ mode = "rolling", offset = 0, empty = false }: { mode?: WeekMode; offset?: number; empty?: boolean } = {}): WeekFixture {
  const planned = empty
    ? []
    : [
        task("t1", "Water the plants", { doDate: day(0), estimateMin: 15 }),
        task("m1", "Write the quarterly report for the board", { doDate: day(2), estimateMin: 240, projectId: "p1", deadline: day(4) }),
        task("m2", "Call the bank", { doDate: day(2), projectId: "p2", tags: ["calls"] }),
        task("m3", "Review the budget", { doDate: day(2), estimateMin: 240 }),
        task("m4", "Read two chapters", { doDate: day(2), estimateMin: 30, evening: true }),
        task("w1", "Renew the passport", { doDate: day(4), estimateMin: 45 }),
        task("past", "Send the invoice", { doDate: day(-3), estimateMin: 20, carryCount: 3 }),
      ];
  const laterTasks = empty ? [] : [task("l1", "Plan the offsite", { doDate: day(9), estimateMin: 90, projectId: "p1" }), task("l2", "Book the dentist", { doDate: day(24), estimateMin: 10 })];
  const starting = empty ? [] : [task("s1", "Start the tax return", { startDate: day(4), estimateMin: 120 })];
  const due = empty ? [] : [task("d1", "Submit the expenses", { deadline: day(2), estimateMin: 20 }), task("d2", "Renew the domain", { deadline: day(9) })];
  const unplanned = empty ? [] : [task("u1", "Research CalDAV", { estimateMin: 60, projectId: "p1" }), task("u2", "Birthday gift for Ana", { estimateMin: 20 })];

  const windowDays = weekWindow(TODAY, mode, 0, offset);
  const first = windowDays[0];
  const last = windowDays[windowDays.length - 1];
  const range = capacityRange(first, last, TODAY);
  const load: CapacityTask[] = [...planned, ...laterTasks].map((t) => ({ id: t.id, state: t.state, doDate: t.doDate, estimateMin: t.estimateMin, evening: t.evening, daySortKey: t.daySortKey }));
  const capacity = new Map<string, Capacity>();
  for (let d: LocalDate = range.from; d.toString() <= range.to.toString(); d = d.add({ days: 1 })) {
    capacity.set(d.toString(), capacityFor({ day: d, settings: { timezone: ZONE, bufferPct: 15, defaultEstimateMin: 35 }, workHours: WORK_HOURS, events: [], blocks: [], tasks: load, now: d.equals(TODAY) ? instant("2026-11-21T10:00:00Z") : undefined }));
  }
  const days = weekDays(windowDays, TODAY, planned, starting, due, capacity);
  const later = laterGroups(laterTasks, starting, TODAY, last, due);
  const laterReadouts = new Map<string, DayReadout>();
  for (const g of later)
    for (const d of g.days) {
      const readout = laterReadout(capacity, d.day, TODAY);
      if (readout) laterReadouts.set(d.day.toString(), readout);
    }
  return {
    title: rangeTitle(first, last, TODAY),
    totalLine: weekTotalLine(days.filter((d) => !d.past).map((d) => d.readout), offset === 0),
    days,
    later,
    laterReadouts,
    unplanned,
    nextDays: nextSevenDays(TODAY, capacity),
    projectNames: new Map([["p1", "Acme"], ["p2", "Home"]]),
    noneAhead: offset === 0 && later.length === 0 && nothingAhead(days),
  };
}
