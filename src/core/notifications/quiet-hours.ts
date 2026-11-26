// Quiet hours, as the reminder sender reads them (SYSTEM_DESIGN.md §7.4; `private.in_quiet_hours` and the claim in
// supabase/migrations): a block's reminder is due at its start less the lead, and one due inside quiet hours is
// dropped, never saved for later. Pure, so the apps and the MCP server can say beforehand that a reminder will not
// come (docs/product/REMINDERS_AND_AI_SPEC.md §1). Imported by path, not from a package index.
import { localTime, timeOf, type Instant, type LocalTime } from "../time";

/** The person's reminder settings, as far as a block's reminder goes. */
export interface ReminderSettings {
  /** "Before a block" reminders are on (`notify_block_start`). */
  blockReminders: boolean;
  /** Minutes before the start the reminder comes: 0, 5, 10 or 15 (`block_start_lead_min`). */
  leadMin: number;
  /** Null, or the same as the end, when there are no quiet hours. */
  quietStart: LocalTime | null;
  quietEnd: LocalTime | null;
}

/** A reminder that will not come, in the terms a sentence needs. */
export interface HeldReminder {
  /** When it would have come, on the person's clock: "07:25". */
  at: string;
  /** The quiet hours it falls in: "21:00–08:00". */
  quiet: string;
}

const minute = (t: LocalTime) => t.hour * 60 + t.minute;
const hm = (t: LocalTime) => t.toString({ smallestUnit: "minute" });

/** Whether the wall-clock time is inside [start, end). A window that runs overnight wraps; none, or an empty one, never holds. */
export function inQuietHours(t: LocalTime, start: LocalTime | null, end: LocalTime | null): boolean {
  if (!start || !end) return false;
  const [at, from, to] = [minute(t), minute(start), minute(end)];
  if (from === to) return false;
  return from < to ? at >= from && at < to : at >= from || at < to;
}

/** "21:00–08:00", or null when there are no quiet hours. */
export function quietHoursLabel(s: Pick<ReminderSettings, "quietStart" | "quietEnd">): string | null {
  if (!s.quietStart || !s.quietEnd || minute(s.quietStart) === minute(s.quietEnd)) return null;
  return `${hm(s.quietStart)}–${hm(s.quietEnd)}`;
}

/**
 * The reminder of a block starting at `start`, when quiet hours will hold it back; null when it will come, or when
 * block reminders are off (then there is nothing to hold).
 */
export function heldReminder(start: Instant, zone: string, s: ReminderSettings): HeldReminder | null {
  if (!s.blockReminders) return null;
  const quiet = quietHoursLabel(s);
  if (!quiet) return null;
  const due = timeOf(start.subtract({ minutes: Math.max(0, s.leadMin) }), zone);
  return inQuietHours(due, s.quietStart, s.quietEnd) ? { at: hm(due), quiet } : null;
}

/** The settings row's columns as `ReminderSettings` (times as "21:00" or "21:00:00"; a flag as 0 / 1 or a boolean). */
export function toReminderSettings(row: {
  notify_block_start?: unknown;
  block_start_lead_min?: unknown;
  quiet_hours_start?: unknown;
  quiet_hours_end?: unknown;
}): ReminderSettings {
  const time = (v: unknown) => (typeof v === "string" && /^\d\d:\d\d/.test(v) ? localTime(v.slice(0, 5)) : null);
  return {
    blockReminders: !(row.notify_block_start === 0 || row.notify_block_start === false),
    leadMin: typeof row.block_start_lead_min === "number" ? row.block_start_lead_min : 0,
    quietStart: time(row.quiet_hours_start),
    quietEnd: time(row.quiet_hours_end),
  };
}

/** The sentence both apps and the assistant say about a held reminder. */
export const heldWords = (h: HeldReminder): string => `No reminder: ${h.at} is inside quiet hours (${h.quiet}).`;
