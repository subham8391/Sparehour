// The person's planning settings, and closing the day, over MCP (DECISIONS.md, amendment 2026-11-22): the same rows
// Settings and the shutdown write, inside the same bounds. The account itself, its look, its calendars and its
// connected apps stay in the app.
import { BUFFER, PLANNING_NUMBERS } from "@/features/settings/section-words";
import { MAX_SEGMENTS, WEEKDAYS, mergeSegments, segmentsError, segmentsLabel, type Segment } from "@/features/settings/settings-rules";
import type { WireOp } from "@/server/sync/upload";
import { Refusal, dayWords, quoted, str, type Changed, type PlannerCore } from "./core";
import type { Row } from "./store";

export interface SettingsView {
  zone: string;
  hours: { day: string; label: string }[];
  bufferPct: number;
  defaultEstimateMin: number;
  evening: string;
  rolloverHour: number;
  ifMissed: string;
  carryAskAfter: number | null;
  autoSomedayDays: number | null;
  reminders: string;
  morning: string | null;
  shutdown: string | null;
}

export interface SettingsInput {
  work_hours?: { days: string[]; hours: string[] }[];
  buffer_percent?: number;
  default_estimate_minutes?: number;
  evening_starts_at?: string;
  evening_ends_at?: string;
  if_missed?: "carry" | "skip" | "expire";
  ask_after_carries?: number;
  someday_after_days?: number;
  morning_review?: boolean;
  remind_block_start?: boolean;
  remind_minutes_before?: number;
  remind_deadlines?: boolean;
  morning_message?: boolean;
  morning_message_at?: string | null;
  shutdown_reminder?: boolean;
  shutdown_reminder_at?: string | null;
}

const time = (v: string | number | null | undefined): string | null => (typeof v === "string" ? v.slice(0, 5) : null);
const num = (v: string | number | null | undefined): number | null => (typeof v === "number" ? v : null);
const DAYS: Record<string, readonly number[]> = { weekdays: [0, 1, 2, 3, 4], weekend: [5, 6], weekends: [5, 6], "every day": [0, 1, 2, 3, 4, 5, 6], everyday: [0, 1, 2, 3, 4, 5, 6], all: [0, 1, 2, 3, 4, 5, 6] };

export class Account {
  constructor(private readonly p: PlannerCore) {}

  async settings(): Promise<SettingsView> {
    const [profile, rows, c] = await Promise.all([this.p.store.profile(), this.p.store.workHours(), this.p.ctx()]);
    const s = profile.settings ?? ({} as Row);
    const on = (key: string) => s[key] !== 0;
    const reminders = [on("notify_block_start") ? `before a block (${num(s.block_start_lead_min) ?? 5}m)` : null, on("notify_deadline") ? "deadlines" : null].filter(Boolean);
    return {
      zone: c.zone,
      hours: WEEKDAYS.map((day, i) => ({ day, label: segmentsLabel(this.segments(rows, i)) || "off" })),
      bufferPct: c.settings.bufferPct,
      defaultEstimateMin: c.settings.defaultEstimateMin,
      evening: `${time(s.evening_starts_at) ?? "18:00"} to ${time(s.evening_ends_at) ?? "22:00"}`,
      rolloverHour: c.settings.dayRolloverHour,
      ifMissed: c.defaultMissPolicy ?? "carry",
      carryAskAfter: num(s.carry_ask_after),
      autoSomedayDays: num(s.auto_someday_days),
      reminders: reminders.length ? reminders.join(", ") : "off",
      morning: on("notify_morning") ? (time(s.morning_nudge_time) ?? "at the start of the working day") : null,
      shutdown: on("notify_shutdown") ? (time(s.shutdown_nudge_time) ?? "at the end of the working day") : null,
    };
  }

