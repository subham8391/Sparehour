// The rules of a row's ⋯ menu that are not its drawing (task-row.tsx and row-menu.tsx draw it in the browser): which
// tasks take the snooze presets and Move to…, which can be organised, which can skip an occurrence, and which labels
// step aside because the menu already says them in a group of its own. Free of the menu's web parts, so the Android
// app's row menu holds the same items for the same tasks (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { Task, TaskState } from "@/core/types";
import { PRESET_LABELS } from "./snooze";

/** An open task: one that can still be moved to a day, filed or tagged (a finished or dropped one has nothing to move). */
export function isOpenTask(state: TaskState): boolean {
  return state === "active" || state === "inbox" || state === "someday";
}

/** A repeat that is still on: its menu can skip to the next occurrence (SYSTEM_DESIGN.md §5.2). */
export function canSkipOccurrence(task: Pick<Task, "recurrenceRule" | "state">): boolean {
  return Boolean(task.recurrenceRule) && (task.state === "active" || task.state === "inbox");
}

/**
 * The labels the menu's own group already offers, so a row action saying the same steps aside: the snooze presets,
 * whatever the view's lead says, and Someday for a task not parked yet (row-menu.tsx).
 */
export function ownedLabels(led: ReadonlySet<string>, parked: boolean): Set<string> {
  return new Set([...PRESET_LABELS, ...led, ...(parked ? [] : ["Someday"])]);
}
