// Time blocks and single days over MCP (DECISIONS.md, amendment 2026-11-22): a day as the app's timeline has it,
// and a block made, moved, renamed, locked or taken away, by the rules of data/repositories/block-repo.ts. Removing a
// block never touches its task.
import { blockLength, chooseSlot, lateSlot } from "@/core/blocking";
import type { Capacity } from "@/core/capacity";
import { heldReminder, heldWords } from "@/core/notifications/quiet-hours";
import { Temporal, compareDates, dayInstants, formatMinutes, minutesOfDay, type LocalDate } from "@/core/time";
import { normaliseTimestamp } from "@/data/mappers";
import { isoAt } from "@/features/planning/plan-input";
import { minuteOnDay } from "@/features/today/day-minute";
import type { WireOp } from "@/server/sync/upload";
import { Refusal, UUID, byCodeUnit, dayWords, estimateMinutes, fold, quoted, str, type Changed, type Ctx, type Meeting, type PlannerCore, type TaskView } from "./core";
import type { Row } from "./store";

export interface DayView {
  day: LocalDate;
  today: LocalDate;
  capacity: Capacity | null;
  meetings: Meeting[];
  blocks: Meeting[];
  tasks: TaskView[];
  done: { title: string; at: string }[];
}

export interface LogView {
  days: { day: LocalDate; done: string[] }[];
  today: LocalDate;
}

export interface BlockInput {
  task?: string;
  title?: string;
  day?: string;
  start?: string;
  end?: string;
  minutes?: number | string;
  locked?: boolean;
}

export interface BlockPatch {
  day?: string;
  start?: string;
  end?: string;
  minutes?: number | string;
  title?: string | null;
  locked?: boolean;
}