  private segments(rows: readonly Row[], weekday: number): Segment[] {
    return rows
      .filter((r) => r.weekday === weekday)
      .map((r) => ({ start: time(r.start_time) ?? "", end: time(r.end_time) ?? "" }))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  private weekdays(names: readonly string[]): number[] {
    const out = new Set<number>();
    for (const name of names) {
      const key = name.trim().toLowerCase();
      const group = DAYS[key];
      if (group) group.forEach((d) => out.add(d));
      else {
        const d = key.length >= 3 ? WEEKDAYS.findIndex((w) => w.toLowerCase().startsWith(key)) : -1;
        if (d === -1) throw new Refusal(`${quoted(name)} is not a day of the week. Use Monday to Sunday, "weekdays" or "weekend".`);
        out.add(d);
      }
    }
    return [...out].sort((a, b) => a - b);
  }

  async update(input: SettingsInput): Promise<Changed> {
    const c = await this.p.ctx();
    const profile = await this.p.store.profile();
    const id = str(profile.settings?.id ?? null);
    if (!id) throw new Refusal("The account has no settings yet: open Sparehour once first.");
    const patch: Record<string, unknown> = {};
    const said: string[] = [];
    const bounded = (value: number, b: { min: number; max: number }, what: string) => {
      const v = Math.round(value);
      if (v < b.min || v > b.max) throw new Refusal(`${what} is between ${b.min} and ${b.max}.`);
      return v;
    };
    const clock = (text: string) => this.p.readTime(text, c).toString({ smallestUnit: "minute" });
    if (input.buffer_percent !== undefined) {
      patch.buffer_pct = bounded(input.buffer_percent, BUFFER, "The buffer, in per cent,");
      said.push(`buffer ${patch.buffer_pct}%`);
    }
    if (input.default_estimate_minutes !== undefined) {
      patch.default_estimate_min = bounded(input.default_estimate_minutes, PLANNING_NUMBERS.defaultEstimateMin, "The default estimate, in minutes,");
      said.push(`default estimate ${patch.default_estimate_min}m`);
    }
    if (input.ask_after_carries !== undefined) {
      patch.carry_ask_after = bounded(input.ask_after_carries, PLANNING_NUMBERS.carryAskAfter, "That number of carries");
      said.push(`asks "Still want this?" after ${patch.carry_ask_after} carries`);
    }
    if (input.someday_after_days !== undefined) {
      patch.auto_someday_days = bounded(input.someday_after_days, PLANNING_NUMBERS.autoSomedayDays, "That number of days");
      said.push(`untouched tasks go to Someday after ${patch.auto_someday_days} days`);
    }
    if (input.evening_starts_at !== undefined) {
      patch.evening_starts_at = clock(input.evening_starts_at);
      said.push(`evening from ${patch.evening_starts_at}`);
    }
    if (input.evening_ends_at !== undefined) {
      patch.evening_ends_at = clock(input.evening_ends_at);
      said.push(`evening until ${patch.evening_ends_at}`);
    }
    if (input.if_missed !== undefined) {
      patch.default_miss_policy = input.if_missed;
      said.push(`a new task that misses its day: ${input.if_missed}`);
    }
    const flag = (value: boolean | undefined, column: string, words: string) => {
      if (value === undefined) return;
      patch[column] = value;
      said.push(`${words} ${value ? "on" : "off"}`);
    };
    flag(input.morning_review, "carry_review", "morning review");
    flag(input.remind_block_start, "notify_block_start", "block reminders");
    flag(input.remind_deadlines, "notify_deadline", "deadline reminders");
    flag(input.morning_message, "notify_morning", "morning message");
    flag(input.shutdown_reminder, "notify_shutdown", "shutdown reminder");
    if (input.remind_minutes_before !== undefined) {
      if (![0, 5, 10, 15].includes(input.remind_minutes_before)) throw new Refusal("A block's reminder comes 0, 5, 10 or 15 minutes before it.");
      patch.block_start_lead_min = input.remind_minutes_before;
      said.push(`reminders ${input.remind_minutes_before}m before a block`);
    }
    for (const [value, column, words] of [
      [input.morning_message_at, "morning_nudge_time", "morning message"],
      [input.shutdown_reminder_at, "shutdown_nudge_time", "shutdown reminder"],
    ] as const) {
      if (value === undefined) continue;
      patch[column] = value === null ? null : clock(value);
      said.push(`${words} ${value === null ? "back to its usual time" : `at ${patch[column]}`}`);
    }

    const ops: WireOp[] = Object.keys(patch).length ? [this.p.patch("user_settings", id, patch)] : [];
    if (input.work_hours?.length) {
      const rows = await this.p.store.workHours();
      const done = new Set<number>();
      for (const entry of input.work_hours) {
        const wanted = mergeSegments(this.readHours(entry.hours, c));
        const days = this.weekdays(entry.days);
        for (const day of days) {
          if (done.has(day)) throw new Refusal(`${WEEKDAYS[day]} is given twice.`);
          done.add(day);
          ops.push(...this.dayOps(rows, day, wanted, c));
        }
        said.push(`${days.map((d) => WEEKDAYS[d].slice(0, 3)).join(", ")}: ${segmentsLabel(wanted) || "off"}`);
      }
    }
    if (ops.length === 0) throw new Refusal("Nothing to change: give at least one setting.");
    await this.p.apply(ops, "change the settings");
    return { said: `Settings changed: ${said.join(", ")}`, id, blocksChanged: 0 };
  }

  private readHours(hours: readonly string[], c: Awaited<ReturnType<PlannerCore["ctx"]>>): Segment[] {
    const segments = hours.filter((h) => !/^(off|none)$/i.test(h.trim())).map((h) => {
      const [from, to, ...rest] = h.split(/\s*(?:-|–|to)\s*/i);
      if (!from || !to || rest.length) throw new Refusal(`Couldn't read ${quoted(h)} as working hours. Use "09:00-17:30", or "off".`);
      const at = (t: string) => this.p.readTime(t, c).toString({ smallestUnit: "minute" });
      return { start: at(from), end: at(to) };
    });
    if (segments.length > MAX_SEGMENTS) throw new Refusal(`A day has at most ${MAX_SEGMENTS} stretches of working hours.`);
    const wrong = segmentsError(segments);
    if (wrong) throw new Refusal(wrong);
    return segments;
  }

  /** A weekday's rows made exactly these stretches (settings-repo.ts replaceDay): reused in order, extra ones removed. */
  private dayOps(rows: readonly Row[], weekday: number, wanted: readonly Segment[], c: { spaceId: string; userId: string }): WireOp[] {
    const existing = rows.filter((r) => r.weekday === weekday).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    const ops: WireOp[] = [];
    for (let i = 0; i < Math.max(existing.length, wanted.length); i++) {
      const row = existing[i];
      const seg = wanted[i];
      if (row && seg) {
        if (time(row.start_time) !== seg.start || time(row.end_time) !== seg.end) ops.push(this.p.patch("work_hours", String(row.id), { start_time: seg.start, end_time: seg.end }));
      } else if (row) ops.push(this.p.del("work_hours", String(row.id)));
      else if (seg) ops.push(this.p.put("work_hours", this.p.newId(), { space_id: c.spaceId, user_id: c.userId, weekday, start_time: seg.start, end_time: seg.end }));
    }
    return ops;
  }

  /** The evening shutdown: the day closed, with a highlight and a rating when the person gave them. */
  async closeDay(input: { highlight?: string; rating?: number }): Promise<Changed> {
    const c = await this.p.ctx();
    const day = c.today.toString();
    const existing = await this.p.store.dayPlan(day);
    const patch: Record<string, unknown> = { shutdown_at: new Date(c.now.epochMilliseconds).toISOString() };
    if (input.highlight !== undefined) patch.highlights = input.highlight.trim() || null;
    if (input.rating !== undefined) patch.day_rating = input.rating;
    const id = existing ? String(existing.id) : this.p.newId();
    await this.p.apply([existing ? this.p.patch("day_plans", id, patch) : this.p.put("day_plans", id, { space_id: c.spaceId, user_id: c.userId, date: day, ...patch })], "close the day");
    const left = (await this.p.store.tasks({ states: ["inbox", "active"], doDateLte: day })).length;
    const facts = [input.highlight?.trim() ? `highlight ${quoted(input.highlight.trim())}` : null, input.rating !== undefined ? `rated ${input.rating} of 5` : null].filter(Boolean);
    return { said: `Closed ${dayWords(c.today, c.today)}${facts.length ? ` (${facts.join(", ")})` : ""}.${left ? ` ${left} open ${left === 1 ? "task is" : "tasks are"} still on today or earlier.` : ""}`, id, blocksChanged: 0 };
  }
}
