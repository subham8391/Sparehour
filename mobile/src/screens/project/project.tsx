// A project's page on the phone (ANDROID_APP_SPEC.md §9; the web's app/(app)/project/[id]/page.tsx), at /project/<id>
// and wired to the phone's own database. What it reads and how that is put together is the web page's own hook
// (features/projects/use-project-page.ts); the ⋯'s actions, the figures and where a task or a heading lands are the
// web's rules (page-rules.ts, organise-place.ts, checklist-order.ts); what every row's ⋯, its swipes and the bulk bar
// do is the screen's frame (rows/rows.tsx); a new task is read by the shared
// quick-add parser and filed by the shared repository; and every write goes through the shared repositories, which
// record the undo the app's one toast offers. `?add=1` opens with the add sheet up. The drawing is project-view.tsx.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import type { Heading } from "@/core/types";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { AREAS_SQL, PROJECTS_SQL, groupProjects, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { duplicateProject } from "@/data/repositories/duplicate";
import { dayPart } from "@/features/looks/look";
import { moveToArea, placeOf } from "@/features/projects/organise-place";
import { keyAtEndOf, projectActions, summaryWords, type ProjectAction } from "@/features/projects/page-rules";
import { useProjectPage } from "@/features/projects/use-project-page";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { keyForStep } from "@/features/tasks/checklist-order";
import { useHeadingRepo, useProjectOrderRepo, useProjectRepo } from "@/features/tasks/use-repos";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-context";
import { useQuickAdd } from "../quick-add/quick-add";
import { Rows } from "../rows/rows";
import { ProjectMissingView, ProjectOpeningView, ProjectView } from "./project-view";

export function ProjectPage() {
  const params = useLocalSearchParams<{ id: string; add?: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const router = useRouter();
  const db = useLocalDatabase() as LocalDatabase;
  const undo = useUndoSink();
  const tasks = useTaskRepo();
  const projects = useProjectRepo();
  const headings = useHeadingRepo();
  const projectOrder = useProjectOrderRepo();
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const page = useProjectPage(id, today, settings?.defaultEstimateMin ?? 30);
  // The navigation's own tree: where "Move to area…" puts the project, and the areas it lists.
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const tree = useMemo(() => groupProjects(areaRows ?? [], projectRows ?? []), [areaRows, projectRows]);
  const areas = useMemo(() => tree.filter((g) => !g.loose).map((g) => ({ id: g.id, name: g.name })), [tree]);
  // Adding here is the app's one quick add, opened in this project (and under the heading whose add line was tapped).
  const quickAdd = useQuickAdd();
  const projectId = page.project?.id;
  // `?add=1` opens with it up: a task just broken down into this project is ready for the first step it did not have.
  const openedForAdd = useRef(false);
  useEffect(() => {
    if (params.add !== "1" || !projectId || openedForAdd.current) return;
    openedForAdd.current = true;
    quickAdd.open({ projectId });
  }, [params.add, projectId, quickAdd]);

  const { project } = page;
  if (!page.isLoading && !project) return <ProjectMissingView onBrowse={() => router.replace("/browse")} />;
  if (!project || page.loadingTasks) return <ProjectOpeningView />;

  const act = (action: ProjectAction) => {
    if (action.state) return void projects.setState(project.id, action.state);
    // A copy named "… (copy)" with its headings and open tasks, which then opens over this one.
    if (action.id === "duplicate") void duplicateProject(db, undo ?? undefined, project.id).then((copy) => copy && router.push(`/project/${copy}`));
  };
  const moveTo = (areaId: string | null) => {
    const move = moveToArea(tree, placeOf(tree, { kind: "project", id: project.id, name: project.name }), areaId);
    if (move) void projectOrder.move(project.id, move.to, move.areaName);
  };

  return (
    <Rows>
      <ProjectView
        project={project}
        area={page.area ? { id: page.area.id, name: page.area.name ?? "Untitled area" } : null}
        part={dayPart(now.toZonedDateTimeISO(zone).hour)}
        today={today}
        now={now}
        zone={zone}
        defaultEstimateMin={settings?.defaultEstimateMin ?? 30}
        summary={summaryWords(page.summary)}
        empty={page.tasks.length === 0}
        groups={page.groups}
        done={page.doneGroups}
        someday={page.someday}
        actions={projectActions(project.state)}
        areas={areas}
        onRename={(name) => void projects.rename(project.id, name)}
        onNotes={(notes) => void projects.setNotes(project.id, notes)}
        onDeadline={(deadline) => void projects.setDeadline(project.id, deadline)}
        onOpenArea={(areaId) => router.push(`/area/${areaId}`)}
        onAction={act}
        onMoveToArea={moveTo}
        onAdd={(heading: Heading | null) => quickAdd.open({ projectId: project.id, headingId: heading?.id })}
        onComplete={(task) => void tasks.complete(task.id)}
        onOpen={(task) => router.push(`/task/${task.id}`)}
        // The tap path for the web's drag: one key written, one place up or down inside the section.
        onMoveTask={(task, headingId, dir) => {
          const group = page.groups.find((g) => (g.heading?.id ?? null) === headingId);
          const key = group ? keyForStep(group.tasks, task.id, dir) : null;
          if (key) void tasks.setOrder(task.id, key);
        }}
        onTaskHeading={(task, headingId) => void tasks.setOrder(task.id, keyAtEndOf(page.groups, headingId), headingId)}
        onToday={(task) => void tasks.reschedule(task.id, today)}
        onTomorrow={(task) => void tasks.reschedule(task.id, today.add({ days: 1 }))}
        onAddHeading={(title) => void headings.create(project.id, project.spaceId, title)}
        onRenameHeading={(headingId, title) => void headings.rename(headingId, title)}
        // A heading moves with its tasks, since they are filed under it: one key.
        onMoveHeading={(headingId, dir) => {
          const key = keyForStep(page.headings, headingId, dir);
          if (key) void headings.reorder(headingId, key);
        }}
        onRemoveHeading={(headingId) => void headings.remove(headingId)}
      />
    </Rows>
  );
}
