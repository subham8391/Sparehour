"use client";
// A project (SCREENS.md §9): everything still open in it, in its own order,
// with a day chip per row instead of a time.
import Link from "next/link";
import { use } from "react";
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { PROJECT_SQL, PROJECT_TASKS_SQL } from "@/data/queries/views";
import type { ProjectRow, TaskRow as TaskRowType } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, ViewHeader } from "@/features/shell/view-header";
import { dayChip } from "@/features/tasks/day-chip";
import { DayChipTag } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";

export default function ProjectPage({ params }: PageProps<"/project/[id]">) {
  const { id } = use(params);
  const repo = useTaskRepo();
  const now = useNow();
  const { today } = useLocalDay(now);
  const { data: projects, isLoading } = useQuery<ProjectRow>(PROJECT_SQL, [id]);
  const { data: rows } = useQuery<TaskRowType>(PROJECT_TASKS_SQL, [id]);
  const project = projects?.[0];
  const tasks = (rows ?? []).map(toTask);

  if (!isLoading && !project) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
        <ViewHeader eyebrow="Project" title="Not here" />
        <EmptyState>
          This project isn&rsquo;t on this device.{" "}
          <Link href="/browse" className="font-medium text-ink underline">
            Browse
          </Link>
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader eyebrow="Project" title={project?.name ?? "…"} subtitle={tasks.length > 0 ? `${tasks.length} open` : undefined} />
      {rows && tasks.length === 0 ? (
        <EmptyState>Nothing in this project yet.</EmptyState>
      ) : (
        <TaskList>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onDone={() => void repo.complete(t.id)} meta={<DayChipTag chip={dayChip(t, today)} />} />
          ))}
        </TaskList>
      )}
    </main>
  );
}
