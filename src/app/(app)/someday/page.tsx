"use client";
// Someday (SCREENS.md §7): the guilt-free parking lot, explicitly not a
// backlog you are behind on.
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { SOMEDAY_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { MoveActions } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useListSelection } from "@/features/selection/selection-provider";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";

export default function SomedayPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today } = useLocalDay(now);
  const { data, isLoading } = useQuery<TaskRowType>(SOMEDAY_SQL);
  const tasks = (data ?? []).map(toTask);
  const projectNames = useProjectNames();
  const sel = useListSelection(tasks.map((t) => t.id));

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Someday" title="Things you&rsquo;re not doing right now." subtitle="That&rsquo;s allowed." />
      {!isLoading && tasks.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Icon name="moon" size={20} className="text-ink-3" />
          <EmptyCard fact="Nothing parked. That&rsquo;s fine too." />
        </div>
      ) : (
        <TaskList>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              onOpen={() => detail.open(t.id)}
              selected={sel.selectedId === t.id}
              onSelect={() => sel.select(t.id)}
              onDone={() => void repo.complete(t.id)}
              meta={t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>}
              actions={<MoveActions onToday={() => void repo.reschedule(t.id, today)} onTomorrow={() => void repo.reschedule(t.id, today.add({ days: 1 }))} onDrop={() => void repo.setState(t.id, "dropped")} />}
            />
          ))}
        </TaskList>
      )}
    </main>
  );
}
