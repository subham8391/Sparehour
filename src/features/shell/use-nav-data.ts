"use client";
// Feeds the sidebar and tab bar from the local database: the two counts and
// the Areas → Projects tree, all reactive.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { AREAS_SQL, INBOX_COUNT_SQL, PROJECTS_SQL, TODAY_COUNT_SQL, groupProjects, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import type { NavCounts } from "./nav";
import type { NavArea } from "./sidebar";
import { useLocalDay, useNow } from "./use-local-day";

export function useNavData(): { counts: NavCounts; areas: NavArea[] } {
  const now = useNow();
  const { today } = useLocalDay(now);
  const todayIso = today.toString();
  const { data: inbox } = useQuery<{ n: number }>(INBOX_COUNT_SQL);
  const { data: todayCount } = useQuery<{ n: number }>(TODAY_COUNT_SQL, [todayIso, todayIso]);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const areas = useMemo(() => groupProjects(areaRows ?? [], projectRows ?? []), [areaRows, projectRows]);
  return { counts: { inbox: inbox?.[0]?.n ?? 0, today: todayCount?.[0]?.n ?? 0 }, areas };
}
