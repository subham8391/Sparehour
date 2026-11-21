"use client";
// The quick-add strip's last line: what the task would do to its day (day-effect.ts), from the same capacity the
// ribbon and Upcoming show (use-week-capacity.ts), so the sheet and Today never disagree. The line is counted on its
// day the way Upcoming previews a row in the air, so the engine itself says what is left, what is over, and what
// spills past the end of today. It reads the day's rows only while a line names a working day, and rides in the
// sheet's island with the parser, never in a shell.
import type { TaskDraft } from "@/core/quickadd";
import type { Instant, LocalDate } from "@/core/time";
import { Icon } from "@/ui/icons";
import { dayCounted } from "./day-effect";
import { useDayEffect } from "./use-day-effect";

export function DayLine({ draft, now, today }: { draft: Pick<TaskDraft, "doDate" | "evening" | "estimateMin">; now: Instant; today: LocalDate }) {
  const day = dayCounted(draft, today);
  return day ? <DayLineOn iso={day.toString()} estimateMin={draft.estimateMin} now={now} today={today} /> : null;
}

function DayLineOn({ iso, estimateMin, now, today }: { iso: string; estimateMin: number | null; now: Instant; today: LocalDate }) {
  // The line counted on its day by the capacity engine, in the ribbon's words (use-day-effect.ts); nothing on a day off.
  const effect = useDayEffect(iso, estimateMin, now, today);
  if (!effect) return null;
  return (
    // Its own line under the chips, inside the strip's live region. Over is said in ink, never red (ruling R1).
    <span data-day-effect={effect.over ? "over" : "fits"} className="flex basis-full items-center gap-1.5 text-pretty text-ink-2">
      <Icon name={effect.over ? "alert" : "clock"} size={14} className="shrink-0 text-ink-3" />
      {effect.text}
    </span>
  );
}
