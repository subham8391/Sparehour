// The planner as Claude sees it (DECISIONS.md, amendment 2026-10-23): what Today, the Inbox, Upcoming and search
// show, and the writes a person makes from them — each read the way the app reads it (the same mappers,
// carried-over rule and capacity engine) and each write built as the app would build it (quick-add's
// parser and filing, the draft's row, a repeat's completion, a move "just this once") and sent through
// apply_mutations as the person. Plan my day is the app's own scheduler (core/planning) over the same day, shown
// first and written only when asked (DECISIONS.md, amendment 2026-11-14). Anything that cannot be done is a Refusal
// with a reason the tools pass on.
import { capacityFor, type Capacity } from "@/core/capacity";
import { plan, type PlanBlock, type PlanInput, type Proposal } from "@/core/planning";
import { planCompletion, toExceptions } from "@/core/recurrence/completion";
import { exceptionId } from "@/core/recurrence/exception-id";
import { currentOccurrence } from "@/core/recurrence/series";
import { ruleWords } from "@/core/recurrence/words";
import { carriedOver } from "@/core/rollover/carried";
import { Temporal, compareDates, formatMinutes, localDate, type LocalDate, type LocalTime } from "@/core/time";
import type { MissPolicy, RecurrenceMode, Task } from "@/core/types";
import { normaliseTimestamp, toCapacityTask, toTask } from "@/data/mappers";
import type { TaskRow } from "@/data/schema.client";
import { canApprovePlan } from "@/features/planning/entitlement";
import { aheadDays, aheadThrough, isoAt, planTask } from "@/features/planning/plan-input";
import { minuteOnDay } from "@/features/today/day-minute";
import type { WireOp } from "@/server/sync/upload";
import { Account } from "./account";
import { Blocks } from "./blocks";
import { PlannerCore, Refusal, byCodeUnit, dayWords, estimateMinutes, exceptionRow, fold, quoted, str, type Changed, type Ctx, type Meeting, type TaskView } from "./core";
import { Drafts, type Added } from "./drafts";
import { Places } from "./places";
import { Repeats } from "./repeats";
import type { Row, TaskState } from "./store";

export { Refusal, dayWords, estimateMinutes, lastKey, type Changed, type Meeting, type TaskView } from "./core";
export type { Added } from "./drafts";

export interface TodayView {
  today: LocalDate;
  now: LocalTime;
  zone: string;
  capacity: Capacity | null;
  tasks: TaskView[];
  evening: TaskView[];
  carried: TaskView[];
  meetings: Meeting[];
  blocks: Meeting[];
}

/** Plan my day for the rest of today, as the app's preview would show it. */
export interface DayPlanView {
  today: LocalDate;
  now: LocalTime;
  zone: string;
  proposal: Proposal;
  /** How many open tasks the plan looked at. */
  considered: number;
  /** Set once the plan has been written: how many blocks went on the timeline and how many earlier plan blocks they replaced. */
  applied?: { placed: number; replaced: number };
}

export interface UpcomingDay {
  day: LocalDate;
  capacity: Capacity | null;
  tasks: TaskView[];
}

export interface UpcomingView {
  today: LocalDate;
  days: UpcomingDay[];
  unplanned: TaskView[];
}

export interface TaskDetail extends TaskView {
  checklist: { title: string; done: boolean }[];
}

/** What a search may be narrowed to; nothing set is a plain search. */
export interface SearchFilter {
  tag?: string;
  project?: string;
  area?: string;
  /** 1 (highest) to 3, or 0 for none. */
  priority?: number;
  /** A deadline on or before this day. */
  dueBy?: string;
  noEstimate?: boolean;
  repeating?: boolean;
}

export interface SearchView {
  tasks: TaskView[];
  projects: { id: string; name: string; area: string | null }[];
  areas: { id: string; name: string }[];
  /** Finished longer ago than the Logbook holds (asked for with finished ones): the day it was finished, in the person's zone. */
  older: { id: string; title: string; finished: LocalDate; project: string | null; occurrence: boolean }[];
}

