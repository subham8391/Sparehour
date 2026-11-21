// What each of the bulk bar's actions writes (PRODUCT_SPEC.md "Multi-select + bulk edit"; SCREENS.md §24): the patch
// for every ticked task and the words of its one undo toast. Free of the bar that draws them in the browser
// (bulk-bar.tsx), so the Android app's bar makes the same writes under the same words
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { LocalDate } from "@/core/time";
import type { Priority } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { estimateNote } from "@/features/tasks/estimate-presets";

export interface BulkWrite {
  patch: TaskPatch;
  /** The undo toast's words, `{title}` standing for the task or "3 tasks". */
  note: string;
}

/** The priorities as the bar's menu lists them, the highest first. */
export const BULK_PRIORITIES: readonly { value: Priority; label: string }[] = [
  { value: 3, label: "!1 High" },
  { value: 2, label: "!2 Medium" },
  { value: 1, label: "!3 Low" },
  { value: 0, label: "None" },
];

export const bulkToday = (today: LocalDate): BulkWrite => ({ patch: { doDate: today, doTime: null, evening: false }, note: "Moved {title} to today" });

export const bulkTomorrow = (today: LocalDate): BulkWrite => ({ patch: { doDate: today.add({ days: 1 }), doTime: null, evening: false }, note: "Moved {title} to tomorrow" });

/** A day picked from the calendar. */
export const bulkDay = (day: LocalDate): BulkWrite => ({ patch: { doDate: day, doTime: null, evening: false }, note: "Moved {title}" });

/** Into a project, or out of one (null). */
export const bulkProject = (project: { id: string; name: string } | null): BulkWrite =>
  project ? { patch: { projectId: project.id }, note: `Moved {title} to ${project.name}` } : { patch: { projectId: null }, note: "Moved {title} out of its project" };

export const bulkPriority = (priority: { value: Priority; label: string }): BulkWrite => ({ patch: { priority: priority.value }, note: `Set {title} to ${priority.label.toLowerCase()} priority` });

/** An estimate in minutes, or none (null). */
export const bulkEstimate = (minutes: number | null): BulkWrite => ({ patch: { estimateMin: minutes }, note: estimateNote(minutes) });

/** The bar's tag field as a tag's name: one leading @ and the spaces around it dropped. */
export const bulkTagName = (typed: string): string => typed.trim().replace(/^@/, "");
