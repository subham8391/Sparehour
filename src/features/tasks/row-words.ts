// What a task row says and decides that is not its drawing (task-row.tsx draws it in the browser): how long an
// estimate may be before the row gently asks about it, and the words behind the ×N of a task carried over more than
// once. Its own module, free of the row's web parts, so the Android app's row says the same
// (docs/mobile/ANDROID_APP_SPEC.md §4.3). task-row.tsx hands these on, so every import of them from the row stays as it was.
import { Temporal, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";

/** The longest estimate taken without a question: 8 hours (PRODUCT_SPEC.md §5.2 "~ … Max 8h"). */
export const LONG_ESTIMATE_MIN = 8 * 60;

/** Over 8 hours is saved as asked and gently questioned (PRODUCT_SPEC.md §5.2, §5.4): quiet words, never a warning colour. */
export const LONG_HINT = "Long — break it down?";

/** "Moved 3 times since Tue 9 Sep": the ×N chip's tooltip and name; the date only while the task is still behind. */
export function carriedLabel(task: Pick<Task, "carryCount" | "doDate">, today: LocalDate): string {
  const since = task.doDate && Temporal.PlainDate.compare(task.doDate, today) < 0 ? ` since ${formatDay(task.doDate)}` : "";
  return `Moved ${task.carryCount} times${since}`;
}
