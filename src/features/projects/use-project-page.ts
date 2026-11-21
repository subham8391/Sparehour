"use client";
// What a project's page reads and how it puts it together (SCREENS.md §9): the project, its area, its headings, its
// open and parked tasks, what each section finished in the last week, and the header's figures. One hook for the web
// page and the Android app's project screen (docs/mobile/ANDROID_APP_SPEC.md §4.3), so both list the same tasks under
// the same headings in the same order.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import type { LocalDate } from "@/core/time";
import { toHeading, toProject, toTask } from "@/data/mappers";
import { AREAS_SQL, type AreaRow } from "@/data/queries/nav";
import { PROJECT_DONE_SQL, PROJECT_HEADINGS_SQL, PROJECT_SQL, PROJECT_TASKS_SQL, doneByHeading, logbookStream } from "@/data/queries/views";
import type { HeadingRow, ProjectRow, TaskRow } from "@/data/schema.client";
import { groupByHeading, summarise } from "./organise";

export function useProjectPage(id: string, today: LocalDate, defaultEstimateMin: number) {
  const { data: projectRows, isLoading } = useQuery<ProjectRow>(PROJECT_SQL, [id]);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: headingRows } = useQuery<HeadingRow>(PROJECT_HEADINGS_SQL, [id]);
  const { data: taskRows, isLoading: loadingTasks } = useQuery<TaskRow>(PROJECT_TASKS_SQL, [id]);
  // Each heading's "Show completed · N" counts what was finished in the last week, so the week is always on hand.
  const weekAgo = useMemo(() => `${today.subtract({ days: 7 }).toString()}T00:00:00.000Z`, [today]);
  const { data: doneRows } = useQuery<TaskRow>(PROJECT_DONE_SQL, [id, weekAgo], { streams: [{ ...logbookStream(today), ttl: 60 * 60 }] });

  const project = projectRows?.[0] ? toProject(projectRows[0]) : null;
  const area = (areaRows ?? []).find((a) => a.id === project?.areaId) ?? null;
  const headings = useMemo(() => (headingRows ?? []).map(toHeading), [headingRows]);
  const tasks = useMemo(() => (taskRows ?? []).map(toTask), [taskRows]);
  const open = useMemo(() => tasks.filter((t) => t.state === "inbox" || t.state === "active"), [tasks]);
  const someday = useMemo(() => tasks.filter((t) => t.state === "someday"), [tasks]);
  const done = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  const groups = useMemo(() => groupByHeading(open, headings), [open, headings]);
  const doneGroups = useMemo(() => doneByHeading(done, new Set(headings.map((h) => h.id))), [done, headings]);
  const summary = summarise(tasks, defaultEstimateMin);

  return {
    /** null while it loads, and when it is not on this device (`isLoading` tells the two apart). */
    project,
    area,
    headings,
    /** Open and parked tasks, in the project's own order. */
    tasks,
    someday,
    /** The open tasks: those under no heading first, then each heading in its order. */
    groups,
    /** What each section finished in the last week, by heading id ("" for the tasks under no heading). */
    doneGroups,
    summary,
    isLoading,
    loadingTasks,
  };
}
