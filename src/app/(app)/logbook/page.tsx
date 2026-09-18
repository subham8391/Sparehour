"use client";
// Logbook (SCREENS.md §8): completed tasks, newest first, grouped by the day
// they were completed. Cold data: the logbook stream delivers the last three
// months on open and keeps them cached after the view closes.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes, instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task, TaskId } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { LOGBOOK_COMPLETIONS_SQL, LOGBOOK_SQL, monthsBack } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { SectionLabel } from "@/ui/section-label";

interface DayGroup {
  day: LocalDate;
  tasks: Task[];
  minutes: number;
}

export default function LogbookPage() {
  const now = useNow();
  const { today, settings, zone } = useLocalDay(now);
  const months = useMemo(() => monthsBack(today, 3), [today]);
  const { data, isLoading } = useQuery<TaskRowType>(LOGBOOK_SQL, [], {
    streams: [{ name: "logbook", parameters: { months }, ttl: 60 * 60, waitForStream: true }],
  });
  const { data: completions } = useQuery<TaskRowType & { completion_id: string; occurrence_completed_at: string }>(LOGBOOK_COMPLETIONS_SQL);

  const groups = useMemo(() => {
    const out: DayGroup[] = [];
    // Done tasks and each completion of a repeating task, one list, newest first.
    const entries = [
      ...(data ?? []).filter((r) => r.completed_at).map((r) => ({ completedAt: r.completed_at as string, task: toTask(r) })),
      ...(completions ?? []).map((r) => ({ completedAt: r.occurrence_completed_at, task: { ...toTask(r), id: r.completion_id as TaskId, state: "done" as const } })),
    ].sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
    for (const { completedAt, task } of entries) {
      const day = instant(normaliseTimestamp(completedAt)).toZonedDateTimeISO(zone).toPlainDate();
      const last = out[out.length - 1];
      const minutes = task.estimateMin ?? settings?.defaultEstimateMin ?? 30;
      if (last && last.day.equals(day)) {
        last.tasks.push(task);
        last.minutes += minutes;
      } else {
        out.push({ day, tasks: [task], minutes });
      }
    }
    return out;
  }, [data, completions, zone, settings?.defaultEstimateMin]);

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Logbook" title="Done" subtitle={groups.length > 0 ? `The last ${months.length} months` : undefined} />
      {!isLoading && groups.length === 0 ? (
        <EmptyState>Nothing completed yet.</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.day.toString()} className="flex flex-col gap-2">
            <SectionLabel className="px-0.5" detail={`${g.tasks.length} done · ${formatMinutes(g.minutes)}`}>
              {formatDay(g.day, { weekday: "long", today })}
            </SectionLabel>
            <TaskList>
              {g.tasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </TaskList>
          </section>
        ))
      )}
    </main>
  );
}
