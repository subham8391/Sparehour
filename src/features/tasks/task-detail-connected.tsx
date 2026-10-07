"use client";
// The task detail, wired to the local database: one query for the task, the
// project and area names for the breadcrumb, and the repositories for
// writes. It travels with the panel in one island (task-detail.tsx fetches
// it in idle time), so neither the queries nor the repositories ride in the
// shell's first download (SYSTEM_DESIGN.md §11.6).
import { useEffect, useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { localDate } from "@/core/time";
import type { RecurrenceException, TagRef } from "@/core/types";
import { toChecklistItem, toTask } from "@/data/mappers";
import { ALL_PROJECTS_SQL, AREAS_SQL, isOpenProject, type AreaRow, type ProjectStateRow } from "@/data/queries/nav";
import { withAreaNames } from "@/data/queries/project-label";
import { CHECKLIST_SQL, SERIES_EXCEPTIONS_SQL, TAGS_SQL, TASK_SQL, TASK_TAGS_SQL, PROJECT_HEADINGS_SQL } from "@/data/queries/views";
import type { SeriesRepo } from "@/data/repositories/series-repo";
import type { TaskPatch } from "@/data/repositories/task-repo";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useBlockingOptional } from "@/features/blocking/blocking-provider";
import { preloadMarkdown } from "@/ui/note-field";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { copyTaskLink, requestOrganize } from "./organize";
import { Opening, type FieldRequest } from "./task-detail";
import { TaskDetailPanel } from "./task-detail-panel";
import { useChecklistRepo, useTagRepo } from "./use-repos";
import { useConvertToProject } from "./use-convert";
import { useTaskRepo } from "./use-task-repo";

type ChecklistRow = Parameters<typeof toChecklistItem>[0];

export function TaskDetail({ id, field = null, onClose }: { id: string; field?: FieldRequest | null; onClose: () => void }) {
  const repo = useTaskRepo();
  const checklistRepo = useChecklistRepo();
  const tagRepo = useTagRepo();
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const blocking = useBlockingOptional();
  // Convert to project closes the detail and opens the new project, cursor in its add row.
  const convert = useConvertToProject(repo, onClose);
  const { data: rows, isLoading } = useQuery<TaskRowType>(TASK_SQL, [id]);
  const { data: projectRows } = useQuery<ProjectStateRow>(ALL_PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: checklistRows } = useQuery<ChecklistRow>(CHECKLIST_SQL, [id]);
  const { data: tagRows } = useQuery<TagRef>(TASK_TAGS_SQL, [id]);
  const projectId = rows?.[0]?.project_id ?? null;
  const { data: headingRows } = useQuery<{ id: string; title: string | null }>(projectId ? PROJECT_HEADINGS_SQL : `select * from headings where 0`, projectId ? [projectId] : []);
  const { data: allTagRows } = useQuery<TagRef>(TAGS_SQL);
  const seriesId = rows?.[0]?.recurrence_rule ? (rows[0].recurrence_series_id ?? rows[0].id) : null;
  const { data: exceptionRows } = useQuery<ExceptionRow>(seriesId ? SERIES_EXCEPTIONS_SQL : `select * from recurrence_exceptions where 0`, seriesId ? [seriesId] : []);
  const exceptions = useMemo(() => (exceptionRows ?? []).map(toException), [exceptionRows]);
  const checklist = useMemo(() => (checklistRows ?? []).map(toChecklistItem), [checklistRows]);
  const task = rows?.[0] ? toTask(rows[0]) : null;
  // The picker offers projects work can still go into; the label names the task's own project whatever its state.
  const allProjects = useMemo(
    () => withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", areaId: p.area_id, area: p.area, open: isOpenProject(p.state) })),
    [projectRows, areaRows],
  );
  const projects = useMemo(() => allProjects.filter((p) => p.open), [allProjects]);
  const project = allProjects.find((p) => p.id === task?.projectId) ?? null;
  const area = (areaRows ?? []).find((a) => a.id === project?.areaId) ?? null;

  // The notes' Markdown renderer is its own small chunk: fetched as the detail opens, so a note is drawn, not flashed as raw text.
  useEffect(() => void preloadMarkdown(), []);

  // The task left this device (completed elsewhere, dropped, synced away): close rather than show a blank.
  useEffect(() => {
    if (!isLoading && rows && rows.length === 0) onClose();
  }, [isLoading, rows, onClose]);

  if (!task) return <Opening />;
  const patch = (p: TaskPatch) => void repo.update(task.id, p);
  // Series edits load with the recurrence engine (TaskRepo.series()), the first time one is used.
  const series = (edit: (s: SeriesRepo) => Promise<void>) => void repo.series().then(edit);
  return (
    <TaskDetailPanel
      task={task}
      projectName={project?.name ?? null}
      areaName={area?.name ?? null}
      projects={projects}
      headings={(headingRows ?? []).map((h) => ({ id: h.id, title: h.title ?? "Untitled heading" }))}
      onHeading={(headingId) => void repo.setHeading(task.id, headingId)}
      checklist={checklist}
      tags={tagRows ?? []}
      allTags={allTagRows ?? []}
      now={now}
      zone={zone}
      today={today}
      onPatch={patch}
      onChecklistAdd={(title, sortKey) => void checklistRepo.add(task.id, task.spaceId, title, sortKey)}
      onChecklistReorder={(itemId, sortKey) => void checklistRepo.reorder(itemId, sortKey)}
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
      onConvert={() => void convert(task.id)}
      onDuplicate={() => requestOrganize({ kind: "duplicate", id: task.id })}
      onCopyLink={() => void copyTaskLink(task.id)}
      onClose={onClose}
      fieldRequest={field}
      exceptions={exceptions}
      onSeriesDay={(choice, change) => series((s) => (choice === "once" ? s.moveOnce(task.id, change) : s.changeRuleFrom(task.id, change)))}
      onChangeRule={(rule, mode) => series((s) => s.changeRule(task.id, rule, mode))}
      onSkipOccurrence={() => series((s) => s.skip(task.id))}
      onPause={(until) => series((s) => s.pause(task.id, until))}
      onResume={() => series((s) => s.resume(task.id))}
    />
  );
}

type ExceptionRow = { occurrence_date: string; kind: string; moved_to: string | null };

/** An exception row as the recurrence engine reads it: a move with the day it went to, else a skip. */
function toException(e: ExceptionRow): RecurrenceException {
  return e.kind === "move" && e.moved_to
    ? { occurrenceDate: localDate(e.occurrence_date.slice(0, 10)), kind: "move", movedTo: localDate(e.moved_to.slice(0, 10)) }
    : { occurrenceDate: localDate(e.occurrence_date.slice(0, 10)), kind: "skip" };
}
