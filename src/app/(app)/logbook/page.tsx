"use client";
// Logbook (SCREENS.md §8): completed tasks, newest first, grouped by the day
// they were completed. Cold data: the logbook stream delivers the last three
// months on open and keeps them cached after the view closes.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes, formatTime, instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task, TaskId } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { LOGBOOK_COMPLETIONS_SQL, LOGBOOK_SQL, monthsBack } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";

interface DoneEntry {
  task: Task;
  /** When it was finished, as the row's quiet time. */
  at: string;
}

interface DayGroup {
  day: LocalDate;
  entries: DoneEntry[];
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
  const projectNames = useProjectNames();

  const groups = useMemo(() => {
    const out: DayGroup[] = [];
    // Done tasks and each completion of a repeating task, one list, newest first.
    const entries = [
      ...(data ?? []).filter((r) => r.completed_at).map((r) => ({ completedAt: r.completed_at as string, task: toTask(r) })),
      ...(completions ?? []).map((r) => ({ completedAt: r.occurrence_completed_at, task: { ...toTask(r), id: r.completion_id as TaskId, state: "done" as const } })),
    ].sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
    for (const { completedAt, task } of entries) {
      const zoned = instant(normaliseTimestamp(completedAt)).toZonedDateTimeISO(zone);
      const day = zoned.toPlainDate();
      const entry: DoneEntry = { task, at: formatTime(zoned.toPlainTime()) };
      const last = out[out.length - 1];
      const minutes = task.estimateMin ?? settings?.defaultEstimateMin ?? 30;
      if (last && last.day.equals(day)) {
        last.entries.push(entry);
        last.minutes += minutes;
      } else {
        out.push({ day, entries: [entry], minutes });
      }
    }
    return out;
  }, [data, completions, zone, settings?.defaultEstimateMin]);

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Logbook" title="Done" subtitle={groups.length > 0 ? "Kept for a week" : undefined} />
      {!isLoading && groups.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Icon name="book" size={20} className="text-ink-3" />
          <EmptyCard fact="Nothing finished yet.">Done tasks stay here for a week.</EmptyCard>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.day.toString()} className="flex flex-col gap-2">
            <SectionLabel className="px-0.5" detail={`${g.entries.length} done · ${formatMinutes(g.minutes)}`}>
              {formatDay(g.day, { weekday: "long", today })}
            </SectionLabel>
            <TaskList>
              {g.entries.map(({ task: t, at }) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  meta={
                    <>
                      {t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>}
                      <span className="num">{at}</span>
                    </>
                  }
                />
              ))}
            </TaskList>
          </section>
        ))
      )}
    </main>
  );
}
