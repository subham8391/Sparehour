// What every part of the MCP planner stands on (DECISIONS.md, amendments 2026-10-23 and 2026-11-22): the person's
// settings and day, tasks read as the app reads them, the calendar around a day with its spare time, finding a task,
// project or area by id or name, and the writes sent through apply_mutations as the person. Planner (planner.ts) holds
// the task reads and writes; drafts.ts, blocks.ts, repeats.ts, places.ts and account.ts hold the rest of the app.
import { startOf, timedStep } from "@/core/blocking/timed";
import { capacityFor, type Capacity } from "@/core/capacity";
import type { ParseContext } from "@/core/quickadd";
import { readTypedDate } from "@/core/quickadd/read-date";
import { ruleWords } from "@/core/recurrence/words";
import { Temporal, localDate, todayFor, type Instant, type LocalDate, type LocalTime } from "@/core/time";
import { parseLength } from "@/core/time/parse-length";
import { parseTime } from "@/core/time/parse-time";
import type { RecurrenceMode, Task } from "@/core/types";
import { normaliseTimestamp, toCapacityBlock, toCapacityEvent, toCapacityTask, toSettings, toTask, toWorkWindow, type Settings } from "@/data/mappers";
import type { CalendarEventRow, TaskRow, TimeBlockRow, UserSettingsRow, WorkHoursRow } from "@/data/schema.client";
import { resolveTag } from "@/features/quickadd/interpret";
import { sanitize, type WireOp } from "@/server/sync/upload";
import type { PlannerStore, Row, TaskState } from "./store";

/** A request the planner will not carry out, with the reason in words for the person. */
export class Refusal extends Error {}

export const OPEN: readonly TaskState[] = ["inbox", "active", "someday"];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const byCodeUnit = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
export const fold = (s: string) => s.trim().toLocaleLowerCase();
export const str = (v: string | number | null | undefined): string | null => (v == null ? null : String(v));
export const quoted = (s: string) => `“${s}”`;

export interface TaskView extends Task {
  project: string | null;
  area: string | null;
  tagNames: string[];
  repeats: string | null;
}

/** Something at a time on a day: a meeting, or a time block (which has an id to act on). */
export interface Meeting {
  start: string;
  end: string;
  title: string;
  id?: string;
  taskId?: string | null;
  locked?: boolean;
}

export interface Changed {
  /** What happened, in words: "Completed “Gym” · next Mon 26 Oct". */
  said: string;
  id: string;
  /** Blocks this change made, moved or took away, so the caller can push the calendar now rather than at the tick. */
  blocksChanged: number;
}

export interface Ctx {
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

export class PlannerCore {
  ctxP: Promise<Ctx> | null = null;
  opSeq = 0;
  readonly now: () => Instant;
  readonly newId: () => string;

