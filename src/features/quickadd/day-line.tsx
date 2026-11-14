"use client";
// The quick-add strip's last line: what the task would do to its day (day-effect.ts), from the same capacity the
// ribbon and Upcoming show (use-week-capacity.ts), so the sheet and Today never disagree. It reads the day's rows only
// while a line names a working day, and rides in the sheet's island with the parser, never in a shell.
import { useMemo } from "react";
import type { TaskDraft } from "@/core/quickadd";
import { localDate, type Instant, type LocalDate } from "@/core/time";
import { useLocalDay } from "@/features/shell/use-local-day";
import { useWeekCapacity } from "@/features/upcoming/use-week-capacity";
import { Icon } from "@/ui/icons";
import { dayCounted, dayEffect } from "./day-effect";

export function DayLine({ draft, now, today }: { draft: Pick<TaskDraft, "doDate" | "evening" | "estimateMin">; now: Instant; today: LocalDate }) {
  const day = dayCounted(draft, today);
  return day ? <DayLineOn iso={day.toString()} estimateMin={draft.estimateMin} now={now} today={today} /> : null;
}

function DayLineOn({ iso, estimateMin, now, today }: { iso: string; estimateMin: number | null; now: Instant; today: LocalDate }) {
  // One date object per day named: the parse hands a new one on every key, and the calendar window is keyed on it.
  const day = useMemo(() => localDate(iso), [iso]);
  const { settings } = useLocalDay(now);
  const { byDay } = useWeekCapacity({ from: day, to: day, today, now, settings });
  const capacity = byDay.get(iso);
  // A day off has no number to change, and neither has a day whose rows are not here yet.
  if (!settings || !capacity || capacity.state === "no_work_day") return null;
  const effect = dayEffect({ day, today, spareMin: capacity.spareMin, estimateMin, defaultEstimateMin: settings.defaultEstimateMin });
  return (
    // Its own line under the chips, inside the strip's live region. Over is said in ink, never red (ruling R1).
    <span data-day-effect={effect.over ? "over" : "fits"} className="flex basis-full items-center gap-1.5 text-pretty text-ink-2">
      <Icon name={effect.over ? "alert" : "clock"} size={14} className="shrink-0 text-ink-3" />
      {effect.text}
    </span>
  );
}