export interface TaskPatchInput {
  title?: string;
  notes?: string | null;
  /** Words or an ISO date; "none" clears it. */
  deadline?: string | null;
  /** Minutes, or "45m", "1h30"; null clears it. */
  estimate?: number | string | null;
  /** 1 (highest) to 3, or 0 for none — as `!1` reads in quick-add. */
  priority?: number;
  /** A project name; "none" takes it out of any project. */
  project?: string | null;
  /** An area to file it in directly, with no project. */
  area?: string | null;
  /** A heading of its project; "none" for under none. */
  heading?: string | null;
  /** Hidden until this day; "none" clears it. */
  start?: string | null;
  /** A time of day, "15:00"; "none" takes the time off and keeps the day. */
  time?: string | null;
  evening?: boolean;
  ifMissed?: MissPolicy;
  addTags?: string[];
  removeTags?: string[];
}

export class Planner extends PlannerCore {
  readonly drafts = new Drafts(this);
  readonly blocks = new Blocks(this);
  readonly repeats = new Repeats(this);
  readonly places = new Places(this);
  readonly account = new Account(this);

  // ---------------------------------------------------------------- reads

  /** Today as the screen shows it: the day's tasks and this evening's, Carried over, the calendar and the spare time. */
  async todayView(): Promise<TodayView> {
    const c = await this.ctx();
    const iso = c.today.toString();
    const rows = await this.store.tasks({ states: ["inbox", "active"], doDateLte: iso, startedBy: iso });
    const all = await this.views(rows);
    const byDay = (a: TaskView, b: TaskView) => byCodeUnit(a.daySortKey ?? "", b.daySortKey ?? "") || byCodeUnit(a.sortKey, b.sortKey) || byCodeUnit(a.id, b.id);
    const carried = carriedOver(all, c.today) as TaskView[];
    const carriedIds = new Set(carried.map((t) => t.id));
    const onDay = all.filter((t) => !carriedIds.has(t.id) && t.doDate?.equals(c.today)).sort(byDay);
    const { capacity, meetings, blocks } = (await this.days([c.today], rows))[0];
    const local = c.now.toZonedDateTimeISO(c.zone);
    return {
      today: c.today,
      now: Temporal.PlainTime.from({ hour: local.hour, minute: local.minute }),
      zone: c.zone,
      capacity,
      tasks: onDay.filter((t) => !t.evening),
      evening: onDay.filter((t) => t.evening),
      carried,
      meetings,
      blocks,
    };
  }

  /**
   * The scheduler's input for today, built as the app's preview builds it (features/planning/plan-input.ts): the
   * candidates are every open task Today shows (carried over, today, this evening), the blocks are the day's own with
   * their lock and source, and the days out to the furthest deadline feed deadline pressure.
   */
  private async planInput(): Promise<{ c: Ctx; input: PlanInput }> {
    const c = await this.ctx();
    const iso = c.today.toString();
    const rows = await this.store.tasks({ states: ["inbox", "active"], doDateLte: iso, startedBy: iso });
    const tasks = rows.map((r) => toTask(r as unknown as TaskRow));
    const byDay = (a: Task, b: Task) => byCodeUnit(a.daySortKey ?? "", b.daySortKey ?? "") || byCodeUnit(a.sortKey, b.sortKey) || byCodeUnit(a.id, b.id);
    const carried = carriedOver(tasks, c.today);
    const carriedIds = new Set(carried.map((t) => t.id));
    const onDay = tasks.filter((t) => !carriedIds.has(t.id) && t.doDate?.equals(c.today)).sort(byDay);
    const candidates = [...carried, ...onDay.filter((t) => !t.evening), ...onDay.filter((t) => t.evening)];
    const through = aheadThrough(c.today, candidates);
    const cal = await this.around(c.today.subtract({ days: 1 }).toString(), (through ?? c.today).add({ days: 1 }).toString(), rows);
    const settings = { timezone: c.zone, bufferPct: c.settings.bufferPct, defaultEstimateMin: c.settings.defaultEstimateMin };
    const capacity = capacityFor({ day: c.today, settings, workHours: cal.workHours, events: cal.events, blocks: cal.blocks, tasks: rows.map((t) => toCapacityTask(t as unknown as TaskRow)), now: c.now });
    // Completing a task marks its block done: what has passed stays as it was, the rest is free again (plan-input.ts).
    const nowMin = minuteOnDay(c.now, c.zone, c.today).minute;
    const blocks: PlanBlock[] = [];
    for (const b of cal.blockRows) {
      if (typeof b.start_at !== "string" || typeof b.end_at !== "string") continue;
      const start = minuteOnDay(Temporal.Instant.from(normaliseTimestamp(b.start_at)), c.zone, c.today).minute;
      const end = minuteOnDay(Temporal.Instant.from(normaliseTimestamp(b.end_at)), c.zone, c.today).minute;
      if (end <= start) continue;
      const block: PlanBlock = { id: String(b.id), taskId: str(b.task_id), start, end, locked: b.locked === 1, source: str(b.source) };
      if (!cal.closed(block.taskId)) blocks.push(block);
      else if (start < nowMin) blocks.push({ ...block, end: Math.min(end, nowMin) });
    }
    const createdOn = new Map<string, LocalDate>();
    for (const r of rows) if (typeof r.created_at === "string") createdOn.set(String(r.id), Temporal.Instant.from(normaliseTimestamp(r.created_at)).toZonedDateTimeISO(c.zone).toPlainDate());
    return {
      c,
      input: {
        day: c.today,
        capacity: { windows: capacity.windows, busy: capacity.busy },
        blocks,
        candidates: candidates.map((t) => planTask(t, createdOn.get(t.id) ?? null)),
        settings: { ...settings, maxBlockMin: c.settings.maxBlockMin, minBlockMin: c.settings.minBlockMin, eveningStartsAt: c.settings.eveningStartsAt },
        now: c.now,
        ahead: through ? aheadDays({ today: c.today, through, settings, workHours: cal.workHours, events: cal.events, blocks: cal.blocks }) : [],
      },
    };
  }

