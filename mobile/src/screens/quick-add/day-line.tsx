// The quick-add strip's last line, wired to the phone's own database: what the task would do to its day, counted by
// the same capacity engine as Today's figure and said in the web's words (../../../../src/features/quickadd/
// use-day-effect.ts, day-effect.ts). It reads the day's rows only while a line names a working day. The drawing is
// DayEffectLine in quick-add-view.tsx.
import type { TaskDraft } from "@/core/quickadd";
import type { Instant, LocalDate } from "@/core/time";
import { dayCounted } from "@/features/quickadd/day-effect";
import { useDayEffect } from "@/features/quickadd/use-day-effect";
import { DayEffectLine } from "./quick-add-view";

export function DayLine({ draft, now, today }: { draft: Pick<TaskDraft, "doDate" | "evening" | "estimateMin">; now: Instant; today: LocalDate }) {
  const day = dayCounted(draft, today);
  return day ? <DayLineOn iso={day.toString()} estimateMin={draft.estimateMin} now={now} today={today} /> : null;
}

function DayLineOn({ iso, estimateMin, now, today }: { iso: string; estimateMin: number | null; now: Instant; today: LocalDate }) {
  const effect = useDayEffect(iso, estimateMin, now, today);
  return effect ? <DayEffectLine text={effect.text} over={effect.over} /> : null;
}
