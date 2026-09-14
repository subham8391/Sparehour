"use client";
// The task detail, wired to the local database: one query for the task, the
// project and area names for the breadcrumb, and the repository for writes.
// Where it appears (context pane, right sheet, full-screen sheet) is decided
// by the provider below.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { TASK_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { TaskDetailPanel } from "./task-detail-panel";
import { useTaskRepo } from "./use-task-repo";

interface TaskDetailApi {
  selectedId: string | null;
  open: (id: string) => void;
  close: () => void;
}

const TaskDetailContext = createContext<TaskDetailApi | null>(null);

export function useTaskDetail(): TaskDetailApi {
  const api = useContext(TaskDetailContext);
  if (!api) throw new Error("useTaskDetail needs a TaskDetailProvider above it");
  return api;
}

export function TaskDetailProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const open = useCallback((id: string) => setSelectedId(id), []);
  const close = useCallback(() => setSelectedId(null), []);
  const api = useMemo(() => ({ selectedId, open, close }), [selectedId, open, close]);
  return <TaskDetailContext.Provider value={api}>{children}</TaskDetailContext.Provider>;
}

function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const repo = useTaskRepo();
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const { data: rows, isLoading } = useQuery<TaskRowType>(TASK_SQL, [id]);
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const task = rows?.[0] ? toTask(rows[0]) : null;
  const projects = useMemo(() => (projectRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", areaId: p.area_id })), [projectRows]);
  const project = projects.find((p) => p.id === task?.projectId) ?? null;
  const area = (areaRows ?? []).find((a) => a.id === project?.areaId) ?? null;

  // The task left this device (completed elsewhere, dropped, synced away): close rather than show a blank.
  useEffect(() => {
    if (!isLoading && rows && rows.length === 0) onClose();
  }, [isLoading, rows, onClose]);

  if (!task) return <div className="p-5 text-ink-3">Opening…</div>;
  const patch = (p: TaskPatch) => void repo.update(task.id, p);
  return (
    <TaskDetailPanel
      task={task}
      projectName={project?.name ?? null}
      areaName={area?.name ?? null}
      projects={projects}
      now={now}
      zone={zone}
      today={today}
      onPatch={patch}
      onComplete={() => void repo.complete(task.id)}
      onReopen={() => void repo.reopen(task.id)}
      onSomeday={() => void repo.setState(task.id, "someday").then(onClose)}
      onDrop={() => void repo.setState(task.id, "dropped").then(onClose)}
      onClose={onClose}
    />
  );
}

/**
 * The context pane (medium band and up), a right-side sheet (narrow) or a
 * full-screen sheet (phone). Mounted once by the shell; empty until a task is
 * opened. Escape closes it unless a popover inside claimed the key first.
 */
export function TaskDetailPane() {
  const { selectedId, close } = useTaskDetail();
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, close]);

  if (!selectedId) return null;
  return (
    <>
      <button type="button" aria-label="Close" onClick={close} className="fixed inset-0 z-20 bg-ink/20 md:hidden" />
      <aside
        aria-label="Task"
        className="fixed inset-0 z-30 flex flex-col bg-surface sm:left-auto sm:w-[420px] sm:border-l sm:border-line md:sticky md:top-0 md:inset-auto md:z-auto md:h-dvh md:w-96 md:shrink-0"
      >
        <TaskDetail key={selectedId} id={selectedId} onClose={close} />
      </aside>
    </>
  );
}
