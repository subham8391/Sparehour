"use client";
// Project names by id, for the quiet meta run on rows in cross-project lists
// (DESIGN_SYSTEM.md §5 "Task row": the project name in ink-2). One reactive
// statement shared by Inbox, Today, Upcoming, Someday and the Logbook. It
// reads every project that exists, finished ones included: completing or
// archiving a project keeps its open tasks, and they keep saying where they
// belong (PRODUCT_SPEC.md §6 "Archiving is reversible and keeps everything").
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { ALL_PROJECTS_SQL, type ProjectStateRow } from "@/data/queries/nav";

export function useProjectNames(): ReadonlyMap<string, string> {
  const { data } = useQuery<ProjectStateRow>(ALL_PROJECTS_SQL);
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p.name ?? "Untitled project"])), [data]);
}
