// The day chip shown on rows outside Today (DESIGN_SYSTEM.md §4a: "day chips
// instead of times" in project, Someday and Logbook lists). Pure.
import { compareDates, type LocalDate } from "@/core/time";
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
  if (days < 7) return { label: task.doDate.toLocaleString("en-GB", { weekday: "short" }), tone: "neutral" };
  const sameYear = task.doDate.year === today.year;
  return { label: task.doDate.toLocaleString("en-GB", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }), tone: "neutral" };
}
