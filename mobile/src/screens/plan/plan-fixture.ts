// A made-up morning for the browser preview and the views' tests: Wednesday 18 November 2026, 13:20, nine to six
// (today/today-fixture.ts gives the day). The tasks are invented; what fits, the readout, the easiest move and the
// plan Plan my day proposes are the shared rules' own answers for them (nothing is typed in as a number), as
// plan.tsx hands the real ones on.
import type { PlanInput } from "@/core/planning";
import { instant, localTime } from "@/core/time";
import type { Task } from "@/core/types";
import type { Settings } from "@/data/mappers";
import { planInputFrom } from "@/features/planning/plan-input";
import { fitsToday, type Candidates } from "@/features/rituals/morning-plan";
import { ribbonShape, type RibbonShape } from "../today/ribbon-shape";
import { NOW_MIN, TODAY, task as dayTask, todayFixture, type TodayFixture } from "../today/today-fixture";

const NOW = instant("2026-11-18T13:20:00Z");
/** The account's settings, as far as the plan reads them. */
export const SETTINGS = { timezone: "UTC", dayRolloverHour: 4, bufferPct: 15, defaultEstimateMin: 35, maxBlockMin: 90, minBlockMin: 25, eveningStartsAt: localTime("18:00"), eveningEndsAt: localTime("22:00") } as Settings;

/** A task with what the picker and the scheduler read. */
const task = (id: string, title: string, over: Partial<Omit<Task, "projectId">> & { projectId?: string } = {}): Task =>
  ({ ...dayTask(id, title, { doDate: null, ...over }), priority: 0, sortKey: id, lastTouchedAt: instant("2026-11-10T09:00:00Z"), routineRunId: null, ...over }) as unknown as Task;

export interface PlanFixture {
  day: TodayFixture;
  ribbon: RibbonShape | null;
  groups: Candidates;
  /** The tasks on today: what the fixture day holds, plus `picked` from the groups. */
  onToday: Task[];
  fitsMin: number;
  tomorrowSpareMin: number;
  asks: Set<string>;
  /** The scheduler's input for the day, for Plan my day's preview. */
  planInput: PlanInput | null;
}

/** `over`: more picked than fits, so the coach names an easiest move. `off`: a day without working hours. */
export function planFixture({ state = "open" }: { state?: "open" | "over" | "off" } = {}): PlanFixture {
  const day = todayFixture({ state });
  const groups: Candidates = {
    carried: [task("c1", "Run 5k", { estimateMin: 30, carryCount: 4, doDate: TODAY.subtract({ days: 4 }) }), task("c2", "Take B12 Vit", { carryCount: 2, doDate: TODAY.subtract({ days: 2 }) })],
    dueThisWeek: [task("w1", "File the tax return", { estimateMin: 60, deadline: TODAY.add({ days: 2 }), doDate: TODAY.add({ days: 1 }) }), task("w2", "Renew the passport", { state: "inbox", deadline: TODAY.subtract({ days: 1 }) })],
    fromProjects: ["Sort the photo library", "Book the dentist", "Fix the bike light", "Write to Sam", "Plan the trip", "Clear the garage", "Back up the laptop", "Call the plumber"].map((title, i) => task(`p${i + 1}`, title, { state: i % 2 ? "inbox" : "active", estimateMin: i === 0 ? 120 : null })),
  };
  const onToday = [...day.tasks, ...day.evening];
  const picked = new Set(onToday.filter((t) => !t.evening).map((t) => t.id));
  const planInput = planInputFrom({ today: TODAY, settings: SETTINGS, capacity: day.capacity, carried: [], todayTasks: day.tasks.map((t) => task(t.id, t.title, { ...t, projectId: t.projectId ?? undefined })), eveningTasks: [], blocks: day.blocks }, { now: NOW });
  return {
    day,
    ribbon: ribbonShape(day.capacity, NOW_MIN),
    groups,
    onToday,
    fitsMin: fitsToday(day.capacity, day.blocks, picked, NOW_MIN),
    tomorrowSpareMin: 6 * 60,
    asks: new Set(["c1"]),
    planInput,
  };
}
