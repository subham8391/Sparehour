"use client";
// Someday (SCREENS.md §7): the guilt-free parking lot — explicitly not a
// backlog you are behind on.
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { SOMEDAY_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, ViewHeader } from "@/features/shell/view-header";
import { MoveActions } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";

export default function SomedayPage() {
  const repo = useTaskRepo();
  const now = useNow();
  const { today } = useLocalDay(now);
  const { data, isLoading } = useQuery<TaskRowType>(SOMEDAY_SQL);
  const tasks = (data ?? []).map(toTask);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader eyebrow="Someday" title="Things you&rsquo;re not doing right now." subtitle="That&rsquo;s allowed." />
      {!isLoading && tasks.length === 0 ? (
        <EmptyState>Nothing parked. That&rsquo;s fine too.</EmptyState>
      ) : (
        <TaskList>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onDone={() => void repo.complete(t.id)}
              actions={<MoveActions onToday={() => void repo.reschedule(t.id, today)} onTomorrow={() => void repo.reschedule(t.id, today.add({ days: 1 }))} onDrop={() => void repo.setState(t.id, "dropped")} />}
            />
          ))}
        </TaskList>
      )}
    </main>
  );
}
