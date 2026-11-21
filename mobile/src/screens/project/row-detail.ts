// The quiet line under a task's title in a project or an area (DESIGN_SYSTEM.md §4a "day chips instead of times"): the
// day the web's day chip says ("Tomorrow", "Starts Mon 12 Oct", "Inbox", "Someday"), then its tags. The day is the
// web's own rule (features/tasks/day-chip.ts); a carried day steps aside, because the row prints the carry count
// itself, as on the web. A list that is all one day already (the project's parked tasks) asks for the tags alone.
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { dayChip } from "@/features/tasks/day-chip";

export function rowDetail(task: Task, today: LocalDate, withDay = true): string | undefined {
  const chip = withDay ? dayChip(task, today) : null;
  const day = chip && chip.tone !== "carried" ? chip.label : null;
  return [day, ...(task.tags ?? []).map((t) => `@${t}`)].filter(Boolean).join(" · ") || undefined;
}