  private planView(c: Ctx, input: PlanInput, proposal: Proposal): DayPlanView {
    const local = c.now.toZonedDateTimeISO(c.zone);
    return { today: c.today, now: Temporal.PlainTime.from({ hour: local.hour, minute: local.minute }), zone: c.zone, proposal, considered: input.candidates.length };
  }

  /** Plan my day for the rest of today: the proposal with its reasons, and nothing written. */
  async planDay(): Promise<DayPlanView> {
    const { c, input } = await this.planInput();
    return this.planView(c, input, plan(input));
  }

  /**
   * Plan my day's Approve (block-repo.ts approvePlan): the plan as it stands now becomes blocks with source 'plan',
   * and the plan's own earlier unlocked blocks it replaces go in the same batch. The plan is worked out again here,
   * so what is written is what fits at this minute; the answer says exactly what went on the timeline.
   */
  async applyPlan(): Promise<DayPlanView> {
    if (!canApprovePlan()) throw new Refusal("Putting a plan on the timeline is part of Sparehour Pro. The plan itself is free to look at.");
    const { c, input } = await this.planInput();
    const proposal = plan(input);
    const view = this.planView(c, input, proposal);
    if (proposal.blocks.length === 0) return view;
    const ops: WireOp[] = [
      ...proposal.replaces.map((id) => this.del("time_blocks", id)),
      ...proposal.blocks.map((b) =>
        this.put("time_blocks", this.newId(), {
          space_id: c.spaceId,
          user_id: c.userId,
          task_id: b.taskId,
          title: b.title,
          start_at: isoAt(c.today, b.start, c.zone),
          end_at: isoAt(c.today, b.end, c.zone),
          locked: false,
          source: "plan",
        }),
      ),
    ];
    await this.apply(ops, "plan the day");
    return { ...view, applied: { placed: proposal.blocks.length, replaced: proposal.replaces.length } };
  }

  /** Untriaged tasks, newest first: the inbox is a queue. */
  async inbox(): Promise<TaskView[]> {
    const rows = await this.store.tasks({ states: ["inbox"] });
    return (await this.views(rows)).sort((a, b) => byCodeUnit(String(rowOf(rows, b.id).created_at ?? ""), String(rowOf(rows, a.id).created_at ?? "")) || byCodeUnit(a.id, b.id));
  }

