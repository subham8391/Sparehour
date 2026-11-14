// The planner as Claude sees it (DECISIONS.md, amendment 2026-10-23): what Today, the Inbox, Upcoming and search
// show, and the writes a person makes from them — each read the way the app reads it (the same mappers,
// carried-over rule and capacity engine) and each write built as the app would build it (quick-add's
// parser and filing, the draft's row, a repeat's completion, a move "just this once") and sent through
// apply_mutations as the person. Plan my day is the app's own scheduler (core/planning) over the same day, shown
// first and written only when asked (DECISIONS.md, amendment 2026-11-14). Anything that cannot be done is a Refusal
// with a reason the tools pass on.
import { capacityFor, type Capacity } from "@/core/capacity";
import { keyBetween } from "@/core/ordering";
import { plan, type PlanBlock, type PlanInput, type Proposal } from "@/core/planning";
import { parse, type ParseContext, type TaskDraft } from "@/core/quickadd";
import { draftRow } from "@/core/quickadd/draft-row";
import { readTypedDate } from "@/core/quickadd/read-date";
import { planCompletion, toExceptions } from "@/core/recurrence/completion";
import { exceptionId } from "@/core/recurrence/exception-id";
import { currentOccurrence } from "@/core/recurrence/series";
import { ruleWords } from "@/core/recurrence/words";
import { carriedOver } from "@/core/rollover/carried";
import { Temporal, compareDates, localDate, todayFor, type Instant, type LocalDate, type LocalTime } from "@/core/time";
import type { RecurrenceMode, Task } from "@/core/types";
import { normaliseTimestamp, toCapacityBlock, toCapacityEvent, toCapacityTask, toSettings, toTask, toWorkWindow, type Settings } from "@/data/mappers";
import type { CalendarEventRow, TaskRow, TimeBlockRow, UserSettingsRow, WorkHoursRow } from "@/data/schema.client";
import { canApprovePlan } from "@/features/planning/entitlement";
import { aheadDays, aheadThrough, isoAt, planTask } from "@/features/planning/plan-input";
import { chooseProject, fileLine } from "@/features/quickadd/file-line";
import { interpret, resolveTag, type QuickAddProject } from "@/features/quickadd/interpret";
import { minuteOnDay } from "@/features/today/day-minute";
import { sanitize, type WireOp } from "@/server/sync/upload";
import type { PlannerStore, Row, TaskState } from "./store";

/** A request the planner will not carry out, with the reason in words for the person. */
export class Refusal extends Error {}

