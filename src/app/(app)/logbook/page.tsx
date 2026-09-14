"use client";
// Logbook (SCREENS.md §8): completed tasks, newest first, grouped by the day
// they were completed. Cold data: the logbook stream delivers the last three
// months on open and keeps them cached after the view closes.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes, instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { LOGBOOK_SQL, monthsBack } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, ViewHeader } from "@/features/shell/view-header";
import { TaskList, TaskRow } from "@/features/tasks/task-row";

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

  const groups = useMemo(() => {
    const out: DayGroup[] = [];
    for (const row of data ?? []) {
      if (!row.completed_at) continue;
      const day = instant(normaliseTimestamp(row.completed_at)).toZonedDateTimeISO(zone).toPlainDate();
      const task = toTask(row);
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
  }, [data, zone, settings?.defaultEstimateMin]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader eyebrow="Logbook" title="Done" subtitle={groups.length > 0 ? `The last ${months.length} months` : undefined} />
      {!isLoading && groups.length === 0 ? (
        <EmptyState>Nothing completed yet.</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.day.toString()} className="flex flex-col gap-2">
            <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              {formatDay(g.day, { weekday: "long", today })}
              <span className="ml-2 font-mono normal-case tracking-normal">
                {g.tasks.length} done · {formatMinutes(g.minutes)}
              </span>
            </h2>
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
