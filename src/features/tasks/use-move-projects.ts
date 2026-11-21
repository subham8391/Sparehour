"use client";
// The projects a picker files into, read for it: the open ones, each with its area's name, and the areas in sidebar
// order (their names head the picker's groups). Free of any picker's screen parts, so triage's project picker on the
// web (features/inbox/triage-sheet.tsx) and the Android app's read the same list (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { withAreaNames } from "@/data/queries/project-label";
import type { MoveProject } from "./move-options";

/** Nothing is read while `wanted` is false (a picker that is not open). */
export function useMoveProjects(wanted = true): { projects: MoveProject[]; areaOrder: { id: string; name: string }[] } {
  const { data: projectRows } = useQuery<ProjectRow>(wanted ? PROJECTS_SQL : `select id, name from projects where 0`);
  const { data: areaRows } = useQuery<AreaRow>(wanted ? AREAS_SQL : `select id, name from areas where 0`);
  const projects = useMemo(
    () => withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", area: p.area, areaId: p.area_id })),
    [projectRows, areaRows],
  );
  const areaOrder = useMemo(() => (areaRows ?? []).map((a) => ({ id: a.id, name: a.name ?? "Untitled area" })), [areaRows]);
  return { projects, areaOrder };
}
