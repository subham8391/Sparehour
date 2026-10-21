"use client";
// The quick-add sheet with the lists it suggests from: projects (with their
// area, which tells two of one name apart) and tags, and the Lists "Save to"
// offers (DECISIONS.md, amendment 2026-10-22), opening on the list whose page
// is showing. These queries ride in the sheet's own island with the parser,
// never in the shell's first download (SYSTEM_DESIGN.md §11.6);
// quick-add-provider.tsx fetches it in idle time.
import { usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useQuery, type LocalDatabase } from "@/data/powersync";
import { LISTS_NAV_SQL, listPaths, type ListNavRow } from "@/data/queries/lists";
import { ProjectRepo } from "@/data/repositories/project-repo";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { withAreaNames } from "@/data/queries/project-label";
import { TAGS_SQL } from "@/data/queries/views";
import { useListRepos } from "@/features/lists/use-list-repos";
import { QuickAdd, type QuickAddProps } from "./quick-add";

export function QuickAddConnected(props: Omit<QuickAddProps, "projects" | "tags" | "lists" | "initialList" | "onSaveToList">) {
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<{ id: string; name: string | null }>(TAGS_SQL);
  const projects = useMemo(() => withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", area: p.area })), [projectRows, areaRows]);
  const tags = useMemo(() => (tagRows ?? []).filter((t) => t.name).map((t) => ({ id: t.id, name: t.name as string })), [tagRows]);
  const { data: listRows } = useQuery<ListNavRow>(LISTS_NAV_SQL);
  const lists = useMemo(() => listPaths(listRows ?? []).map((l) => ({ id: l.id, label: l.label })), [listRows]);
  const { items } = useListRepos();
  const onSaveToList = useCallback(
    async (listId: string, titles: readonly string[]) => {
      // The item takes its list's space (data/repositories/list-item-repo.ts writes it on the row).
      const space = (await items.spaceOf(listId)) ?? null;
      if (!space) throw new Error("That list isn't on this device any more.");
      await items.add(listId, space, titles);
    },
    [items],
  );
  // On a list's own page the sheet opens on that list.
  const here = /^\/list\/([^/]+)$/.exec(usePathname() ?? "")?.[1] ?? null;
  return <QuickAdd {...props} projects={projects} tags={tags} lists={lists} initialList={here} onSaveToList={onSaveToList} />;
}

/**
 * The project a line names with "+New project": made from the sheet's island, which is in memory whenever a line is
 * sent, so the shell (quick-add-provider.tsx) carries no ProjectRepo (SYSTEM_DESIGN.md §11.6).
 */
export function createProject(db: LocalDatabase, name: string, spaceId: string): Promise<string> {
  return new ProjectRepo(db).create(name, { spaceId });
}