  constructor(
    readonly store: PlannerStore,
    readonly opts: PlannerOptions,
  ) {
    this.now = opts.now ?? (() => Temporal.Now.instant());
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  // ---------------------------------------------------------------- context

  ctx(): Promise<Ctx> {
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

  async views(rows: readonly Row[]): Promise<TaskView[]> {
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

  /**
   * The calendar between two ISO days, read once: the working hours, the meetings, and the blocks as capacity counts
   * them, with the raw rows for the lines the answers draw.
   */
  async around(from: string, to: string, taskRows: readonly Row[]) {
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
  async days(days: readonly LocalDate[], taskRows: readonly Row[]): Promise<{ capacity: Capacity | null; meetings: Meeting[]; blocks: Meeting[] }[]> {
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
        if (at) blockLines.push({ ...at, id: String(b.id), taskId: str(b.task_id), locked: b.locked === 1, title: str(b.title) ?? (b.task_id ? (titleOf.get(String(b.task_id)) ?? "A task") : "Block") });
      }
      const byStart = (a: Meeting, b: Meeting) => a.start.localeCompare(b.start);
      return { capacity, meetings: meetings.sort(byStart), blocks: blockLines.sort(byStart) };
    });
  }

  // ---------------------------------------------------------------- finding things

  /** A task by id, or by its title (exactly, else the one title that contains the words). */
  async findTask(ref: string, opts: { anyState?: boolean } = {}): Promise<Row> {
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

  findProject(name: string, projects: readonly Row[]): Row {
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

  /** The projects a task can be filed in: active and parked ones. */
  async openProjects(): Promise<Row[]> {
    return (await this.store.projects()).filter((p) => p.state !== "done" && p.state !== "archived" && p.state !== "dropped");
  }

  async findArea(name: string): Promise<Row> {
    const areas = await this.store.areas();
    const byId = areas.find((a) => a.id === name.trim());
    if (byId) return byId;
    const exact = areas.filter((a) => fold(String(a.name ?? "")) === fold(name));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Refusal(`${exact.length} areas are called ${quoted(name)}: give the area's id (list_projects shows them).`);
    throw new Refusal(`No area is called ${quoted(name)}.${areas.length ? ` There ${areas.length === 1 ? "is" : "are"}: ${areas.map((a) => quoted(String(a.name))).join(", ")}.` : ""} add_area makes a new one.`);
  }

  /** "15:00", "930" or "3pm" as a time of day. */
  readTime(text: string, c: Ctx): LocalTime {
    const plain = parseTime(text);
    if (plain) return Temporal.PlainTime.from(plain);
    const typed = readTypedDate(`today ${text.trim()}`, c.parse)?.time ?? null;
    if (!typed) throw new Refusal(`Couldn't read ${quoted(text)} as a time. Try "15:00" or "3pm".`);
    return typed;
  }

  /** A day as the task detail's Do field reads words, else an ISO date. */
  readDay(when: string, c: Ctx): { date: LocalDate; time: LocalTime | null; evening: boolean } {
    const words = when.trim();
    if (ISO_DAY.test(words)) {
      try {
        return { date: localDate(words), time: null, evening: false };
      } catch {
        throw new Refusal(`${quoted(words)} is not a real date.`);
      }
    }
    // "2026-11-02 15:00", as an assistant writes a day and a time.
    const iso = /^(\d{4}-\d{2}-\d{2})(?:T|,?\s+(?:at\s+)?)(\S.*)$/.exec(words);
    if (iso) {
      const day = this.readDay(iso[1], c).date;
      const evening = /^(?:in the |this )?evening$/i.test(iso[2]);
      const time = evening ? null : this.readTime(iso[2].replace(/^(\d{1,2}:\d{2}):\d{2}$/, "$1"), c);
      return { date: day, time, evening: evening || (time !== null && Temporal.PlainTime.compare(time, c.settings.eveningStartsAt) >= 0) };
    }
    if (/^yesterday$/i.test(words)) return { date: c.today.subtract({ days: 1 }), time: null, evening: false };
    // "Mon 26 Oct", as these answers write a day, is read by its date; "this evening" and "at" are said, not parsed.
    const plain = words
      .replace(/^(?:on\s+)?(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+(?=\d{1,2}(?:st|nd|rd|th)?\s+[a-z]|[a-z]{3,9}\s+\d{1,2}\b)/i, "")
      .replace(/^on\s+/i, "")
      .replace(/,?\s+at\s+/i, " ");
    const typed = readTypedDate(plain, c.parse);
    const vague = /\b(morning|afternoon|noon|lunchtime)\b/i.exec(plain)?.[1];
    if (!typed && vague) throw new Refusal(`Couldn't read ${quoted(words)}: “${vague.toLowerCase()}” is not a time. Ask the person what time, or give the day alone.`);
    if (!typed) throw new Refusal(`Couldn't read ${quoted(words)} as a day. Try "tomorrow", "fri", "fri 3pm", "next week", "in 3 days" or 2026-11-02.`);
    return typed;
  }

  // ---------------------------------------------------------------- write helpers

  op(op: WireOp["op"], table: string, id: string, data?: Record<string, unknown>): WireOp {
    return { client_id: `${Date.now().toString(36)}-${++this.opSeq}-${this.newId()}`, op, table, id, ...(data ? { data } : {}) };
  }

  put(table: string, id: string, data: Record<string, unknown>): WireOp {
    return this.op("PUT", table, id, data);
  }

  patch(table: string, id: string, data: Record<string, unknown>): WireOp {
    return this.op("PATCH", table, id, data);
  }

  del(table: string, id: string): WireOp {
    return this.op("DELETE", table, id);
  }

  /** Sends the ops as the person, through the same sanitising the sync upload does; any refused op refuses the whole. */
  async apply(ops: readonly WireOp[], what: string): Promise<void> {
    const clean = ops.map(sanitize).filter((o): o is WireOp => o !== null);
    if (clean.length === 0) return;
    const result = await this.store.apply(this.opts.device, clean);
    if (result.rejected.length === 0) return;
    const codes = [...new Set(result.rejected.map((r) => r.code))];
    if (codes.includes("42501")) throw new Refusal(`Sparehour refused to ${what}: this connection may not change that (it may be read only, or the row is not yours).`);
    throw new Refusal(`Sparehour refused to ${what} (database code ${codes.join(", ")}).${result.applied.length ? " Some of it was saved; check the app." : ""}`);
  }

  /** Links to the named tags, made if they are new (create-if-missing, case-insensitive); `pending` holds tags made earlier in the same batch. */
  async tagLinks(table: "task_tags", column: "task_id", ownerId: string, spaceId: string, names: readonly string[], pending: readonly WireOp[] = []): Promise<{ ops: WireOp[]; newTags: string[] }> {
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

  async retag(table: "task_tags", column: "task_id", ownerId: string, spaceId: string, add: readonly string[], remove: readonly string[]): Promise<{ ops: WireOp[]; said: string[] }> {
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
  async releasedBlocks(taskId: string, keepOn: LocalDate | null): Promise<string[]> {
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

  /**
   * Brings a task's time block in step with its day and time, as the app does after a write (timed-block.ts): made
   * for a new time, moved with it, removed when the time is taken off. It comes after the task's own write, and a
   * failure here never fails the task. `was` is the task's row before the write, null when it is new.
   */
  async keepTime(id: string, was: Row | null): Promise<{ words: string; changed: number }> {
    const nothing = { words: "", changed: 0 };
    try {
      const c = await this.ctx();
      const [row, held] = await Promise.all([this.store.task(id), this.store.blocksOf(id)]);
      if (!row) return nothing;
      const at = (v: string | number | null) => (typeof v === "string" ? Temporal.Instant.from(normaliseTimestamp(v)) : null);
      const open = row.state === "active" || row.state === "inbox";
      const step = timedStep({
        start: open ? startOf(str(row.do_date), str(row.do_time), c.zone) : null,
        oldStart: was ? startOf(str(was.do_date), str(was.do_time), c.zone) : null,
        estimateMin: typeof row.estimate_min === "number" ? row.estimate_min : null,
        defaultEstimateMin: c.settings.defaultEstimateMin,
        blocks: held.map((b) => ({ id: String(b.id), start: at(b.start_at), end: at(b.end_at), locked: b.locked === 1 })),
        zone: c.zone,
        now: c.now,
      });
      if (step.kind === "none") return nothing;
      const title = quoted(String(row.title ?? ""));
      if (step.kind === "remove") {
        await this.apply([this.del("time_blocks", step.id)], `unblock ${title}`);
        return { words: " · its time block is gone", changed: 1 };
      }
      const times = { start_at: step.start.toString(), end_at: step.end.toString() };
      const op =
        step.kind === "move"
          ? this.patch("time_blocks", step.id, times)
          : this.put("time_blocks", this.newId(), { space_id: str(row.space_id), user_id: c.userId, task_id: id, title: str(row.title), ...times, locked: false, source: "manual" });
      await this.apply([op], `block ${title}`);
      return { words: ` · blocked ${this.clock(step.start, c)}–${this.clock(step.end, c)}`, changed: 1 };
    } catch (e) {
      console.error("mcp timed block failed", e);
      return nothing;
    }
  }

  /** "15:00" on the person's clock. */
  clock(at: Instant, c: Ctx): string {
    return at.toZonedDateTimeISO(c.zone).toPlainTime().toString({ smallestUnit: "minute" });
  }

  /** The task as written, for the answer when the read-back has not caught up. */
  syntheticRow(id: string, spaceId: string, row: object): Record<string, unknown> {
    return { id, space_id: spaceId, ...row, evening: (row as { evening: boolean }).evening ? 1 : 0, carry_count: 0 };
  }
}

export function exceptionRow(e: Row) {
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

/** Minutes from a number or "45m", "1h", "1h30", "1.5h", "2:30", "90 min"; null clears; undefined when unreadable. */
export function estimateMinutes(v: number | string | null): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 1 && v <= 1440 ? Math.round(v) : undefined;
  const t = v.trim().toLowerCase();
  if (t === "" || t === "none") return null;
  return parseLength(t) ?? undefined;
}
