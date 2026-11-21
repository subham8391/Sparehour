// What search's Filter menu chooses from, beyond the person's own projects, areas and tags (SCREENS.md §13): the
// states a task can be asked for by, and the do-date ranges. Its own module, free of the menu's web parts
// (search-view.tsx draws it in the browser), so the Android app's filters offer the same choices
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { LocalDate } from "@/core/time";
import type { TaskState } from "@/core/types";

/** The states the menu offers. Archived is reached by its own address only. */
export const FILTER_STATES: TaskState[] = ["inbox", "active", "someday", "done", "dropped"];

/** Today, this week (Monday to Sunday) and this month, as inclusive ISO dates on the do-date. */
export function datePresets(today: LocalDate): { label: string; from: string; to: string }[] {
  const day = (d: LocalDate) => d.toString();
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  return [
    { label: "Today", from: day(today), to: day(today) },
    { label: "This week", from: day(monday), to: day(monday.add({ days: 6 })) },
    { label: "This month", from: day(today.with({ day: 1 })), to: day(today.with({ day: today.daysInMonth })) },
  ];
}