const OPEN: readonly TaskState[] = ["inbox", "active", "someday"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const byCodeUnit = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
const fold = (s: string) => s.trim().toLocaleLowerCase();
const str = (v: string | number | null | undefined): string | null => (v == null ? null : String(v));
const quoted = (s: string) => `“${s}”`;

export interface TaskView extends Task {
  project: string | null;
  area: string | null;
  tagNames: string[];
  repeats: string | null;
}

export interface Meeting {
  start: string;
  end: string;
  title: string;
}

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

export interface SearchView {
  tasks: TaskView[];
  projects: { id: string; name: string; area: string | null }[];
  areas: { id: string; name: string }[];
}

export interface Added {
  task: TaskView;
  strip: string;
  destination: string;
  /** A `#name` that filed nothing and stayed in the title. */
  unfiled: { name: string; several: boolean } | null;
}

export interface Changed {
  /** What happened, in words: "Completed “Gym” · next Mon 26 Oct". */
  said: string;
  id: string;
  /** Blocks this change took off the calendar, so the caller can push the calendar now rather than at the tick. */
  blocksReleased: number;
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
  addTags?: string[];
  removeTags?: string[];
}

interface Ctx {
  userId: string;
  spaceId: string;
  zone: string;
  today: LocalDate;
  now: Instant;
  settings: Settings;
  defaultMissPolicy: string | null;
  parse: ParseContext;
}

export interface PlannerOptions {
  /** apply_mutations' device id for this connection: "mcp:<client id>". */
  device: string;
  now?: () => Instant;
  newId?: () => string;
}

export class Planner {
  private ctxP: Promise<Ctx> | null = null;
  private opSeq = 0;
  private readonly now: () => Instant;
  private readonly newId: () => string;

  constructor(
    private readonly store: PlannerStore,
    private readonly opts: PlannerOptions,
  ) {
    this.now = opts.now ?? (() => Temporal.Now.instant());
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  // ---------------------------------------------------------------- context

  private ctx(): Promise<Ctx> {
    this.ctxP ??= (async () => {
      const p = await this.store.profile();
      const settings = toSettings((p.settings ?? {}) as unknown as UserSettingsRow);
      const now = this.now();
      const today = todayFor({ timezone: settings.timezone, dayRolloverHour: settings.dayRolloverHour }, now);
      return {
        userId: p.userId,
        spaceId: p.spaceId,
        zone: settings.timezone,
        today,
        now,
        settings,
        defaultMissPolicy: str(p.settings?.default_miss_policy),
        parse: { now, zone: settings.timezone, today, eveningStartsAt: settings.eveningStartsAt },
      };
    })();
    return this.ctxP;
  }

  /** The person's day now: their zone and their rollover hour. */
  async today(): Promise<LocalDate> {
    return (await this.ctx()).today;
  }

  private async views(rows: readonly Row[]): Promise<TaskView[]> {
    if (rows.length === 0) return [];
    const [projects, areas, tags] = await Promise.all([this.store.projects(), this.store.areas(), this.store.taskTags(rows.map((r) => String(r.id)))]);
    const projectName = new Map(projects.map((p) => [String(p.id), str(p.name)]));
    const areaName = new Map(areas.map((a) => [String(a.id), str(a.name)]));
    const tagsOf = new Map<string, string[]>();
    for (const t of tags) tagsOf.set(t.task_id, [...(tagsOf.get(t.task_id) ?? []), t.name]);
    return rows.map((r) => {
      const t = toTask(r as unknown as TaskRow);
      return {
        ...t,
        project: t.projectId ? (projectName.get(t.projectId) ?? null) : null,
        area: t.areaId ? (areaName.get(t.areaId) ?? null) : null,
        tagNames: (tagsOf.get(t.id) ?? []).sort((a, b) => a.localeCompare(b)),
        repeats: t.recurrenceRule ? ruleWords(t.recurrenceRule, t.recurrenceMode as RecurrenceMode | null) : null,
      };
    });
  }

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
   * The calendar between two ISO days, read once: the working hours, the meetings, and the blocks as capacity counts
   * them, with the raw rows for the lines the answers draw.
   */
  private async around(from: string, to: string, taskRows: readonly Row[]) {
    const c = await this.ctx();
    const [workRows, calendars, eventRows, blockRows] = await Promise.all([this.store.workHours(), this.store.calendars(), this.store.events(from, to), this.store.blocks(from, to)]);
    const read = new Map(calendars.map((k) => [String(k.id), k.read !== 0]));
    const hidden = new Set(calendars.filter((k) => k.private === 1).map((k) => String(k.id)));
    const workHours = workRows.map((w) => toWorkWindow(w as unknown as WorkHoursRow)).filter((w): w is NonNullable<typeof w> => w !== null);
    const events = eventRows.map((e) => toCapacityEvent(e as unknown as CalendarEventRow, read.get(String(e.calendar_id ?? "")) ?? true));
    const titleOf = new Map(taskRows.map((t) => [String(t.id), str(t.title)]));
    // A block whose task is finished counts only for what already ran (use-today.ts capacityBlocks).
    const stateOf = new Map(taskRows.map((t) => [String(t.id), str(t.state)]));
    const others = [...new Set(blockRows.map((b) => str(b.task_id)).filter((id): id is string => id !== null && !stateOf.has(id)))];
    if (others.length) for (const t of await this.store.tasks({ states: ["inbox", "active", "someday", "done", "dropped", "archived"], ids: others })) {
      stateOf.set(String(t.id), str(t.state));
      titleOf.set(String(t.id), str(t.title));
    }
    const closed = (taskId: string | null) => {
      const s = taskId ? stateOf.get(taskId) : null;
      return Boolean(s) && s !== "inbox" && s !== "active";
    };
    const blocks = blockRows
      .map((b) => toCapacityBlock(b as unknown as TimeBlockRow))
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .flatMap((b) => {
        if (!closed(b.taskId)) return [b];
        if (Temporal.Instant.compare(b.startAt, c.now) >= 0) return [];
        return Temporal.Instant.compare(b.endAt, c.now) <= 0 ? [b] : [{ ...b, endAt: c.now }];
      });
    return { workHours, events, blocks, eventRows, blockRows, read, hidden, titleOf, closed };
  }

  /** The capacity, meetings and blocks of each day, from one read of the calendar around them. */
  private async days(days: readonly LocalDate[], taskRows: readonly Row[]): Promise<{ capacity: Capacity | null; meetings: Meeting[]; blocks: Meeting[] }[]> {
    const c = await this.ctx();
    const { workHours, events, blocks, eventRows, blockRows, read, hidden, titleOf } = await this.around(days[0].subtract({ days: 1 }).toString(), days[days.length - 1].add({ days: 1 }).toString(), taskRows);
    const tasks = taskRows.map((t) => toCapacityTask(t as unknown as TaskRow));
    return days.map((day) => {
      const capacity = capacityFor({
        day,
        settings: { timezone: c.zone, bufferPct: c.settings.bufferPct, defaultEstimateMin: c.settings.defaultEstimateMin },
        workHours,
        events,
        blocks,
        tasks,
        now: day.equals(c.today) ? c.now : undefined,
      });
      const span = (startAt: unknown, endAt: unknown): { start: string; end: string } | null => {
        if (typeof startAt !== "string" || typeof endAt !== "string") return null;
        const s = Temporal.Instant.from(normaliseTimestamp(startAt)).toZonedDateTimeISO(c.zone);
        const e = Temporal.Instant.from(normaliseTimestamp(endAt)).toZonedDateTimeISO(c.zone);
        if (!s.toPlainDate().equals(day)) return null;
        const hm = (z: Temporal.ZonedDateTime) => `${String(z.hour).padStart(2, "0")}:${String(z.minute).padStart(2, "0")}`;
        return { start: hm(s), end: e.toPlainDate().equals(day) ? hm(e) : "24:00" };
      };
      const meetings: Meeting[] = [];
      for (const e of eventRows) {
        if (e.all_day === 1 || e.status === "cancelled" || e.is_ours === 1) continue;
        if (e.calendar_id && read.get(String(e.calendar_id)) === false) continue;
        const at = span(e.start_at, e.end_at);
        if (!at) continue;
        const title = (e.calendar_id && hidden.has(String(e.calendar_id))) || !e.summary ? "Busy" : String(e.summary);
        meetings.push({ ...at, title: e.self_response === "declined" ? `${title} (declined)` : title });
      }
      const blockLines: Meeting[] = [];
      for (const b of blockRows) {
        const at = span(b.start_at, b.end_at);
        if (at) blockLines.push({ ...at, title: str(b.title) ?? (b.task_id ? (titleOf.get(String(b.task_id)) ?? "A task") : "Block") });
      }
      const byStart = (a: Meeting, b: Meeting) => a.start.localeCompare(b.start);
      return { capacity, meetings: meetings.sort(byStart), blocks: blockLines.sort(byStart) };
    });
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

  /** Open tasks (and finished ones when asked), projects and areas matching every word. */
  async search(query: string, includeDone = false): Promise<SearchView> {
    const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (words.length === 0) throw new Refusal("Search for at least one word.");
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    const has = (...texts: (string | null | undefined)[]) => {
      const hay = texts.map((t) => (t ?? "").toLocaleLowerCase()).join("\n");
      return words.every((w) => hay.includes(w.toLocaleLowerCase()));
    };
    const states: TaskState[] = includeDone ? ["inbox", "active", "someday", "done", "dropped"] : ["inbox", "active", "someday"];
    const [taskRows, projects, areas] = await Promise.all([this.store.tasks({ states, text: longest, limit: 200 }), this.store.projects(), this.store.areas()]);
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
    };
  }

  // ---------------------------------------------------------------- task writes

  /** A task from one line of quick-add, filed and dated exactly as the app's sheet would file it. */
  async addTask(text: string, notes?: string | null): Promise<Added> {
    const c = await this.ctx();
    const line = text.trim();
    if (!line) throw new Refusal("There is nothing to add: the text is empty.");
    if (line.includes("\n")) throw new Refusal("One task per call: send each line on its own.");
    const parsed = parse(line, c.parse);
    if (!parsed.ok) throw new Refusal("There is nothing to add: once the date, time and tags are read, no title is left.");
    const projectRows = (await this.store.projects()).filter((p) => p.state !== "done" && p.state !== "archived" && p.state !== "dropped");
    const projects: QuickAddProject[] = projectRows.map((p) => ({ id: String(p.id), name: String(p.name ?? ""), area: str(p.area_id) }));
    const filed = fileLine(line, parsed, projects, c.parse, chooseProject(parsed.draft, projects, null, false));
    const draft: TaskDraft = { ...filed.submission.draft };
    const extra = notes?.trim();
    if (extra) draft.notes = draft.notes ? `${draft.notes}\n\n${extra}` : extra;

    const ops: WireOp[] = [];
    let projectId = filed.submission.projectId;
    if (!projectId && filed.submission.createProjectName) {
      const name = filed.submission.createProjectName;
      // Two lines naming one new project: the second joins the first (quick-add-provider does the same).
      const existing = projectRows.find((p) => fold(String(p.name ?? "")) === fold(name));
      if (existing) projectId = String(existing.id);
      else {
        projectId = this.newId();
        ops.push(this.put("projects", projectId, { space_id: c.spaceId, area_id: null, name: name.trim(), state: "active", sort_key: keyBetween(lastKey(await this.store.projectSortKeys(null)), null) }));
      }
    }

    const id = this.newId();
    const row = draftRow(id, draft, {
      projectId,
      areaId: null,
      headingId: null,
      defaultMissPolicy: c.defaultMissPolicy,
      lastSortKey: lastKey(await this.store.taskSortKeys(projectId, null)),
      daySortAfter: draft.doDate ? lastKey(await this.store.daySortKeys(draft.doDate.toString())) : null,
    });
    ops.push(this.put("tasks", id, { space_id: c.spaceId, ...row, source: "mcp" }));
    const { ops: tagOps, newTags } = await this.tagLinks("task_tags", "task_id", id, c.spaceId, draft.tagNames);
    ops.push(...tagOps);
    await this.apply(ops, `add ${quoted(draft.title)}`);

    const label = filed.submission.createProjectName && projectId && !projectRows.some((p) => p.id === projectId) ? `new project ${filed.submission.createProjectName}` : filed.project;
    const said = interpret(draft, c.today, label, newTags);
    const fresh = await this.store.task(id);
    const [task] = await this.views([fresh ?? (this.syntheticRow(id, c.spaceId, row) as Row)]);
    return { task, strip: said.strip, destination: said.destination, unfiled: filed.unfiled };
  }

  /** Done; a repeating task rolls on to its next day (or ends with its series), as the app completes it. */
  async complete(ref: string): Promise<Changed> {
    const c = await this.ctx();
    const row = await this.findTask(ref, { anyState: true });
    const title = String(row.title ?? "");
    if (row.state === "done") throw new Refusal(`${quoted(title)} is already done.`);
    if (row.state === "dropped" || row.state === "archived") throw new Refusal(`${quoted(title)} was ${row.state}; bring it back with reopen_task first.`);
    const at = new Date(c.now.epochMilliseconds).toISOString();
    const id = String(row.id);
    if (row.recurrence_rule && row.recurrence_mode) {
      const series = String(row.recurrence_series_id ?? id);
      const plan = planCompletion(
        { do_date: str(row.do_date), deadline: str(row.deadline), recurrence_rule: String(row.recurrence_rule), recurrence_mode: str(row.recurrence_mode), recurrence_paused_until: str(row.recurrence_paused_until) },
        toExceptions((await this.store.exceptions(series)).map(exceptionRow)),
        c.today,
      );
      const ops: WireOp[] = [
        this.put("task_completions", this.newId(), { space_id: str(row.space_id), task_id: id, occurrence_date: plan.occurrence.toString(), completed_at: at, actual_min: row.actual_min ?? null }),
      ];
      if (plan.next) {
        ops.push(this.patch("tasks", id, { do_date: plan.next.toString(), deadline: plan.deadline?.toString() ?? null, state: "active", completed_at: null }));
        for (const s of await this.store.checklist(id)) if (s.done === 1) ops.push(this.patch("checklist_items", String(s.id), { done: false }));
      } else {
        ops.push(this.patch("tasks", id, { state: "done", completed_at: at }));
      }
      await this.apply(ops, `complete ${quoted(title)}`);
      return { said: plan.next ? `Completed ${quoted(title)} · it repeats, next on ${dayWords(plan.next, c.today)}` : `Completed ${quoted(title)} · that was the last one in its series`, id, blocksReleased: 0 };
    }
    await this.apply([this.patch("tasks", id, { state: "done", completed_at: at })], `complete ${quoted(title)}`);
    return { said: `Completed ${quoted(title)}`, id, blocksReleased: 0 };
  }

  /** Un-completes a finished task, or brings back a dropped one (PRODUCT_SPEC.md §7 rule 2). */
  async reopen(ref: string): Promise<Changed> {
    const row = await this.findTask(ref, { anyState: true });
    const title = String(row.title ?? "");
    const id = String(row.id);
    if (row.state === "dropped" || row.state === "archived") {
      await this.apply([this.patch("tasks", id, { state: "active" })], `bring back ${quoted(title)}`);
      return { said: `Brought back ${quoted(title)}`, id, blocksReleased: 0 };
    }
    if (row.state !== "done") throw new Refusal(`${quoted(title)} is not done, so there is nothing to reopen.`);
    const filedOrDated = row.project_id || row.area_id || row.do_date || row.deadline || row.start_date;
    await this.apply([this.patch("tasks", id, { state: filedOrDated ? "active" : "inbox", completed_at: null })], `reopen ${quoted(title)}`);
    return { said: `Reopened ${quoted(title)}`, id, blocksReleased: 0 };
  }

  /** Drop it: out of every list, kept under the Logbook's Dropped, and reopen_task brings it back. */
  async drop(ref: string): Promise<Changed> {
    const row = await this.findTask(ref);
    const title = String(row.title ?? "");
    const id = String(row.id);
    const released = await this.releasedBlocks(id, null);
    await this.apply([this.patch("tasks", id, { state: "dropped" }), ...released.map((b) => this.del("time_blocks", b))], `drop ${quoted(title)}`);
    return { said: `Dropped ${quoted(title)} (it stays in the Logbook under Dropped; reopen_task brings it back)`, id, blocksReleased: released.length };
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
      return { said: words === "someday" ? `Moved ${quoted(title)} to Someday` : `Took the day off ${quoted(title)} (it waits in Upcoming's Not yet planned)`, id, blocksReleased: released.length };
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
    const time = typed.time ? ` ${typed.time.toString({ smallestUnit: "minute" })}` : typed.evening ? ", evening" : "";
    return { said: `Moved ${quoted(title)} to ${dayWords(typed.date, c.today)}${time}${once}`, id, blocksReleased: released.length };
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
        const projects = (await this.store.projects()).filter((p) => p.state !== "done" && p.state !== "archived" && p.state !== "dropped");
        const project = this.findProject(name, projects);
        patch.project_id = project.id;
        patch.area_id = null;
        if (row.project_id !== project.id) patch.heading_id = null;
        said.push(`in ${String(project.name)}`);
      }
    }
    // A project, a deadline or a start date takes a task out of the Inbox (PRODUCT_SPEC.md §5.1 rule 5).
    if (row.state === "inbox" && (patch.project_id || patch.deadline)) patch.state = "active";
    const ops: WireOp[] = Object.keys(patch).length ? [this.patch("tasks", id, patch)] : [];
    if (input.addTags?.length || input.removeTags?.length) {
      const tagOps = await this.retag("task_tags", "task_id", id, String(row.space_id), input.addTags ?? [], input.removeTags ?? []);
      ops.push(...tagOps.ops);
      said.push(...tagOps.said);
    }
    if (ops.length === 0) throw new Refusal("Nothing to change: give at least one field.");
    await this.apply(ops, `change ${quoted(title)}`);
    return { said: `Changed ${quoted(title)}: ${said.join(", ")}`, id, blocksReleased: 0 };
  }

  // ---------------------------------------------------------------- finding things

  /** A task by id, or by its title (exactly, else the one title that contains the words). */
  private async findTask(ref: string, opts: { anyState?: boolean } = {}): Promise<Row> {
    const want = ref.trim();
    if (!want) throw new Refusal("Say which task: its id or its title.");
    if (UUID.test(want)) {
      const row = await this.store.task(want);
      if (!row) throw new Refusal(`No task has the id ${want}.`);
      if (!opts.anyState && !OPEN.includes(row.state as TaskState)) throw new Refusal(`${quoted(String(row.title))} is ${row.state}; reopen_task brings it back first.`);
      return row;
    }
    const states: TaskState[] = opts.anyState ? ["inbox", "active", "someday", "done", "dropped"] : [...OPEN];
    const rows = (await this.store.tasks({ states, text: want, limit: 50 })).filter((r) => fold(String(r.title ?? "")).includes(fold(want)));
    const exact = rows.filter((r) => fold(String(r.title ?? "")) === fold(want));
    const pool = exact.length ? exact : rows;
    // An open task wins over a finished one of the same title.
    const open = pool.filter((r) => OPEN.includes(r.state as TaskState));
    const candidates = open.length ? open : pool;
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) throw new Refusal(`No ${opts.anyState ? "" : "open "}task matches ${quoted(want)}. Search with search, or give its id.`);
    const list = candidates
      .slice(0, 6)
      .map((r) => `${quoted(String(r.title))} (${r.state}${r.do_date ? `, ${r.do_date}` : ""}, id ${r.id})`)
      .join("; ");
    throw new Refusal(`${candidates.length} tasks match ${quoted(want)}: ${list}. Say which by its id.`);
  }

  private findProject(name: string, projects: readonly Row[]): Row {
    if (UUID.test(name.trim())) {
      const p = projects.find((x) => x.id === name.trim());
      if (p) return p;
    }
    const exact = projects.filter((p) => fold(String(p.name ?? "")) === fold(name));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Refusal(`${exact.length} projects are called ${quoted(name)}: give the project's id (list_projects shows them).`);
    const within = projects.filter((p) => fold(String(p.name ?? "")).includes(fold(name)));
    if (within.length === 1) return within[0];
    throw new Refusal(within.length ? `${quoted(name)} fits ${within.length} projects: ${within.map((p) => quoted(String(p.name))).join(", ")}.` : `No project is called ${quoted(name)}. Add one with add_task and #+${name.replace(/\s+/g, "")} or in Sparehour.`);
  }

  /** A day as the task detail's Do field reads words, else an ISO date. */
  private readDay(when: string, c: Ctx): { date: LocalDate; time: LocalTime | null; evening: boolean } {
    const words = when.trim();
    if (ISO_DAY.test(words)) {
      try {
        return { date: localDate(words), time: null, evening: false };
      } catch {
        throw new Refusal(`${quoted(words)} is not a real date.`);
      }
    }
    const typed = readTypedDate(words, c.parse);
    if (!typed) throw new Refusal(`Couldn't read ${quoted(words)} as a day. Try "tomorrow", "fri", "fri 3pm", "next week", "in 3 days" or 2026-11-02.`);
    return typed;
  }

  // ---------------------------------------------------------------- write helpers

  private op(op: WireOp["op"], table: string, id: string, data?: Record<string, unknown>): WireOp {
    return { client_id: `${Date.now().toString(36)}-${++this.opSeq}-${this.newId()}`, op, table, id, ...(data ? { data } : {}) };
  }

  private put(table: string, id: string, data: Record<string, unknown>): WireOp {
    return this.op("PUT", table, id, data);
  }

  private patch(table: string, id: string, data: Record<string, unknown>): WireOp {
    return this.op("PATCH", table, id, data);
  }

  private del(table: string, id: string): WireOp {
    return this.op("DELETE", table, id);
  }

  /** Sends the ops as the person, through the same sanitising the sync upload does; any refused op refuses the whole. */
  private async apply(ops: readonly WireOp[], what: string): Promise<void> {
    const clean = ops.map(sanitize).filter((o): o is WireOp => o !== null);
    if (clean.length === 0) return;
    const result = await this.store.apply(this.opts.device, clean);
    if (result.rejected.length === 0) return;
    const codes = [...new Set(result.rejected.map((r) => r.code))];
    if (codes.includes("42501")) throw new Refusal(`Sparehour refused to ${what}: this connection may not change that (it may be read only, or the row is not yours).`);
    throw new Refusal(`Sparehour refused to ${what} (database code ${codes.join(", ")}).${result.applied.length ? " Some of it was saved; check the app." : ""}`);
  }

  /** Links to the named tags, made if they are new (create-if-missing, case-insensitive); `pending` holds tags made earlier in the same batch. */
  private async tagLinks(table: "task_tags", column: "task_id", ownerId: string, spaceId: string, names: readonly string[], pending: readonly WireOp[] = []): Promise<{ ops: WireOp[]; newTags: string[] }> {
    const clean = [...new Map(names.map((n) => n.trim().replace(/^[@#]/, "")).filter(Boolean).map((n) => [fold(n), n])).values()];
    if (clean.length === 0) return { ops: [], newTags: [] };
    const known = (await this.store.tags()).map((t) => ({ id: String(t.id), name: String(t.name ?? "") }));
    for (const p of pending) if (p.table === "tags" && p.data) known.push({ id: p.id, name: String(p.data.name) });
    const ops: WireOp[] = [];
    const newTags: string[] = [];
    for (const name of clean) {
      let tag = resolveTag(name, known);
      if (!tag) {
        tag = { id: this.newId(), name };
        known.push(tag);
        newTags.push(name);
        ops.push(this.put("tags", tag.id, { space_id: spaceId, name }));
      }
      ops.push(this.put(table, this.newId(), { space_id: spaceId, [column]: ownerId, tag_id: tag.id }));
    }
    return { ops, newTags };
  }

  private async retag(table: "task_tags", column: "task_id", ownerId: string, spaceId: string, add: readonly string[], remove: readonly string[]): Promise<{ ops: WireOp[]; said: string[] }> {
    const current = (await this.store.taskTags([ownerId])).map((t) => ({ name: t.name, linkId: t.link_id }));
    const has = new Set(current.map((t) => fold(t.name)));
    const ops: WireOp[] = [];
    const said: string[] = [];
    const adding = add.map((n) => n.trim().replace(/^[@#]/, "")).filter((n) => n && !has.has(fold(n)));
    if (adding.length) {
      ops.push(...(await this.tagLinks(table, column, ownerId, spaceId, adding)).ops);
      said.push(`tagged ${adding.map((n) => `@${n}`).join(" ")}`);
    }
    const dropping = remove.map((n) => fold(n.replace(/^[@#]/, ""))).filter(Boolean);
    const gone = current.filter((t) => dropping.includes(fold(t.name)));
    if (gone.length) {
      for (const t of gone) ops.push(this.del(table, t.linkId));
      said.push(`untagged ${gone.map((t) => `@${t.name}`).join(" ")}`);
    }
    return { ops, said };
  }

  /** Blocks a task gives up when it leaves a day (task-repo.ts releaseBlocks): not started, not locked, not on `keepOn`. */
  private async releasedBlocks(taskId: string, keepOn: LocalDate | null): Promise<string[]> {
    const c = await this.ctx();
    const blocks = await this.store.blocksOf(taskId);
    return blocks
      .filter((b) => {
        if (b.locked === 1 || typeof b.start_at !== "string") return false;
        const start = Temporal.Instant.from(normaliseTimestamp(b.start_at));
        if (Temporal.Instant.compare(start, c.now) <= 0) return false;
        return !keepOn || !start.toZonedDateTimeISO(c.zone).toPlainDate().equals(keepOn);
      })
      .map((b) => String(b.id));
  }

  /** The task as written, for the answer when the read-back has not caught up. */
  private syntheticRow(id: string, spaceId: string, row: object): Record<string, unknown> {
    return { id, space_id: spaceId, ...row, evening: (row as { evening: boolean }).evening ? 1 : 0, carry_count: 0 };
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

function exceptionRow(e: Row) {
  return { occurrence_date: String(e.occurrence_date), kind: String(e.kind), moved_to: str(e.moved_to) };
}

/**
 * The greatest key, compared as the app's SQLite compares text (code units). Postgres here sorts text by en_US
 * collation, where "a0" < "Zz", so the store returns keys and the last one is picked here, never by ORDER BY.
 */
export function lastKey(keys: readonly (string | null | undefined)[]): string | null {
  let last: string | null = null;
  for (const k of keys) if (k && (last === null || k > last)) last = k;
  return last;
}

/** "today", "tomorrow", else "Mon 26 Oct". */
export function dayWords(day: LocalDate, today: LocalDate): string {
  const days = day.since(today, { largestUnit: "days" }).days;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day.dayOfWeek - 1]} ${day.day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][day.month - 1]}${day.year !== today.year ? ` ${day.year}` : ""}`;
}

/** Minutes from a number or "45m", "1h", "1h30", "1.5h", "90"; null clears; undefined when unreadable. */
export function estimateMinutes(v: number | string | null): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 1 && v <= 1440 ? Math.round(v) : undefined;
  const t = v.trim().toLowerCase().replace(/\s+/g, "");
  if (t === "" || t === "none") return null;
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m?)?$/.exec(t);
  if (!m || (!m[1] && !m[2])) return undefined;
  const min = Math.round((m[1] ? Number(m[1]) * 60 : 0) + (m[2] ? Number(m[2]) : 0));
  return min >= 1 && min <= 1440 ? min : undefined;
}
