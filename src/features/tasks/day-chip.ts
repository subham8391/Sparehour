// The day chip shown on rows outside Today (DESIGN_SYSTEM.md §4a: "day chips
// instead of times" in project, Someday and Logbook lists). Pure.
import { compareDates, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";

export type DayChipTone = "neutral" | "carried" | "parked";

export interface DayChip {
  label: string;
  tone: DayChipTone;
}

export function dayChip(task: Pick<Task, "state" | "doDate" | "carryCount">, today: LocalDate): DayChip | null {
  if (task.state === "someday") return { label: "Someday", tone: "parked" };
  if (task.state === "inbox") return { label: "Inbox", tone: "neutral" };
  if (!task.doDate) return null;
  const days = task.doDate.since(today, { largestUnit: "days" }).days;
  if (compareDates(task.doDate, today) < 0) return { label: task.carryCount > 0 ? `Carried ×${task.carryCount}` : "Carried", tone: "carried" };
  if (days === 0) return { label: "Today", tone: "neutral" };
  if (days === 1) return { label: "Tomorrow", tone: "neutral" };
  if (days < 7) return { label: weekdayName(task.doDate), tone: "neutral" };
  return { label: formatDay(task.doDate, { weekday: "none", today }), tone: "neutral" };
}
