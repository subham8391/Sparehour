"use client";
// Inbox (SCREENS.md §5): a triage queue, not a list. The goal is to empty it.
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { INBOX_SQL } from "@/data/queries/views";
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

export default function InboxPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today } = useLocalDay(now);
  const tomorrow = today.add({ days: 1 });
  const { data, isLoading } = useQuery<TaskRowType>(INBOX_SQL);
  const tasks = (data ?? []).map(toTask);
  const projectNames = useProjectNames();
  const sel = useListSelection(tasks.map((t) => t.id));

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Inbox" title={tasks.length > 0 ? `${tasks.length} to triage` : "Inbox"} subtitle="A queue to empty, not a list to keep." />
      {!isLoading && tasks.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Icon name="inbox" size={20} className="text-ink-3" />
          <EmptyCard fact="Inbox is empty.">New captures land here first.</EmptyCard>
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
              actions={
                <MoveActions
                  onToday={() => void repo.reschedule(t.id, today)}
                  onTomorrow={() => void repo.reschedule(t.id, tomorrow)}
                  onSomeday={() => void repo.setState(t.id, "someday")}
                  onDrop={() => void repo.setState(t.id, "dropped")}
                />
              }
            />
          ))}
        </TaskList>
      )}
    </main>
  );
}
