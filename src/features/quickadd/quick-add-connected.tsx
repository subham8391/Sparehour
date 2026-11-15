"use client";
// The quick-add sheet with what it suggests from: projects (with their
// area, which tells two of one name apart) and tags. These queries ride in
// the sheet's own island with the parser,
// never in the shell's first download (SYSTEM_DESIGN.md §11.6);
// quick-add-provider.tsx fetches it in idle time.
import { useCallback, useMemo } from "react";
import { suggestEstimate } from "@/core/estimates";
import { useQuery, type LocalDatabase } from "@/data/powersync";
import { ProjectRepo } from "@/data/repositories/project-repo";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { withAreaNames } from "@/data/queries/project-label";
import { TAGS_SQL } from "@/data/queries/views";
import type { TaskDraft } from "@/core/quickadd";
import { useLearned } from "@/features/estimates/use-learned";
import { useLocalDay } from "@/features/shell/use-local-day";
import { DayLine } from "./day-line";
import { QuickAdd, type QuickAddProps } from "./quick-add";

export function QuickAddConnected(props: Omit<QuickAddProps, "projects" | "tags" | "dayLine" | "usual">) {
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<{ id: string; name: string | null }>(TAGS_SQL);
  const projects = useMemo(() => withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", area: p.area })), [projectRows, areaRows]);
  const tags = useMemo(() => (tagRows ?? []).filter((t) => t.name).map((t) => ({ id: t.id, name: t.name as string })), [tagRows]);
  // What the line would do to its day's spare time, before it is saved (DECISIONS.md, amendment 2026-11-14).
  const { now, today } = props.ctx;
  const dayLine = useCallback((draft: TaskDraft) => <DayLine draft={draft} now={now} today={today} />, [now, today]);
  // What finished tasks say about the line's estimate (DECISIONS.md, amendment 2026-11-15): from the device's kept answer.
  const learned = useLearned();
  const defaultEstimate = useLocalDay(now).settings?.defaultEstimateMin ?? 30;
  const usual = useCallback((task: { estimateMin: number | null; projectId: string | null }) => suggestEstimate(learned, task, defaultEstimate)?.minutes ?? null, [learned, defaultEstimate]);
  return <QuickAdd {...props} projects={projects} tags={tags} dayLine={dayLine} usual={usual} />;
}

/**
 * The project a line names with "+New project": made from the sheet's island, which is in memory whenever a line is
 * sent, so the shell (quick-add-provider.tsx) carries no ProjectRepo (SYSTEM_DESIGN.md §11.6).
 */
export function createProject(db: LocalDatabase, name: string, spaceId: string): Promise<string> {
  return new ProjectRepo(db).create(name, { spaceId });
}
