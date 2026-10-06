// "Copy today as text" (SCREENS.md §2.1 ⋯): the day as plain lines a person
// can paste into a chat or a note — Carried over, Today and This evening, each
// task with its time and estimate. Pure; loaded with Today's ⋯ menu.
import { formatMinutes, formatTime, timeFromMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";

export interface TodayTextInput {
  day: LocalDate;
  carried: readonly Task[];
  today: readonly Task[];
  evening: readonly Task[];
  /** A task's time block start, in minutes of the day, when it has one: it stands in for the do-time, as on the row. */
  blockStart?: (taskId: string) => number | null;
  defaultEstimateMin: number;
}

function line(t: Task, blockStart: TodayTextInput["blockStart"], defaultEstimateMin: number): string {
  const start = blockStart?.(t.id) ?? null;
  const time = start !== null ? formatTime(timeFromMinutes(start)) : t.doTime ? formatTime(t.doTime) : null;
  const estimate = t.estimateMin ? formatMinutes(t.estimateMin) : `${formatMinutes(defaultEstimateMin)}?`;
  return `- ${time ? `${time} ` : ""}${t.title} · ${estimate}`;
}

/** The day as text; sections with nothing in them are left out. */
export function todayAsText({ day, carried, today, evening, blockStart, defaultEstimateMin }: TodayTextInput): string {
  const out = [formatDay(day, { weekday: "long", month: "long" })];
  const section = (title: string, tasks: readonly Task[]) => {
    if (tasks.length === 0) return;
    out.push("", title, ...tasks.map((t) => line(t, blockStart, defaultEstimateMin)));
  };
  section("Carried over", carried);
  section("Today", today);
  section("This evening", evening);
  if (carried.length + today.length + evening.length === 0) out.push("", "Nothing planned.");
  return out.join("\n");
}
