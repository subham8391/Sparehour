"use client";
// Logbook (SCREENS.md §8): completed tasks, newest first, grouped by the day
// they were completed, with each day's dropped tasks in a collapsed
// sub-group. A row opens its task; Reopen (U on the keyboard) un-completes a
// done one and Restore brings a dropped one back, both undoable. Cold data:
// the logbook stream delivers the finished months on open and keeps them
// cached after the view closes; dropped tasks are in the working set already.
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { DROPPED_SQL, LOGBOOK_COMPLETIONS_SQL, LOGBOOK_SQL, logbookStream } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useListSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { RowAction } from "@/features/tasks/task-actions";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { CollapsedGroup } from "@/ui/collapsed-group";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";
import { logbookDays, type CompletionRow, type LogbookEntry } from "./logbook-days";

export default function LogbookPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today, settings, zone } = useLocalDay(now);
  const stream = useMemo(() => logbookStream(today), [today]);
  const { data, isLoading } = useQuery<TaskRowType>(LOGBOOK_SQL, [], {
    streams: [{ ...stream, ttl: 60 * 60, waitForStream: true }],
  });
  const { data: completions } = useQuery<CompletionRow>(LOGBOOK_COMPLETIONS_SQL);
  const { data: dropped, isLoading: droppedLoading } = useQuery<TaskRowType>(DROPPED_SQL);
  const projectNames = useProjectNames();

  const days = useMemo(
    () => logbookDays({ done: data, completions, dropped, zone, defaultEstimateMin: settings?.defaultEstimateMin ?? 30 }),
    [data, completions, dropped, zone, settings?.defaultEstimateMin],
  );

  // J/K walks the done rows and the dropped rows of the days whose group is open: a closed group's rows can't be seen.
  // A repeat's completion row is one occurrence, not a task to select or reopen; it opens its task.
  const [openDropped, setOpenDropped] = useState<ReadonlySet<string>>(() => new Set());
  const toggleDropped = useCallback((key: string, open: boolean) => {
    setOpenDropped((s) => {
      if (s.has(key) === open) return s;
      const next = new Set(s);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const sel = useListSelection(
    days.map((d) => [...d.done.filter((e) => e.kind === "done").map((e) => e.key), ...(openDropped.has(d.day.toString()) ? d.dropped.map((e) => e.key) : [])]),
  );

  const meta = ({ task: t, at }: LogbookEntry) => (
    <>
      {t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>}
      <span className="num">{at}</span>
    </>
  );
  const row = (e: LogbookEntry) => {
    const selectable = e.kind !== "completion";
    return (
      <TaskRow
        key={e.key}
        task={e.task}
        today={today}
        onOpen={() => detail.open(e.task.id)}
        selected={selectable && sel.selectedId === e.key}
        onSelect={selectable ? () => sel.select(e.key) : undefined}
        meta={meta(e)}
        actions={
          e.kind === "done" ? (
            <RowAction label="Reopen" primary title="Reopen (U)" onClick={() => void repo.reopen(e.task.id)} />
          ) : e.kind === "dropped" ? (
            <RowAction label="Restore" primary onClick={() => void repo.setState(e.task.id, "active")} />
          ) : undefined
        }
      />
    );
  };

  const empty = !isLoading && !droppedLoading && days.length === 0;
  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Logbook" title="Done" subtitle={days.length > 0 ? "Kept for a week" : undefined} />
      {empty ? (
        <div className="flex flex-col gap-3">
          <Icon name="book" size={20} className="text-ink-3" />
          <EmptyCard fact="Nothing finished yet.">Done tasks stay here for a week.</EmptyCard>
        </div>
      ) : (
        days.map((d) => {
          const key = d.day.toString();
          return (
            <section key={key} className="flex flex-col gap-2">
              <SectionLabel className="px-0.5" detail={d.done.length > 0 ? `${d.done.length} done · ${formatMinutes(d.minutes)}` : undefined}>
                {formatDay(d.day, { weekday: "long", today })}
              </SectionLabel>
              {d.done.length > 0 && <TaskList>{d.done.map(row)}</TaskList>}
              {d.dropped.length > 0 && (
                <CollapsedGroup label="Dropped" count={d.dropped.length} onToggle={(open) => toggleDropped(key, open)}>
                  <TaskList>{d.dropped.map(row)}</TaskList>
                </CollapsedGroup>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}
