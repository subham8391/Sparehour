// What the apps say when quiet hours will hold a block's reminder back (docs/product/REMINDERS_AND_AI_SPEC.md §1):
// the line under a task's block, and Settings › Notifications' "Held back now: …". The rule is the sender's own
// (core/notifications/quiet-hours.ts); here are only which blocks are asked about, and the words. Pure and free of
// the web's screen parts, so the web and the Android app say the same thing from one place.
import { heldReminder, heldWords, toReminderSettings, type ReminderSettings } from "@/core/notifications/quiet-hours";
import { Temporal, instant, type Instant } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import type { SettingsValues } from "@/features/settings/settings-values";

/** The way from a held reminder's line to Settings › Notifications. */
export const CHANGE_QUIET_HOURS = "Change quiet hours";

/** How far ahead Settings looks for held reminders, in days. */
export const HELD_DAYS = 7;
/** How many it names before "and 2 more". */
const NAMED = 3;

/** The settings form's values the rule reads: what Settings shows, so its line follows a time as it is edited. */
export type ReminderValues = Pick<SettingsValues, "notifyBlockStart" | "blockStartLeadMin" | "quietHoursStart" | "quietHoursEnd">;

export function reminderSettingsOf(v: ReminderValues): ReminderSettings {
  return toReminderSettings({ notify_block_start: v.notifyBlockStart, block_start_lead_min: v.blockStartLeadMin, quiet_hours_start: v.quietHoursStart, quiet_hours_end: v.quietHoursEnd });
}

/** A reminder is made only for a block of a task still to be done (the sender's claim): not one parked, done or dropped. */
export const remindable = (state: string): boolean => state === "inbox" || state === "active";

const startOf = (startAt: string | null | undefined): Instant | null => (startAt ? instant(normaliseTimestamp(startAt)) : null);
const after = (a: Instant, b: Instant) => Temporal.Instant.compare(a, b) > 0;

/**
 * The line under a block whose reminder will not come: "No reminder: 07:25 is inside quiet hours (21:00–08:00)."
 * Null when it will come, when the block has started, and when there is nothing to hold (the settings are not read
 * yet, block reminders are off, no quiet hours).
 */
export function heldNote(startAt: string | null | undefined, now: Instant, zone: string, s: ReminderSettings | null): string | null {
  const start = startOf(startAt);
  if (!s || !start || !after(start, now)) return null;
  const held = heldReminder(start, zone, s);
  return held ? heldWords(held) : null;
}

/** A task's blocks that have a held line, each once: `words` is `heldNote`'s. */
export function heldNotes(blocks: readonly { id: string; start_at: string | null }[], now: Instant, zone: string, s: ReminderSettings | null): { id: string; words: string }[] {
  return blocks.flatMap((b) => {
    const words = heldNote(b.start_at, now, zone, s);
    return words ? [{ id: b.id, words }] : [];
  });
}

/** A block as the held line names it (data/queries/blocks.ts reads these). */
export interface ComingBlock {
  id: string;
  start_at: string | null;
  block_title: string | null;
  task_title: string | null;
}

/**
 * "Held back now: going to gym (Fri 07:25), Vitamin D3 (Thu 21:25)." Every block starting in the next seven days,
 * and not yet started, whose reminder quiet hours will drop: named by its task (its own title without one, else
 * "Time block") with the reminder's own weekday and time on the person's clock, in the order the reminders would
 * have come. Three are named, then "and 2 more". Null when none is held.
 */
export function heldLine(blocks: readonly ComingBlock[], now: Instant, zone: string, s: ReminderSettings | null): string | null {
  if (!s) return null;
  const until = now.add({ hours: 24 * HELD_DAYS });
  const held = blocks
    .flatMap((b) => {
      const start = startOf(b.start_at);
      if (!start || !after(start, now) || after(start, until)) return [];
      const reminder = heldReminder(start, zone, s);
      if (!reminder) return [];
      // The reminder's own moment, as the rule counts it: the weekday is the one it would have come on.
      const due = start.subtract({ minutes: Math.max(0, s.leadMin) });
      const day = weekdayName(due.toZonedDateTimeISO(zone).toPlainDate());
      return [{ due, words: `${b.task_title?.trim() || b.block_title?.trim() || "Time block"} (${day} ${reminder.at})` }];
    })
    .sort((a, b) => Temporal.Instant.compare(a.due, b.due));
  if (held.length === 0) return null;
  const more = held.length - NAMED;
  return `Held back now: ${held
    .slice(0, NAMED)
    .map((h) => h.words)
    .join(", ")}${more > 0 ? ` and ${more} more` : ""}.`;
}