/** "15:00" as minutes of the day; "24:00" ends it. */
const minuteOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export class Blocks {
  constructor(private readonly p: PlannerCore) {}

  /** Any day: its tasks, meetings, blocks and spare time, and what was finished on it. */
  async day(when: string): Promise<DayView> {
    const c = await this.p.ctx();
    const day = this.p.readDay(when, c).date;
    const iso = day.toString();
    const rows = (await this.p.store.tasks({ states: ["inbox", "active"], doDateLte: iso })).filter((r) => r.do_date === iso);
    const [figures] = await this.p.days([day], rows);
    const tasks = (await this.p.views(rows)).sort((a, b) => byCodeUnit(a.daySortKey ?? "", b.daySortKey ?? "") || byCodeUnit(a.sortKey, b.sortKey));
    const [log] = compareDates(day, c.today) > 0 ? [] : await this.finished(day, day, c);
    return { day, today: c.today, ...figures, tasks, done: (log?.done ?? []).map((d) => ({ title: d.title, at: d.at })) };
  }

  /** What was finished over the last days, newest day first. */
  async log(days: number): Promise<LogView> {
    const c = await this.p.ctx();
    const n = Math.max(1, Math.min(31, Math.round(days)));
    const found = await this.finished(c.today.subtract({ days: n - 1 }), c.today, c);
    return { today: c.today, days: found.filter((d) => d.done.length).map((d) => ({ day: d.day, done: d.done.map((x) => x.title) })) };
  }

  private async finished(from: LocalDate, to: LocalDate, c: Ctx): Promise<{ day: LocalDate; done: { title: string; at: string }[] }[]> {
    const settings = { timezone: c.zone, dayRolloverHour: c.settings.dayRolloverHour };
    const start = dayInstants(from, settings)[0];
    const end = dayInstants(to, settings)[1];
    const rows = await this.p.store.done(start.toString(), end.toString());
    const ids = [...new Set(rows.completions.map((r) => String(r.task_id)))];
    const titles = new Map(ids.length ? (await this.p.store.tasks({ states: ["inbox", "active", "someday", "done", "dropped", "archived"], ids })).map((t) => [String(t.id), str(t.title)]) : []);
    const all = [
      ...rows.tasks.map((r) => ({ title: str(r.title), at: r.completed_at })),
      ...rows.completions.map((r) => ({ title: titles.get(String(r.task_id)) ?? null, at: r.completed_at })),
      ...rows.older.map((r) => ({ title: str(r.title), at: r.completed_at })),
    ].filter((r): r is { title: string; at: string } => r.title !== null && typeof r.at === "string");
    const out: { day: LocalDate; done: { title: string; at: string }[] }[] = [];
    for (let day = to; compareDates(day, from) >= 0; day = day.subtract({ days: 1 })) {
      const [a, b] = dayInstants(day, settings);
      const on = all
        .map((r) => ({ title: r.title, moment: Temporal.Instant.from(normaliseTimestamp(r.at)) }))
        .filter((r) => Temporal.Instant.compare(r.moment, a) >= 0 && Temporal.Instant.compare(r.moment, b) < 0)
        .sort((x, y) => Temporal.Instant.compare(x.moment, y.moment));
      out.push({ day, done: on.map((r) => ({ title: r.title, at: this.p.clock(r.moment, c) })) });
    }
    return out;
  }

  /** What a stretch of a day would sit on top of, in words, the block itself left out. */
  private async clash(day: LocalDate, start: number, end: number, except: string | null): Promise<string> {
    const [f] = await this.p.days([day], []);
    const over = [...f.meetings, ...f.blocks].filter((m) => m.id !== except && !m.closed && !m.title.endsWith("(declined)") && minuteOf(m.start) < end && minuteOf(m.end) > start);
    return over.length ? `. It overlaps ${over.slice(0, 3).map((m) => `${m.title} ${m.start}–${m.end}`).join(" and ")}` : "";
  }

  /** A line for the answer when quiet hours will hold this block's reminder back (REMINDERS_AND_AI_SPEC.md §2). */
  private quiet(day: LocalDate, start: number, c: Ctx): string {
    const at = Temporal.Instant.from(normaliseTimestamp(isoAt(day, start, c.zone)));
    if (Temporal.Instant.compare(at, c.now) <= 0) return "";
    const held = heldReminder(at, c.zone, c.reminders);
    return held ? `\n${heldWords(held)}` : "";
  }

  /** The length asked for: an end, some minutes, or what it was. */
  private length(startMin: number, input: { end?: string; minutes?: number | string }, was: number, c: Ctx): number {
    if (input.end !== undefined) {
      const end = input.end.trim() === "24:00" ? 24 * 60 : minutesOfDay(this.p.readTime(input.end, c));
      const until = end === 0 ? 24 * 60 : end;
      if (until <= startMin) throw new Refusal("A block has to end after it starts, on the same day.");
      return until - startMin;
    }
    if (input.minutes !== undefined) {
      const min = estimateMinutes(input.minutes);
      if (!min) throw new Refusal(`Couldn't read ${quoted(String(input.minutes))} as a length: use minutes, "45m" or "1h30".`);
      return Math.max(5, min);
    }
    return was;
  }

  /** Blocks time for a task, or a block of the person's own; with no start, the day's next free gap. */
  async add(input: BlockInput): Promise<Changed> {
    const c = await this.p.ctx();
    const task = input.task ? await this.p.findTask(input.task) : null;
    if (!task && !input.title?.trim()) throw new Refusal("Say what the block is for: a task, or a title for a block of its own.");
    const own = task?.do_date ? Temporal.PlainDate.from(String(task.do_date)) : null;
    const day = input.day ? this.p.readDay(input.day, c).date : own && compareDates(own, c.today) >= 0 ? own : c.today;
    if (compareDates(day, c.today) < 0) throw new Refusal("That day has passed.");
    const usual = blockLength(task && typeof task.estimate_min === "number" ? task.estimate_min : null, c.settings.defaultEstimateMin);
    const slot = input.start === undefined ? await this.free(day, this.length(0, { minutes: input.minutes }, usual, c), c) : null;
    const start = slot ? slot.start : minutesOfDay(this.p.readTime(input.start as string, c));
    const end = slot ? slot.end : Math.min(24 * 60, start + this.length(start, input, usual, c));
    const id = this.p.newId();
    const title = input.title?.trim() || str(task?.title);
    const ops: WireOp[] = [
      this.p.put("time_blocks", id, { space_id: str(task?.space_id) ?? c.spaceId, user_id: c.userId, task_id: task ? String(task.id) : null, title, start_at: isoAt(day, start, c.zone), end_at: isoAt(day, end, c.zone), locked: input.locked ?? false, source: "manual" }),
    ];
    // Blocked on another day, the task is for that day (block-repo.ts createOnTaskDay); a repeat moves by its own rules.
    let moved = "";
    if (task && own?.toString() !== day.toString()) {
      if (task.recurrence_rule) {
        if (own) throw new Refusal(`${quoted(String(task.title))} repeats and is on ${dayWords(own, c.today)}. Move that day with reschedule_task first, then block it.`);
      }
      ops.unshift(this.p.patch("tasks", String(task.id), { do_date: day.toString(), ...(task.state === "inbox" || task.state === "someday" ? { state: "active" } : {}) }));
      moved = `, and the task is on ${dayWords(day, c.today)} now`;
    }
    const over = await this.clash(day, start, end, null);
    await this.p.apply(ops, `block ${quoted(title ?? "time")}`);
    return { said: `Blocked ${quoted(title ?? "time")} on ${dayWords(day, c.today)} ${hm(start)}–${hm(end)}${moved} [block ${id}]${over}${this.quiet(day, start, c)}`, id, blocksChanged: 1 };
  }

  /** Where the app's B would put it: the next free gap that fits, else the widest one left, else after the working day. */
  private async free(day: LocalDate, length: number, c: Ctx): Promise<{ start: number; end: number }> {
    const iso = day.toString();
    const rows = (await this.p.store.tasks({ states: ["inbox", "active"], doDateLte: iso })).filter((r) => r.do_date === iso);
    const [f] = await this.p.days([day], rows);
    const now = day.equals(c.today) ? minuteOnDay(c.now, c.zone, day).minute : 0;
    if (now > 0 && lateSlot(now, length)) throw new Refusal("Today's hours are over. Say a time, or another day.");
    const windows = f.capacity?.windows ?? [];
    const dayStart = windows[0]?.start ?? 9 * 60;
    const dayEnd = windows[windows.length - 1]?.end ?? 18 * 60;
    return chooseSlot(f.capacity?.free ?? [], Math.max(now, dayStart), length, dayEnd);
  }

  private async find(ref: string): Promise<Row> {
    const want = ref.trim();
    if (UUID.test(want)) {
      const row = await this.p.store.block(want);
      if (row) return row;
    }
    const c = await this.p.ctx();
    const near = await this.p.store.blocks(c.today.subtract({ days: 1 }).toString(), c.today.add({ days: 31 }).toString());
    const named = UUID.test(want) ? near.filter((b) => b.task_id === want) : near.filter((b) => fold(String(b.title ?? "")) === fold(want));
    const ahead = named.filter((b) => typeof b.end_at === "string" && Temporal.Instant.compare(Temporal.Instant.from(normaliseTimestamp(b.end_at)), c.now) > 0);
    if (ahead.length === 1) return (await this.p.store.block(String(ahead[0].id))) ?? ahead[0];
    if (ahead.length === 0) throw new Refusal(`No block ahead matches ${quoted(want)}. get_today and get_day show each block's id.`);
    throw new Refusal(`${ahead.length} blocks match ${quoted(want)}: ${ahead.slice(0, 6).map((b) => this.where(b, c)).join("; ")}. Say which by its id.`);
  }

  private at(b: Row, c: Ctx): { day: LocalDate; start: number; end: number } {
    const s = Temporal.Instant.from(normaliseTimestamp(String(b.start_at))).toZonedDateTimeISO(c.zone);
    const e = Temporal.Instant.from(normaliseTimestamp(String(b.end_at))).toZonedDateTimeISO(c.zone);
    const day = s.toPlainDate();
    return { day, start: s.hour * 60 + s.minute, end: e.toPlainDate().equals(day) ? e.hour * 60 + e.minute : 24 * 60 };
  }

  private where(b: Row, c: Ctx): string {
    const t = this.at(b, c);
    return `${dayWords(t.day, c.today)} ${hm(t.start)}–${hm(t.end)} (id ${b.id})`;
  }

  /** Moves, resizes, renames or locks a block. A locked one is not moved until it is unlocked. */
  async change(ref: string, input: BlockPatch): Promise<Changed> {
    const c = await this.p.ctx();
    const block = await this.find(ref);
    const id = String(block.id);
    const was = this.at(block, c);
    const moves = input.day !== undefined || input.start !== undefined || input.end !== undefined || input.minutes !== undefined;
    if (moves && block.locked === 1 && input.locked !== false) throw new Refusal(`That block is locked at ${hm(was.start)}–${hm(was.end)}. Unlock it first (locked: false) if the person wants it moved.`);
    const name = quoted(str(block.title) ?? "Block");
    const patch: Record<string, unknown> = {};
    const said: string[] = [];
    const ops: WireOp[] = [];
    let over = "";
    if (moves) {
      const day = input.day !== undefined ? this.p.readDay(input.day, c).date : was.day;
      const start = input.start !== undefined ? minutesOfDay(this.p.readTime(input.start, c)) : was.start;
      const end = Math.min(24 * 60, start + this.length(start, input, was.end - was.start, c));
      patch.start_at = isoAt(day, start, c.zone);
      patch.end_at = isoAt(day, end, c.zone);
      said.push(`moved to ${dayWords(day, c.today)} ${hm(start)}–${hm(end)} (${formatMinutes(end - start)})`);
      over = `${await this.clash(day, start, end, id)}${this.quiet(day, start, c)}`;
    }
    if (input.title !== undefined) {
      patch.title = input.title?.trim() || null;
      said.push(patch.title ? `renamed to ${quoted(String(patch.title))}` : "name cleared");
    }
    if (input.locked !== undefined) {
      patch.locked = input.locked;
      said.push(input.locked ? "locked" : "unlocked");
    }
    if (said.length === 0) throw new Refusal("Nothing to change: give a day, a time, a length, a title or locked.");
    ops.push(this.p.patch("time_blocks", id, patch));
    await this.p.apply(ops, `change ${name}`);
    return { said: `Block ${name}: ${said.join(", ")}${over}`, id, blocksChanged: 1 };
  }

  async remove(ref: string): Promise<Changed> {
    const c = await this.p.ctx();
    const block = await this.find(ref);
    const t = this.at(block, c);
    await this.p.apply([this.p.del("time_blocks", String(block.id))], "remove the block");
    return { said: `Removed the block ${quoted(str(block.title) ?? "Block")} (${dayWords(t.day, c.today)} ${hm(t.start)}–${hm(t.end)})${block.task_id ? "; its task stays where it was" : ""}`, id: String(block.id), blocksChanged: 1 };
  }
}
