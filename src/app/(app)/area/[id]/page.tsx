"use client";
// An area (SCREENS.md §9): its name, its projects as cards — the open count,
// the summed estimate, the next deadline and a one-line progress bar ("3 done
// this week · 9 open") — with an "Add project" card last, then the tasks
// filed in the area directly as standard rows with an add row. The header's
// ⋯ deletes the area (its projects and loose tasks stay, without one).
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { keyBetween } from "@/core/ordering";
import type { TaskDraft } from "@/core/quickadd";
import { formatMinutes, localDate } from "@/core/time";
import { toTask } from "@/data/mappers";
import { AREA_PROJECT_CARDS_SQL, AREA_TASKS_SQL, progressLabel, weekProgress, type AreaProjectCardRow } from "@/data/queries/area";
import type { ProjectStateRow } from "@/data/queries/nav";
import { AREA_FINISHED_PROJECTS_SQL, AREA_SQL, logbookStream } from "@/data/queries/views";
import type { AreaRow, TaskRow as TaskRowType } from "@/data/schema.client";
import { FinishedProjects } from "@/features/projects/finished-projects";
import { useListSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { dayChip } from "@/features/tasks/day-chip";
import { InlineAdd } from "@/features/tasks/inline-add";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { DayChipTag } from "@/features/tasks/day-chip-tag";
import { RowAction } from "@/features/tasks/task-actions";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useAreaRepo, useProjectRepo } from "@/features/tasks/use-repos";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Loading } from "../../loading-view";
import { buttonClass } from "@/ui/button";
import { DeadlineChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";
import { CARD, EmptyCard } from "@/ui/list-card";
import { MENU_ITEM_DESTRUCTIVE, MenuButton } from "@/ui/popover";
import { SectionLabel } from "@/ui/section-label";

/** A project card: the list card's shell around a name and a line of figures, and no taller than the two of them. */
const PROJECT_CARD = cx(CARD, "flex h-full flex-col gap-1.5 p-4");

/** "Delete area…": the confirmation (with what stays) is loaded when it is first opened. */
const OrganiseSheet = dynamic(() => import("@/features/projects/organise-sheet").then((m) => m.OrganiseSheet), { ssr: false });

export default function AreaPage({ params }: PageProps<"/area/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const areaRepo = useAreaRepo();
  const projectRepo = useProjectRepo();
  const tasksRepo = useTaskRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const parseCtx = useMemo(() => ({ now, zone, today, eveningStartsAt: settings?.eveningStartsAt }), [now, zone, today, settings?.eveningStartsAt]);
  // The progress bars count what was finished in the last week, so the logbook's recent months are subscribed.
  const weekAgo = useMemo(() => `${today.subtract({ days: 7 }).toString()}T00:00:00.000Z`, [today]);
  const stream = useMemo(() => ({ ...logbookStream(today), ttl: 60 * 60 }), [today]);
  const { data: areas, isLoading } = useQuery<AreaRow>(AREA_SQL, [id]);
  const { data: projects } = useQuery<AreaProjectCardRow>(AREA_PROJECT_CARDS_SQL, [settings?.defaultEstimateMin ?? 30, id, weekAgo], { streams: [stream] });
  const { data: finished } = useQuery<ProjectStateRow>(AREA_FINISHED_PROJECTS_SQL, [id]);
  const { data: taskRows } = useQuery<TaskRowType>(AREA_TASKS_SQL, [id]);
  const tasks = useMemo(() => (taskRows ?? []).map(toTask), [taskRows]);
  const sel = useListSelection([tasks.map((t) => t.id)]);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState("");
  const area = areas?.[0];

  if (!isLoading && !area) {
    return (
      <main className={VIEW_COLUMN}>
        <ViewHeader eyebrow="Area" title="Not here" />
        <EmptyCard
          action={
            <Link href="/browse" className={buttonClass({ variant: "link" })}>
              Browse
              <Icon name="chevron-right" size={16} className="text-ink-3" />
            </Link>
          }
        >
          This area isn&rsquo;t on this device.
        </EmptyCard>
      </main>
    );
  }
  if (!area) return <Loading />;

  const createProject = () => {
    const n = name.trim();
    setAdding(false);
    setName("");
    if (!n || !area.space_id) return;
    void projectRepo.create(n, { spaceId: area.space_id, areaId: area.id });
  };
  const addTask = (draft: TaskDraft) => {
    if (area.space_id) void tasksRepo.create(draft, { spaceId: area.space_id, areaId: area.id });
  };
  // Drag-to-reorder among the loose tasks, and Move up / Move down as its tap path.
  const keyed = tasks.map((t) => ({ id: t.id, key: t.sortKey }));
  const dropOn = (sourceId: string, targetId: string, edge: Edge) => {
    const plan = planDrop(keyed, sourceId, targetId, edge);
    if (plan) void tasksRepo.setOrder(sourceId, plan.key);
  };
  const move = (taskId: string, dir: -1 | 1) => {
    const i = tasks.findIndex((x) => x.id === taskId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= tasks.length) return;
    const before = dir === -1 ? tasks[j - 1] : tasks[j];
    const after = dir === -1 ? tasks[j] : tasks[j + 1];
    void tasksRepo.setOrder(taskId, keyBetween(before?.sortKey ?? null, after?.sortKey ?? null));
  };

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader
        eyebrow="Area"
        title={<InlineTitle value={area.name ?? "Untitled area"} label="Area name" onSave={(n) => void areaRepo.rename(area.id, n)} className="font-display text-title font-book text-balance text-ink" />}
        subtitle={projects ? <span className="num">{`${projects.length} ${projects.length === 1 ? "project" : "projects"}`}</span> : undefined}
        compactActions={
          <MenuButton label="Area actions">
            {(close) => (
              <button type="button" role="menuitem" className={MENU_ITEM_DESTRUCTIVE} onClick={() => (setDeleting(true), close())}>
                Delete area…
              </button>
            )}
          </MenuButton>
        }
      />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(projects ?? []).map((p) => {
          const share = weekProgress(p.done_week, p.open_count);
          return (
            <li key={p.id}>
              <Link href={`/project/${p.id}`} className={cx(PROJECT_CARD, "transition-colors dur-fast hover:border-line-strong active:bg-press")}>
                <span className="text-body-lg font-medium text-ink">{p.name ?? "Untitled project"}</span>
                {/* One static line (DESIGN_SYSTEM.md §8: progress bars do not animate); the words beside it carry the figures. */}
                <span aria-hidden="true" data-testid="project-progress" className="h-1 w-full overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full bg-ink-3" style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
                <span className="flex flex-wrap items-center gap-2 text-body-sm text-ink-2 num">
                  <span>
                    {progressLabel(p.done_week, p.open_count)}
                    {p.open_count > 0 && ` · ~${formatMinutes(p.open_min)}`}
                  </span>
                  {(p.next_deadline ?? p.deadline) && <DeadlineChip deadline={localDate((p.next_deadline ?? p.deadline) as string)} today={today} />}
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProject();
              }}
              className={cx(PROJECT_CARD, "border-ink")}
            >
              <input
                autoFocus
                aria-label="Project name"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={createProject}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setName("");
                    setAdding(false);
                  }
                }}
                className="bg-transparent text-base font-medium text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none sm:text-body-lg"
              />
              <span className="text-label text-ink-3">Enter to create · Esc to cancel</span>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cx(PROJECT_CARD, "min-h-11 w-full flex-row items-center justify-center gap-2 text-body-lg text-ink-2 transition-colors dur-fast hover:border-line-strong hover:text-ink active:bg-press")}
            >
              <Icon name="plus" size={16} /> Add project
            </button>
          )}
        </li>
      </ul>

      {/* Tasks filed in the area directly, with no project (PRODUCT_SPEC.md §4, SCREENS.md §9). */}
      <section aria-label={`Tasks in ${area.name ?? "this area"}`} className="flex flex-col gap-2">
        <SectionLabel className="px-0.5">Tasks</SectionLabel>
        <TaskList>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              draggable
              onDropTask={(src, edge) => dropOn(src, t.id, edge)}
              onOpen={() => detail.open(t.id)}
              selected={sel.selectedId === t.id}
              onSelect={() => sel.select(t.id)}
              onDone={() => void tasksRepo.complete(t.id)}
              chips={<DayChipTag chip={dayChip(t, today)} count={false} />}
              actions={
                <>
                  <RowAction label="Move up" text={null} icon="arrow-up" onClick={() => move(t.id, -1)} />
                  <RowAction label="Move down" text={null} icon="arrow-down" onClick={() => move(t.id, 1)} />
                </>
              }
            />
          ))}
          <InlineAdd ctx={parseCtx} onAdd={addTask} placeholder={`Add to ${area.name ?? "this area"}`} />
        </TaskList>
      </section>

      {/* Finished projects stay reachable from their area, collapsed (PRODUCT_SPEC.md §6). */}
      <FinishedProjects projects={finished ?? []} />
      {deleting && <OrganiseSheet target={{ kind: "area", id: area.id, name: area.name ?? "Untitled area" }} step="delete" onClose={() => setDeleting(false)} onDeleted={() => router.push("/browse")} />}
    </main>
  );
}
