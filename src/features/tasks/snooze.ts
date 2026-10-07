// Smart snooze presets (PRODUCT_SPEC.md §8.6): This evening · Tomorrow ·
// In 4 hours · This weekend · Next week, then Pick a date (the day picker,
// day-picker.tsx). "This weekend" is the next Saturday; "Next week" is next
// Monday. Pure: takes the moment and the user's day, returns the patch each
// preset would apply; `applySnooze` is the one write the palette, the keys
// and the row's ⋯ menu share.
import { Temporal, type Instant, type LocalDate, type LocalTime } from "@/core/time";

export interface SnoozePatch {
  doDate: LocalDate;
  doTime: LocalTime | null;
  evening: boolean;
}

export interface SnoozePreset {
  id: "evening" | "tomorrow" | "in4h" | "weekend" | "nextweek";
  label: string;
  patch: SnoozePatch;
}

/** The next Saturday strictly after `day`. */
export function nextSaturday(day: LocalDate): LocalDate {
  const ahead = (6 - day.dayOfWeek + 7) % 7 || 7;
  return day.add({ days: ahead });
}

/** The next Monday strictly after `day`. */
export function nextMonday(day: LocalDate): LocalDate {
  const ahead = (1 - day.dayOfWeek + 7) % 7 || 7;
  return day.add({ days: ahead });
}

/** `now` plus four hours in the user's zone, rounded up to five minutes. */
export function inFourHours(now: Instant, zone: string): { doDate: LocalDate; doTime: LocalTime } {
  const zoned = now.toZonedDateTimeISO(zone).add({ hours: 4 });
  const rounded = zoned.round({ smallestUnit: "minute", roundingIncrement: 5, roundingMode: "ceil" });
  return { doDate: rounded.toPlainDate(), doTime: rounded.toPlainTime() };
}

export function snoozePresets(now: Instant, zone: string, today: LocalDate): SnoozePreset[] {
  const four = inFourHours(now, zone);
  return [
    { id: "evening", label: "This evening", patch: { doDate: today, doTime: null, evening: true } },
    { id: "tomorrow", label: "Tomorrow", patch: { doDate: today.add({ days: 1 }), doTime: null, evening: false } },
    { id: "in4h", label: "In 4 hours", patch: { doDate: four.doDate, doTime: four.doTime, evening: false } },
    { id: "weekend", label: "This weekend", patch: { doDate: nextSaturday(today), doTime: null, evening: false } },
    { id: "nextweek", label: "Next week", patch: { doDate: nextMonday(today), doTime: null, evening: false } },
  ];
}

/** The preset words, for a menu that already offers them to leave out a row action saying the same ("Tomorrow"). */
export const PRESET_LABELS: ReadonlySet<string> = new Set(["This evening", "Tomorrow", "In 4 hours", "This weekend", "Next week"]);

/** The undo toast's words: "Moved “Call Ana” to this weekend". */
export function snoozeNote(preset: Pick<SnoozePreset, "label">): string {
  return `Moved {title} to ${preset.label.toLowerCase()}`;
}

/** What a snooze writes to, the task repository's two update calls. */
export interface SnoozeRepo {
  update: (id: string, patch: SnoozePatch, note?: string) => Promise<void>;
  updateMany: (ids: readonly string[], patch: SnoozePatch, note?: string) => Promise<void>;
}

/**
 * A preset on one or more tasks: one write and one undo entry with its toast. The palette, the keys and the row's
 * ⋯ menu all go through here, so a preset is the same patch wherever it is chosen (the carry count is the
 * server's, and a do-date the person picked never counts as a carry).
 */
export function applySnooze(repo: SnoozeRepo, ids: readonly string[], preset: SnoozePreset): Promise<void> {
  if (ids.length === 1) return repo.update(ids[0], preset.patch, snoozeNote(preset));
  return repo.updateMany(ids, preset.patch, snoozeNote(preset));
}

export type { Temporal };
