"use client";
// What an area's page reads (SCREENS.md §9): the area, its active projects as cards with their figures, its completed
// and archived projects, and the open tasks filed in it directly. One hook for the web page and the Android app's
// area screen (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import type { LocalDate } from "@/core/time";
import { toTask } from "@/data/mappers";
import { AREA_PROJECT_CARDS_SQL, AREA_TASKS_SQL, type AreaProjectCardRow } from "@/data/queries/area";
import type { ProjectStateRow } from "@/data/queries/nav";
import { AREA_FINISHED_PROJECTS_SQL, AREA_SQL, logbookStream } from "@/data/queries/views";
import type { AreaRow, TaskRow } from "@/data/schema.client";

export function useAreaPage(id: string, today: LocalDate, defaultEstimateMin: number) {
  // The progress bars count what was finished in the last week, so the logbook's recent months are subscribed.
  const weekAgo = useMemo(() => `${today.subtract({ days: 7 }).toString()}T00:00:00.000Z`, [today]);
  const stream = useMemo(() => ({ ...logbookStream(today), ttl: 60 * 60 }), [today]);
  const { data: areas, isLoading } = useQuery<AreaRow>(AREA_SQL, [id]);
  const { data: projects } = useQuery<AreaProjectCardRow>(AREA_PROJECT_CARDS_SQL, [defaultEstimateMin, id, weekAgo], { streams: [stream] });
  const { data: finished } = useQuery<ProjectStateRow>(AREA_FINISHED_PROJECTS_SQL, [id]);
  const { data: taskRows } = useQuery<TaskRow>(AREA_TASKS_SQL, [id]);
  const tasks = useMemo(() => (taskRows ?? []).map(toTask), [taskRows]);
  return {
    /** Undefined while it loads, and when it is not on this device (`isLoading` tells the two apart). */
    area: areas?.[0],
    /** The active projects' cards; undefined until they have been read. */
    projects,
    finished: finished ?? [],
    /** The area's loose open tasks, in their list order. */
    tasks,
    isLoading,
  };
}