  /** The days after today, each with its tasks and its spare time, and the open tasks with no day yet. */
  async upcoming(dayCount = 7): Promise<UpcomingView> {
    const c = await this.ctx();
    const n = Math.max(1, Math.min(31, Math.round(dayCount)));
    const first = c.today.add({ days: 1 });
    const last = c.today.add({ days: n });
    const [dated, undated] = await Promise.all([
      this.store.tasks({ states: ["active"], doDateGt: c.today.toString(), doDateLte: last.toString(), startedBy: c.today.toString() }),
      this.store.tasks({ states: ["active"], undated: true, startedBy: c.today.toString() }),
    ]);
    const views = await this.views([...dated, ...undated]);
    const days = Array.from({ length: n }, (_, i) => first.add({ days: i }));
    const figures = await this.days(days, dated);
    const byDay = (a: TaskView, b: TaskView) => byCodeUnit(a.daySortKey ?? "", b.daySortKey ?? "") || byCodeUnit(a.sortKey, b.sortKey) || byCodeUnit(a.id, b.id);
    return {
      today: c.today,
      days: days.map((day, i) => ({ day, capacity: figures[i].capacity, tasks: views.filter((t) => t.doDate?.equals(day)).sort(byDay) })),
      unplanned: views.filter((t) => t.doDate === null).sort((a, b) => byCodeUnit(a.sortKey, b.sortKey) || byCodeUnit(a.id, b.id)),
    };
  }

  /** One task with everything the detail panel shows. */
  async task(ref: string): Promise<TaskDetail> {
    const row = await this.findTask(ref, { anyState: true });
    const [view] = await this.views([row]);
    const steps = (await this.store.checklist(view.id)).sort((a, b) => byCodeUnit(String(a.sort_key ?? ""), String(b.sort_key ?? "")));
    return { ...view, checklist: steps.map((s) => ({ title: String(s.title ?? ""), done: s.done === 1 })) };
  }

  /** Areas with their projects (active and parked), and the projects in no area, with what is open in each. */
  async projects(): Promise<{ areas: { id: string; name: string; projects: ProjectLine[] }[]; loose: ProjectLine[] }> {
    const [projects, areas, open] = await Promise.all([this.store.projects(), this.store.areas(), this.store.tasks({ states: ["inbox", "active"] })]);
    const count = new Map<string, number>();
    for (const t of open) if (t.project_id) count.set(String(t.project_id), (count.get(String(t.project_id)) ?? 0) + 1);
    const lines = projects
      .filter((p) => p.state !== "done" && p.state !== "archived" && p.state !== "dropped")
      .sort((a, b) => byCodeUnit(String(a.sort_key ?? ""), String(b.sort_key ?? "")))
      .map((p) => ({ id: String(p.id), name: str(p.name) ?? "Untitled project", areaId: str(p.area_id), state: str(p.state) ?? "active", deadline: str(p.deadline), open: count.get(String(p.id)) ?? 0 }));
    const sortedAreas = [...areas].sort((a, b) => byCodeUnit(String(a.sort_key ?? ""), String(b.sort_key ?? "")));
    const areaIds = new Set(sortedAreas.map((a) => String(a.id)));
    return {
      areas: sortedAreas.map((a) => ({ id: String(a.id), name: str(a.name) ?? "Untitled area", projects: lines.filter((p) => p.areaId === String(a.id)) })),
      loose: lines.filter((p) => !p.areaId || !areaIds.has(p.areaId)),
    };
  }

  /**
   * Open tasks (and finished ones when asked), projects and areas matching every word. Finished ones come from
   * two places: the week the Logbook holds, and everything before it, which is kept in finished_tasks.
   */
  async search(query: string, includeDone = false, only: SearchFilter = {}): Promise<SearchView> {
    const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (Object.values(only).some((v) => v !== undefined)) return this.filter(words, includeDone, only);
    if (words.length === 0) throw new Refusal("Search for at least one word, or give something to filter by.");
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    const has = (...texts: (string | null | undefined)[]) => {
      const hay = texts.map((t) => (t ?? "").toLocaleLowerCase()).join("\n");
      return words.every((w) => hay.includes(w.toLocaleLowerCase()));
    };
    const states: TaskState[] = includeDone ? ["inbox", "active", "someday", "done", "dropped"] : ["inbox", "active", "someday"];
    const [taskRows, projects, areas, olderRows] = await Promise.all([
      this.store.tasks({ states, text: longest, limit: 200 }),
      this.store.projects(),
      this.store.areas(),
      includeDone ? this.store.finished({ words, limit: 15 }) : Promise.resolve([]),
    ]);
    const c = await this.ctx();
    const projectName = new Map(projects.map((p) => [String(p.id), str(p.name)]));
    const tasks = (await this.views(taskRows.filter((t) => has(str(t.title), str(t.notes_md)))))
      .sort((a, b) => Number(a.doDate === null) - Number(b.doDate === null) || (a.doDate && b.doDate ? compareDates(a.doDate, b.doDate) : 0) || byCodeUnit(a.sortKey, b.sortKey))
      .slice(0, 15);
    const areaName = new Map(areas.map((a) => [String(a.id), str(a.name)]));
    return {
      tasks,
      projects: projects
        .filter((p) => p.state !== "archived" && has(str(p.name)))
        .slice(0, 10)
        .map((p) => ({ id: String(p.id), name: String(p.name ?? ""), area: p.area_id ? (areaName.get(String(p.area_id)) ?? null) : null })),
      areas: areas.filter((a) => has(str(a.name))).map((a) => ({ id: String(a.id), name: String(a.name ?? "") })),
      older: olderRows
        .filter((r) => typeof r.completed_at === "string")
        .map((r) => ({
          id: String(r.id),
          title: String(r.title ?? ""),
          finished: Temporal.Instant.from(normaliseTimestamp(String(r.completed_at))).toZonedDateTimeISO(c.zone).toPlainDate(),
          project: r.project_id ? (projectName.get(String(r.project_id)) ?? null) : null,
          occurrence: Boolean(r.occurrence_of),
        })),
    };
  }

