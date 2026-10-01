"use client";
// The task detail, wired to the local database: one query for the task, the
// project and area names for the breadcrumb, and the repository for writes.
// Where it appears (context pane, right sheet, full-screen sheet) is decided
// by the provider below.
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import type { TagRef } from "@/core/types";
import { toChecklistItem, toTask } from "@/data/mappers";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { CHECKLIST_SQL, TAGS_SQL, TASK_SQL, TASK_TAGS_SQL } from "@/data/queries/views";
import { ChecklistRepo } from "@/data/repositories/checklist-repo";
import { TagRepo } from "@/data/repositories/tag-repo";
import type { TaskPatch } from "@/data/repositories/task-repo";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useBlockingOptional } from "@/features/blocking/blocking-provider";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { cx } from "@/ui/cx";
import { Grabber, Scrim, trapTab, useDialogFocus } from "@/ui/sheet";
import { useTaskRepo } from "./use-task-repo";

// The panel brings the recurrence engine with it, so it stays out of the
// shell's first download (SYSTEM_DESIGN.md §11.6): fetched in idle time after
// the first paint, mounted when a task is opened.
const loadPanel = () => import("./task-detail-panel");
const TaskDetailPanel = dynamic(() => loadPanel().then((m) => m.TaskDetailPanel), { ssr: false, loading: Opening });

function Opening() {
  return <div className="p-5 text-body text-ink-3">Opening…</div>;
}

type ChecklistRow = Parameters<typeof toChecklistItem>[0];

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
  useEffect(() => preloadOnIdle(loadPanel), []);
  return <TaskDetailContext.Provider value={api}>{children}</TaskDetailContext.Provider>;
}

function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useLocalDatabase();
  const repo = useTaskRepo();
  const checklistRepo = useMemo(() => new ChecklistRepo(db), [db]);
  const tagRepo = useMemo(() => new TagRepo(db), [db]);
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const blocking = useBlockingOptional();
  const { data: rows, isLoading } = useQuery<TaskRowType>(TASK_SQL, [id]);
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: checklistRows } = useQuery<ChecklistRow>(CHECKLIST_SQL, [id]);
  const { data: tagRows } = useQuery<TagRef>(TASK_TAGS_SQL, [id]);
  const { data: allTagRows } = useQuery<TagRef>(TAGS_SQL);
  const checklist = useMemo(() => (checklistRows ?? []).map(toChecklistItem), [checklistRows]);
  const task = rows?.[0] ? toTask(rows[0]) : null;
  const projects = useMemo(() => (projectRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", areaId: p.area_id })), [projectRows]);
  const project = projects.find((p) => p.id === task?.projectId) ?? null;
  const area = (areaRows ?? []).find((a) => a.id === project?.areaId) ?? null;

  // The task left this device (completed elsewhere, dropped, synced away): close rather than show a blank.
  useEffect(() => {
    if (!isLoading && rows && rows.length === 0) onClose();
  }, [isLoading, rows, onClose]);

  if (!task) return <Opening />;
  const patch = (p: TaskPatch) => void repo.update(task.id, p);
  return (
    <TaskDetailPanel
      task={task}
      projectName={project?.name ?? null}
      areaName={area?.name ?? null}
      projects={projects}
      checklist={checklist}
      tags={tagRows ?? []}
      allTags={allTagRows ?? []}
      now={now}
      zone={zone}
      today={today}
      onPatch={patch}
      onChecklistAdd={(title) => void checklistRepo.add(task.id, task.spaceId, title)}
      onChecklistToggle={(itemId, done) => void checklistRepo.setDone(itemId, done)}
      onChecklistRename={(itemId, title) => void checklistRepo.rename(itemId, title)}
      onChecklistRemove={(itemId) => void checklistRepo.remove(itemId)}
      onTagAdd={(name) => void tagRepo.attach(task.id, task.spaceId, name)}
      onTagRemove={(tagId) => void tagRepo.detach(task.id, tagId)}
      onComplete={() => void repo.complete(task.id)}
      onReopen={() => void repo.reopen(task.id)}
      onSomeday={() => void repo.setState(task.id, "someday").then(onClose)}
      onDrop={() => void repo.setState(task.id, "dropped").then(onClose)}
      onBlock={blocking?.available ? () => blocking.blockTask(task.id) : undefined}
      onClose={onClose}
    />
  );
}

/**
 * The context pane (medium band and up), a right-side sheet (narrow) or a
 * full-height sheet with a grabber (phone). Mounted once by the shell; empty
 * until a task is opened. Escape closes it unless a popover inside claimed
 * the key first. The pane appears at once; the sheets slide in from their
 * edge (DESIGN_SYSTEM.md §7 "Sheets"), or simply appear under reduced motion.
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
  return <DetailSurface id={selectedId} onClose={close} />;
}

const OVERLAY_QUERY = "(max-width: 47.9375rem)";
const subscribeOverlay = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(OVERLAY_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readOverlay = () => typeof window.matchMedia === "function" && window.matchMedia(OVERLAY_QUERY).matches;

/**
 * Below `md` the detail covers the list (a full-screen sheet on the phone, a side sheet in the narrow band), so it
 * is a modal dialog there: focus moves in, stays in, and goes back to the row on close (SCREENS.md §1 rules 5 and 6).
 * From `md` up it is a pane beside the list, and focus stays where the person is working.
 */
function DetailSurface({ id, onClose }: { id: string; onClose: () => void }) {
  const overlay = useSyncExternalStore(subscribeOverlay, readOverlay, () => false);
  const surface = useDialogFocus<HTMLElement>(overlay);
  return (
    <>
      <Scrim onClose={onClose} className="fixed z-20 md:hidden" />
      <aside
        ref={surface}
        aria-label="Task"
        role={overlay ? "dialog" : undefined}
        aria-modal={overlay ? true : undefined}
        tabIndex={overlay ? -1 : undefined}
        onKeyDown={overlay ? trapTab : undefined}
        className={cx(
          "fixed inset-0 z-30 flex flex-col bg-surface pt-[env(safe-area-inset-top)] outline-none",
          // The phone sheet rises from the bottom, the narrow band's from the right; the pane from `md` up just appears.
          "max-md:transition-[translate,opacity] max-md:dur-slow max-md:ease-drawer max-sm:starting:translate-y-full sm:max-md:starting:translate-x-full",
          "sm:left-auto sm:w-[420px] sm:border-l sm:border-line sm:pt-0 sm:shadow-sheet md:sticky md:top-0 md:inset-auto md:z-auto md:h-dvh md:w-96 md:shrink-0 md:shadow-none",
        )}
      >
        <Grabber />
        <TaskDetail key={id} id={id} onClose={onClose} />
      </aside>
    </>
  );
}
