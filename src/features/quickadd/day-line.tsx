"use client";
// The quick-add strip's last line: what the task would do to its day (day-effect.ts), from the same capacity the
// ribbon and Upcoming show (use-week-capacity.ts), so the sheet and Today never disagree. The line is counted on its
// day the way Upcoming previews a row in the air, so the engine itself says what is left, what is over, and what
// spills past the end of today. It reads the day's rows only while a line names a working day, and rides in the
// sheet's island with the parser, never in a shell.
import { useMemo } from "react";
import type { CapacityTask } from "@/core/capacity";
import type { TaskDraft } from "@/core/quickadd";
import { localDate, type Instant, type LocalDate } from "@/core/time";
import type { TaskId } from "@/core/types";
import { useLocalDay } from "@/features/shell/use-local-day";
import { useWeekCapacity } from "@/features/upcoming/use-week-capacity";
import { Icon } from "@/ui/icons";
import { dayCounted, dayEffect } from "./day-effect";

/** No saved task has this id, so the preview replaces nothing. */
const DRAFT_ID = "quick-add-draft" as TaskId;

export function DayLine({ draft, now, today }: { draft: Pick<TaskDraft, "doDate" | "evening" | "estimateMin">; now: Instant; today: LocalDate }) {
  const day = dayCounted(draft, today);
  return day ? <DayLineOn iso={day.toString()} estimateMin={draft.estimateMin} now={now} today={today} /> : null;
}

function DayLineOn({ iso, estimateMin, now, today }: { iso: string; estimateMin: number | null; now: Instant; today: LocalDate }) {
  // One date object per day named: the parse hands a new one on every key, and the calendar window is keyed on it.
  const day = useMemo(() => localDate(iso), [iso]);
  // The line as a task on that day, not yet saved: counted like any other with no block of its own.
  const preview = useMemo<CapacityTask>(() => ({ id: DRAFT_ID, state: "active", doDate: day, estimateMin, evening: false, daySortKey: null }), [day, estimateMin]);
  const { settings } = useLocalDay(now);
  const { byDay } = useWeekCapacity({ from: day, to: day, today, now, settings, preview });
  const after = byDay.get(iso);
  // A day off has no number to change, and neither has a day whose rows are not here yet.
  if (!settings || !after || after.state === "no_work_day") return null;
  const effect = dayEffect({ day, today, after, countedMin: estimateMin == null ? settings.defaultEstimateMin : null });
  return (
    // Its own line under the chips, inside the strip's live region. Over is said in ink, never red (ruling R1).
    <span data-day-effect={effect.over ? "over" : "fits"} className="flex basis-full items-center gap-1.5 text-pretty text-ink-2">
      <Icon name={effect.over ? "alert" : "clock"} size={14} className="shrink-0 text-ink-3" />
      {effect.text}
    </span>
  );
}
