"use client";
// What a quick-add line would do to its day, without the line that says it (day-line.tsx draws it in the browser):
// the line counted on its day as a task not yet saved, by the same capacity the ribbon and Upcoming show
// (use-week-capacity.ts), then said in day-effect.ts's words. Its own module, free of the web's screen parts, so the
// Android app's sheet says the same of the same line (docs/mobile/ANDROID_APP_SPEC.md §4.3). It reads the day's
// rows, so it is called only while a line names a working day (`dayCounted`).
import { useMemo } from "react";
import type { CapacityTask } from "@/core/capacity";
import { localDate, type Instant, type LocalDate } from "@/core/time";
import type { TaskId } from "@/core/types";
import { useLocalDay } from "@/features/shell/use-local-day";
import { useWeekCapacity } from "@/features/upcoming/use-week-capacity";
import { dayEffect, type DayEffect } from "./day-effect";

/** No saved task has this id, so the preview replaces nothing. */
const DRAFT_ID = "quick-add-draft" as TaskId;

/** The effect of a line of `estimateMin` on the day `iso`; null on a day off, or while that day's rows are not here yet. */
export function useDayEffect(iso: string, estimateMin: number | null, now: Instant, today: LocalDate): DayEffect | null {
  // One date object per day named: the parse hands a new one on every key, and the calendar window is keyed on it.
  const day = useMemo(() => localDate(iso), [iso]);
  // The line as a task on that day, not yet saved: counted like any other with no block of its own.
  const preview = useMemo<CapacityTask>(() => ({ id: DRAFT_ID, state: "active", doDate: day, estimateMin, evening: false, daySortKey: null }), [day, estimateMin]);
  const { settings } = useLocalDay(now);
  const { byDay } = useWeekCapacity({ from: day, to: day, today, now, settings, preview });
  const after = byDay.get(iso);
  // A day off has no number to change, and neither has a day whose rows are not here yet.
  if (!settings || !after || after.state === "no_work_day") return null;
  return dayEffect({ day, today, after, countedMin: estimateMin == null ? settings.defaultEstimateMin : null });
}
