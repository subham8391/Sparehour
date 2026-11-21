// The days a date picker offers as chips (the detail's Day, Deadline and Start; triage's Deadline): Today, then the
// snooze presets' days, then In a week, each day once under the first name it has. Free of the picker that draws
// them (task-detail-panel.tsx's DatePicker), so the Android app's picker offers the same days
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { LocalDate } from "@/core/time";
import type { SnoozePreset } from "./snooze";

export interface DateChoice {
  label: string;
  date: LocalDate;
}

export function dateChoices(today: LocalDate, presets: readonly SnoozePreset[]): DateChoice[] {
  const days: DateChoice[] = [{ label: "Today", date: today }];
  for (const s of presets) if (!days.some((d) => d.date.equals(s.patch.doDate))) days.push({ label: s.label, date: s.patch.doDate });
  if (!days.some((d) => d.date.equals(today.add({ days: 7 })))) days.push({ label: "In a week", date: today.add({ days: 7 }) });
  return days;
}
