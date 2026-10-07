// The day chip shown on rows outside Today (DESIGN_SYSTEM.md §4a: "day chips
// instead of times" in project, Someday and Logbook lists), or the day a task
// not started yet starts ("Starts Mon 12 Oct"). Pure.
import { compareDates, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";

export type DayChipTone = "neutral" | "carried" | "parked";

export interface DayChip {
  label: string;
  tone: DayChipTone;
}

export function dayChip(task: Pick<Task, "state" | "doDate" | "carryCount"> & Partial<Pick<Task, "startDate">>, today: LocalDate): DayChip | null {
  if (task.state === "someday") return { label: "Someday", tone: "parked" };
  // Not started yet (PRODUCT_SPEC.md §8.1): its project shows it dimmed, saying the day it starts.
  if (task.startDate && compareDates(task.startDate, today) > 0 && (task.state === "active" || task.state === "inbox")) return { label: `Starts ${formatDay(task.startDate, { today })}`, tone: "neutral" };
  if (task.state === "inbox") return { label: "Inbox", tone: "neutral" };
  if (!task.doDate) return null;
  const days = task.doDate.since(today, { largestUnit: "days" }).days;
  if (compareDates(task.doDate, today) < 0) return { label: task.carryCount > 0 ? `Carried ×${task.carryCount}` : "Carried", tone: "carried" };
  if (days === 0) return { label: "Today", tone: "neutral" };
  if (days === 1) return { label: "Tomorrow", tone: "neutral" };
  if (days < 7) return { label: weekdayName(task.doDate), tone: "neutral" };
  return { label: formatDay(task.doDate, { weekday: "none", today }), tone: "neutral" };
}
