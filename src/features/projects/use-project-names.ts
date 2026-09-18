"use client";
// Project names by id, for the quiet meta run on rows in cross-project lists
// (DESIGN_SYSTEM.md §5 "Task row": the project name in ink-2). One reactive
// statement shared by Inbox, Upcoming, Someday and the Logbook.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { PROJECTS_SQL, type ProjectRow } from "@/data/queries/nav";

export function useProjectNames(): ReadonlyMap<string, string> {
  const { data } = useQuery<ProjectRow>(PROJECTS_SQL);
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p.name ?? "Untitled project"])), [data]);
}
