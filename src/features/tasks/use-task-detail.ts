"use client";
// What an open task's detail reads from the local database (SCREENS.md §10): the task, its project and area for the
// breadcrumb, the places it can be filed in, its project's headings, its checklist and tags, and its series' one-off
// changes. Free of the web's screen parts, so the web's detail (task-detail-connected.tsx) and the Android app's
// read the same rows the same way (docs/mobile/ANDROID_APP_SPEC.md §4.3). Reads only: the writes stay with each screen.
import { useMemo } from "react";
import { localDate } from "@/core/time";
import type { ChecklistItem, RecurrenceException, TagRef, Task } from "@/core/types";
import { toChecklistItem, toTask } from "@/data/mappers";
import { useQuery } from "@/data/powersync";
import { ALL_PROJECTS_SQL, AREAS_SQL, isOpenProject, type AreaRow, type ProjectStateRow } from "@/data/queries/nav";
import { withAreaNames } from "@/data/queries/project-label";
import { CHECKLIST_SQL, PROJECT_HEADINGS_SQL, SERIES_EXCEPTIONS_SQL, TAGS_SQL, TASK_SQL, TASK_TAGS_SQL } from "@/data/queries/views";
import type { TaskRow } from "@/data/schema.client";

type ChecklistRow = Parameters<typeof toChecklistItem>[0];
type ExceptionRow = { occurrence_date: string; kind: string; moved_to: string | null };

/** An exception row as the recurrence engine reads it: a move with the day it went to, else a skip. */
export function toException(e: ExceptionRow): RecurrenceException {
  return e.kind === "move" && e.moved_to
    ? { occurrenceDate: localDate(e.occurrence_date.slice(0, 10)), kind: "move", movedTo: localDate(e.moved_to.slice(0, 10)) }
    : { occurrenceDate: localDate(e.occurrence_date.slice(0, 10)), kind: "skip" };
}

/** A project as the detail names and lists it: its area's name tells two projects of one name apart. */
export interface DetailProject {
  id: string;
  name: string;
  areaId: string | null;
  area: string | null;
  /** Work can still go into it: the picker offers only these. */
  open: boolean;
}

export interface TaskDetailData {
  /** The task; null while it is being read, and when it is not on this device. */
  task: Task | null;
  /** Its row as stored, for the columns the task itself does not carry (`actual_min`). */
  row: TaskRow | null;
  /** Read, and not here: finished long ago, dropped, synced away, or never a task. */
  missing: boolean;
  /** The task's own project, whatever its state. */
  project: DetailProject | null;
  /** A project task's area is its project's; a loose task names its own (a project or an area, never both). */
  area: AreaRow | null;
  /** The projects work can still go into, for the picker. */
  projects: readonly DetailProject[];
  areas: readonly { id: string; name: string }[];
  /** The headings of the task's project. */
  headings: readonly { id: string; title: string }[];
  checklist: readonly ChecklistItem[];
  tags: readonly TagRef[];
  /** Every tag in the space, for suggestions. */
  allTags: readonly TagRef[];
  /** The series' one-off changes (moves and skips) still in force. */
  exceptions: readonly RecurrenceException[];
}

export function useTaskDetail(id: string): TaskDetailData {
  const { data: rows, isLoading } = useQuery<TaskRow>(TASK_SQL, [id]);
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
  const row = rows?.[0] ?? null;
  const task = row ? toTask(row) : null;
  // The picker offers projects work can still go into; the label names the task's own project whatever its state.
  const allProjects = useMemo(
    () => withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", areaId: p.area_id, area: p.area, open: isOpenProject(p.state) })),
    [projectRows, areaRows],
  );
  const projects = useMemo(() => allProjects.filter((p) => p.open), [allProjects]);
  const project = allProjects.find((p) => p.id === task?.projectId) ?? null;
  // A project task's area is its project's; a loose task names its own (a project or an area, never both).
  const area = (areaRows ?? []).find((a) => a.id === (project ? project.areaId : task?.areaId)) ?? null;
  const areas = useMemo(() => (areaRows ?? []).map((a) => ({ id: a.id, name: a.name ?? "Untitled area" })), [areaRows]);
  const headings = useMemo(() => (headingRows ?? []).map((h) => ({ id: h.id, title: h.title ?? "Untitled heading" })), [headingRows]);
  return {
    task,
    row,
    missing: !isLoading && Boolean(rows) && rows.length === 0,
    project,
    area,
    projects,
    areas,
    headings,
    checklist,
    tags: tagRows ?? [],
    allTags: allTagRows ?? [],
    exceptions,
  };
}
