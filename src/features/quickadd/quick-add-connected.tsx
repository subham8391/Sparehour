"use client";
// The quick-add sheet with the lists it suggests from: projects (with their
// area, which tells two of one name apart) and tags. These queries ride in the
// sheet's own island with the parser, never in the shell's first download
// (SYSTEM_DESIGN.md §11.6); quick-add-provider.tsx fetches it in idle time.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { TAGS_SQL } from "@/data/queries/views";
import { QuickAdd, type QuickAddProps } from "./quick-add";

export function QuickAddConnected(props: Omit<QuickAddProps, "projects" | "tags">) {
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<{ id: string; name: string | null }>(TAGS_SQL);
  const projects = useMemo(() => {
    const areas = new Map((areaRows ?? []).map((a) => [a.id, a.name ?? "Untitled area"]));
    return (projectRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", area: p.area_id ? (areas.get(p.area_id) ?? null) : null }));
  }, [projectRows, areaRows]);
  const tags = useMemo(() => (tagRows ?? []).filter((t) => t.name).map((t) => ({ id: t.id, name: t.name as string })), [tagRows]);
  return <QuickAdd {...props} projects={projects} tags={tags} />;
}