  /** Open tasks picked out by tag, project, area, priority, deadline or a missing estimate, and the words when given. */
  private async filter(words: readonly string[], includeDone: boolean, f: SearchFilter): Promise<SearchView> {
    const c = await this.ctx();
    const states: TaskState[] = includeDone ? ["inbox", "active", "someday", "done", "dropped"] : ["inbox", "active", "someday"];
    const project = f.project ? this.findProject(f.project, await this.store.projects()) : null;
    const area = f.area ? await this.findArea(f.area) : null;
    const inArea = area ? new Set((await this.store.projects()).filter((p) => p.area_id === area.id).map((p) => String(p.id))) : null;
    const due = f.dueBy ? this.readDay(f.dueBy, c).date : null;
    const rows = await this.store.tasks({ states, ...(project ? { projectId: String(project.id) } : {}) });
    const tag = f.tag ? fold(f.tag.replace(/^[@#]/, "")) : null;
    const tasks = (await this.views(rows))
      .filter((t) => words.every((w) => `${t.title}\n${t.notes ?? ""}`.toLocaleLowerCase().includes(w.toLocaleLowerCase())))
      .filter((t) => !tag || t.tagNames.some((n) => fold(n) === tag))
      .filter((t) => !area || t.areaId === area.id || (t.projectId !== null && inArea?.has(t.projectId)))
      .filter((t) => f.priority === undefined || t.priority === (f.priority === 0 ? 0 : 4 - f.priority))
      .filter((t) => !due || (t.deadline !== null && compareDates(t.deadline, due) <= 0))
      .filter((t) => !f.noEstimate || t.estimateMin === null)
      .filter((t) => !f.repeating || t.repeats !== null)
      .sort((a, b) => Number(a.doDate === null) - Number(b.doDate === null) || (a.doDate && b.doDate ? compareDates(a.doDate, b.doDate) : 0) || byCodeUnit(a.sortKey, b.sortKey))
      .slice(0, 50);
    return { tasks, projects: [], areas: [], older: [] };
  }

  // ---------------------------------------------------------------- task writes

  /** A task from one line of quick-add, filed and dated exactly as the app's sheet would file it. */
  addTask(text: string, notes?: string | null): Promise<Added> {
    return this.drafts.add({ text, notes });
  }

  /**
   * Done; a repeating task rolls on to its next day (or ends with its series), as the app completes it. `tookMin`
   * is how long it took, when the person said: on the task, or for a repeat on that day's completion, where the
   * estimates learn from it (DECISIONS.md, amendment 2026-11-15).
   */
  async complete(ref: string, tookMin?: number | null): Promise<Changed> {
    const c = await this.ctx();
    const row = await this.findTask(ref, { anyState: true });
    const title = String(row.title ?? "");
    if (row.state === "done") throw new Refusal(`${quoted(title)} is already done.`);
    if (row.state === "dropped" || row.state === "archived") throw new Refusal(`${quoted(title)} was ${row.state}; bring it back with reopen_task first.`);
    const at = new Date(c.now.epochMilliseconds).toISOString();
    const id = String(row.id);
    const took = tookMin != null && Number.isFinite(tookMin) && tookMin >= 1 ? Math.round(tookMin) : null;
    const tookWords = took == null ? "" : ` · took ${formatMinutes(took)}`;
    if (row.recurrence_rule && row.recurrence_mode) {
      const series = String(row.recurrence_series_id ?? id);
      const plan = planCompletion(
        { do_date: str(row.do_date), deadline: str(row.deadline), recurrence_rule: String(row.recurrence_rule), recurrence_mode: str(row.recurrence_mode), recurrence_paused_until: str(row.recurrence_paused_until) },
        toExceptions((await this.store.exceptions(series)).map(exceptionRow)),
        c.today,
      );
      const ops: WireOp[] = [
        this.put("task_completions", this.newId(), { space_id: str(row.space_id), task_id: id, occurrence_date: plan.occurrence.toString(), completed_at: at, actual_min: took ?? row.actual_min ?? null }),
      ];
      if (plan.next) {
        ops.push(this.patch("tasks", id, { do_date: plan.next.toString(), deadline: plan.deadline?.toString() ?? null, state: "active", completed_at: null }));
        for (const s of await this.store.checklist(id)) if (s.done === 1) ops.push(this.patch("checklist_items", String(s.id), { done: false }));
      } else {
        ops.push(this.patch("tasks", id, { state: "done", completed_at: at }));
      }
      await this.apply(ops, `complete ${quoted(title)}`);
      // It keeps its time on the day it moved on to, as the app rolls it forward.
      const timed = plan.next ? await this.keepTime(id, null) : { changed: 0 };
      return { said: `${plan.next ? `Completed ${quoted(title)} · it repeats, next on ${dayWords(plan.next, c.today)}` : `Completed ${quoted(title)} · that was the last one in its series`}${tookWords}`, id, blocksChanged: timed.changed };
    }
    await this.apply([this.patch("tasks", id, { state: "done", completed_at: at, ...(took == null ? {} : { actual_min: took }) })], `complete ${quoted(title)}`);
    return { said: `Completed ${quoted(title)}${tookWords}`, id, blocksChanged: 0 };
  }

  /** Un-completes a finished task, or brings back a dropped one (PRODUCT_SPEC.md §7 rule 2). */
  async reopen(ref: string): Promise<Changed> {
    const row = await this.findTask(ref, { anyState: true });
    const title = String(row.title ?? "");
    const id = String(row.id);
    if (row.state === "dropped" || row.state === "archived") {
      await this.apply([this.patch("tasks", id, { state: "active" })], `bring back ${quoted(title)}`);
      return { said: `Brought back ${quoted(title)}`, id, blocksChanged: 0 };
    }
    if (row.state !== "done") throw new Refusal(`${quoted(title)} is not done, so there is nothing to reopen.`);
    const filedOrDated = row.project_id || row.area_id || row.do_date || row.deadline || row.start_date;
    await this.apply([this.patch("tasks", id, { state: filedOrDated ? "active" : "inbox", completed_at: null })], `reopen ${quoted(title)}`);
    return { said: `Reopened ${quoted(title)}`, id, blocksChanged: 0 };
  }

  /** Drop it: out of every list, kept under the Logbook's Dropped, and reopen_task brings it back. */
  async drop(ref: string): Promise<Changed> {
    const row = await this.findTask(ref);
    const title = String(row.title ?? "");
    const id = String(row.id);
    const released = await this.releasedBlocks(id, null);
    await this.apply([this.patch("tasks", id, { state: "dropped" }), ...released.map((b) => this.del("time_blocks", b))], `drop ${quoted(title)}`);
    return { said: `Dropped ${quoted(title)} (it stays in the Logbook under Dropped; reopen_task brings it back)`, id, blocksChanged: released.length };
  }

  /**
   * A new day for a task, read as the task's Do field reads words ("tomorrow", "fri 3pm", "next week", "2026-11-02"),
   * or "someday", or "none" for no day. A repeating task moves just this once: the rule stays.
   */
  async reschedule(ref: string, when: string): Promise<Changed> {
    const c = await this.ctx();
    const row = await this.findTask(ref);
    const title = String(row.title ?? "");
    const id = String(row.id);
    const words = fold(when);
    const repeating = Boolean(row.recurrence_rule && row.recurrence_mode);

    if (words === "someday" || words === "none" || words === "no date" || words === "unschedule" || words === "unscheduled") {
      if (repeating) throw new Refusal(`${quoted(title)} repeats, so it always has a next day. Move it to another day, drop it, or change its repeat in Sparehour.`);
      const released = await this.releasedBlocks(id, null);
      const patch = words === "someday" ? { state: "someday", do_date: null, do_time: null } : { state: "active", do_date: null, do_time: null };
      await this.apply([this.patch("tasks", id, patch), ...released.map((b) => this.del("time_blocks", b))], `move ${quoted(title)}`);
      return { said: words === "someday" ? `Moved ${quoted(title)} to Someday` : `Took the day off ${quoted(title)} (it waits in Upcoming's Not yet planned)`, id, blocksChanged: released.length };
    }

    const typed = this.readDay(when, c);
    const patch: Record<string, unknown> = { do_date: typed.date.toString() };
    if (typed.time) patch.do_time = typed.time.toString({ smallestUnit: "minute" });
    if (typed.evening || typed.time) patch.evening = typed.evening;
    if (row.state === "inbox" || row.state === "someday") patch.state = "active";
    const released = await this.releasedBlocks(id, typed.date);
    const ops: WireOp[] = [this.patch("tasks", id, patch), ...released.map((b) => this.del("time_blocks", b))];
    let once = "";
    if (repeating) {
      // "Just this once" (series-repo.ts moveOnce): the occurrence moves under its stable exception id; back on its own day, the exception goes.
      const series = String(row.recurrence_series_id ?? id);
      const exceptions = toExceptions((await this.store.exceptions(series)).map(exceptionRow));
      const occurrence = currentOccurrence(row.do_date ? localDate(String(row.do_date)) : null, c.today, exceptions);
      const exId = exceptionId(series, occurrence.toString());
      if (typed.date.equals(occurrence)) {
        if (exceptions.some((e) => e.occurrenceDate.equals(occurrence))) ops.unshift(this.del("recurrence_exceptions", exId));
      } else {
        ops.unshift(this.put("recurrence_exceptions", exId, { space_id: str(row.space_id), series_id: series, occurrence_date: occurrence.toString(), kind: "move", moved_to: typed.date.toString(), deleted_at: null }));
      }
      once = `, just this once (it still repeats ${ruleWords(String(row.recurrence_rule), row.recurrence_mode as RecurrenceMode)})`;
    }
    await this.apply(ops, `move ${quoted(title)}`);
    const timed = await this.keepTime(id, row);
    const time = typed.time ? ` ${typed.time.toString({ smallestUnit: "minute" })}` : typed.evening ? ", evening" : "";
    return { said: `Moved ${quoted(title)} to ${dayWords(typed.date, c.today)}${time}${once}${timed.words}${timed.notes}`, id, blocksChanged: released.length + timed.changed };
  }

  /** Edits the title, note, deadline, estimate, priority, project or tags; only the fields given change. */
  async update(ref: string, input: TaskPatchInput): Promise<Changed> {
    const c = await this.ctx();
    const row = await this.findTask(ref);
    const title = String(row.title ?? "");
    const id = String(row.id);
    const patch: Record<string, unknown> = {};
    const said: string[] = [];
    if (input.title !== undefined) {
      if (!input.title.trim()) throw new Refusal("A task needs a title.");
      patch.title = input.title.trim();
      said.push(`renamed to ${quoted(input.title.trim())}`);
    }
    if (input.notes !== undefined) {
      patch.notes_md = input.notes?.trim() || null;
      said.push(patch.notes_md ? "note replaced" : "note cleared");
    }
    if (input.deadline !== undefined) {
      const words = fold(input.deadline ?? "none");
      if (words === "none" || words === "") {
        patch.deadline = null;
        said.push("deadline cleared");
      } else {
        const day = this.readDay(input.deadline as string, c).date;
        patch.deadline = day.toString();
        said.push(`due ${dayWords(day, c.today)}`);
      }
    }
    if (input.estimate !== undefined) {
      const min = estimateMinutes(input.estimate);
      if (min === undefined) throw new Refusal(`Couldn't read ${quoted(String(input.estimate))} as an estimate: use minutes, "45m" or "1h30".`);
      patch.estimate_min = min;
      said.push(min === null ? "estimate cleared" : `estimate ${min}m`);
    }
    if (input.priority !== undefined) {
      const p = Math.round(input.priority);
      if (p < 0 || p > 3) throw new Refusal("Priority is 1 (highest), 2, 3, or 0 for none.");
      patch.priority = p === 0 ? 0 : 4 - p;
      said.push(p === 0 ? "no priority" : `priority ${p}`);
    }
    if (input.project !== undefined) {
      const name = input.project?.trim() ?? "";
      if (!name || fold(name) === "none") {
        patch.project_id = null;
        patch.area_id = null;
        patch.heading_id = null;
        said.push("out of its project");
      } else {
        const project = this.findProject(name, await this.openProjects());
        patch.project_id = project.id;
        patch.area_id = null;
        if (row.project_id !== project.id) patch.heading_id = null;
        said.push(`in ${String(project.name)}`);
      }
    }
    if (input.area !== undefined && input.area !== null && fold(input.area) !== "none") {
      const area = await this.findArea(input.area);
      Object.assign(patch, { area_id: area.id, project_id: null, heading_id: null });
      said.push(`in ${String(area.name)}`);
    } else if (input.area !== undefined) {
      patch.area_id = null;
      said.push("out of its area");
    }
    if (input.heading !== undefined) {
      const projectId = patch.project_id !== undefined ? patch.project_id : row.project_id;
      const words = input.heading?.trim() ?? "";
      if (!words || fold(words) === "none") {
        patch.heading_id = null;
        said.push("under no heading");
      } else {
        if (!projectId) throw new Refusal("A heading is inside a project, and this task is in none.");
        const headings = await this.store.headings(String(projectId));
        const heading = headings.find((h) => h.id === words || fold(String(h.title ?? "")) === fold(words));
        if (!heading) throw new Refusal(`Its project has no heading called ${quoted(words)}.${headings.length ? ` It has: ${headings.map((h) => quoted(String(h.title))).join(", ")}.` : ""} update_project adds one.`);
        patch.heading_id = heading.id;
        said.push(`under ${String(heading.title)}`);
      }
    }
    if (input.start !== undefined) {
      const day = !input.start || fold(input.start) === "none" ? null : this.readDay(input.start, c).date;
      patch.start_date = day?.toString() ?? null;
      said.push(day ? `starts ${dayWords(day, c.today)}` : "start date cleared");
    }
    if (input.time !== undefined) {
      const none = !input.time || fold(input.time) === "none";
      if (!none && !row.do_date) throw new Refusal(`${quoted(title)} has no day yet: give it one with reschedule_task, with the time in the same words ("fri 3pm").`);
      const time = none ? null : this.readTime(input.time as string, c);
      patch.do_time = time?.toString({ smallestUnit: "minute" }) ?? null;
      if (time) patch.evening = Temporal.PlainTime.compare(time, c.settings.eveningStartsAt) >= 0;
      said.push(time ? `at ${patch.do_time}` : "no time");
    }
    if (input.evening !== undefined) {
      patch.evening = input.evening;
      said.push(input.evening ? "this evening" : "not in the evening");
    }
    if (input.ifMissed !== undefined) {
      patch.miss_policy = input.ifMissed;
      said.push(`if missed: ${input.ifMissed}`);
    }
    // A project, an area, a deadline or a start date takes a task out of the Inbox (PRODUCT_SPEC.md §5.1 rule 5).
    if (row.state === "inbox" && (patch.project_id || patch.area_id || patch.deadline || patch.start_date)) patch.state = "active";
    const ops: WireOp[] = Object.keys(patch).length ? [this.patch("tasks", id, patch)] : [];
    if (input.addTags?.length || input.removeTags?.length) {
      const tagOps = await this.retag("task_tags", "task_id", id, String(row.space_id), input.addTags ?? [], input.removeTags ?? []);
      ops.push(...tagOps.ops);
      said.push(...tagOps.said);
    }
    if (ops.length === 0) throw new Refusal("Nothing to change: give at least one field.");
    await this.apply(ops, `change ${quoted(title)}`);
    const timed = "do_time" in patch || "estimate_min" in patch ? await this.keepTime(id, row) : { words: "", changed: 0, notes: "" };
    return { said: `Changed ${quoted(title)}: ${said.join(", ")}${timed.words}${timed.notes}`, id, blocksChanged: timed.changed };
  }
}

export interface ProjectLine {
  id: string;
  name: string;
  areaId: string | null;
  state: string;
  deadline: string | null;
  open: number;
}

function rowOf(rows: readonly Row[], id: string): Row {
  return rows.find((r) => r.id === id) as Row;
}
