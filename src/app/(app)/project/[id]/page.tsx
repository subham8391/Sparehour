"use client";
// A project (SCREENS.md §9): headings as section dividers, tasks in the
// project's own order with a day chip per row, an add row under every
// section, completed tasks tucked away, Someday collapsed at the bottom.
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import type { TaskDraft } from "@/core/quickadd";
import { formatMinutes, localDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Heading } from "@/core/types";
import { toHeading, toProject, toTask } from "@/data/mappers";
import { AREAS_SQL, type AreaRow } from "@/data/queries/nav";
import { PROJECT_DONE_SQL, PROJECT_HEADINGS_SQL, PROJECT_SQL, PROJECT_TASKS_SQL, monthsBack } from "@/data/queries/views";
import { HeadingRepo } from "@/data/repositories/heading-repo";
import { ProjectRepo } from "@/data/repositories/project-repo";
import type { HeadingRow, ProjectRow, TaskRow as TaskRowType } from "@/data/schema.client";
import { groupByHeading, summarise, type HeadingGroup } from "@/features/projects/organise";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { useListSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, ViewHeader } from "@/features/shell/view-header";
import { dayChip } from "@/features/tasks/day-chip";
import { InlineAdd } from "@/features/tasks/inline-add";
import { DayChipTag, MoveActions } from "@/features/tasks/task-actions";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";
import { FIELD_INPUT, MENU_ITEM, MenuButton } from "@/ui/popover";

const NOTHING_SQL = `select * from tasks where 0`;

export default function ProjectPage({ params }: PageProps<"/project/[id]">) {
  const { id } = use(params);
  const db = useLocalDatabase();
  const tasksRepo = useTaskRepo();
  const projectRepo = useMemo(() => new ProjectRepo(db), [db]);
  const headingRepo = useMemo(() => new HeadingRepo(db), [db]);
  const detail = useTaskDetail();
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const parseCtx = useMemo(() => ({ now, zone, eveningStartsAt: settings?.eveningStartsAt }), [now, zone, settings?.eveningStartsAt]);

  const { data: projectRows, isLoading } = useQuery<ProjectRow>(PROJECT_SQL, [id]);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: headingRows } = useQuery<HeadingRow>(PROJECT_HEADINGS_SQL, [id]);
  const { data: taskRows } = useQuery<TaskRowType>(PROJECT_TASKS_SQL, [id]);
  const [showDone, setShowDone] = useState(false);
  const [showSomeday, setShowSomeday] = useState(false);
  const [notesOpen, setNotesOpen] = useState<boolean | null>(null);
  const [newHeading, setNewHeading] = useState("");
  const months = useMemo(() => monthsBack(today, 3), [today]);
  const { data: doneRows } = useQuery<TaskRowType>(showDone ? PROJECT_DONE_SQL : NOTHING_SQL, showDone ? [id] : [], {
    streams: showDone ? [{ name: "logbook", parameters: { months }, ttl: 60 * 60 }] : undefined,
  });

  const project = projectRows?.[0] ? toProject(projectRows[0]) : null;
  const area = (areaRows ?? []).find((a) => a.id === project?.areaId) ?? null;
  const headings = useMemo(() => (headingRows ?? []).map(toHeading), [headingRows]);
  const tasks = useMemo(() => (taskRows ?? []).map(toTask), [taskRows]);
  const open = useMemo(() => tasks.filter((t) => t.state === "inbox" || t.state === "active"), [tasks]);
  const someday = useMemo(() => tasks.filter((t) => t.state === "someday"), [tasks]);
  const done = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  const groups = useMemo(() => groupByHeading(open, headings), [open, headings]);
  const summary = summarise(tasks, settings?.defaultEstimateMin ?? 30);
  const notesShown = notesOpen ?? Boolean(project?.notes);
  const sel = useListSelection([...groups.flatMap((g) => g.tasks.map((t) => t.id)), ...done.map((t) => t.id), ...someday.map((t) => t.id)]);

  if (!isLoading && !project) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
        <ViewHeader eyebrow="Project" title="Not here" />
        <EmptyState>
          This project isn&rsquo;t on this device.{" "}
          <Link href="/browse" className="font-medium text-ink underline">
            Browse
          </Link>
        </EmptyState>
      </main>
    );
  }
  if (!project) return <main className="p-6 text-ink-3 md:p-10">Opening…</main>;

  const add = (draft: TaskDraft, headingId: string | null) => void tasksRepo.create(draft, { spaceId: project.spaceId, projectId: project.id, headingId });
  // Drag-to-reorder within a section, or into another section (the row takes that heading).
  const dropInto = (g: HeadingGroup) => (sourceId: string, targetId: string, edge: Edge) => {
    const plan = planDrop(
      g.tasks.map((x) => ({ id: x.id, key: x.sortKey })),
      sourceId,
      targetId,
      edge,
    );
    if (plan) void tasksRepo.setOrder(sourceId, plan.key, g.heading?.id ?? null);
  };
  const addHeading = () => {
    const title = newHeading.trim();
    if (!title) return;
    void headingRepo.create(project.id, project.spaceId, title);
    setNewHeading("");
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader
        eyebrow={
          area ? (
            <Link href={`/area/${area.id}`} className="inline-flex min-h-6 items-center hover:text-ink">
              {area.name}
            </Link>
          ) : (
            "Project"
          )
        }
        title={<InlineTitle value={project.name} label="Project name" onSave={(name) => void projectRepo.rename(project.id, name)} className="font-display text-3xl leading-tight text-ink" />}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {summary.open} open · ~{formatMinutes(summary.minutes)}
            </span>
            {project.deadline && (
              <span className="flex items-center gap-1 rounded-md bg-deadline-soft px-2 py-0.5 text-xs font-medium text-deadline">
                <Icon name="flag" size={11} /> {formatDay(project.deadline, { today })}
              </span>
            )}
            {project.state !== "active" && <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">{project.state}</span>}
          </span>
        }
        actions={
          <MenuButton label="Project actions">
            {(close) => (
              <>
                <label className="flex flex-col gap-1 px-2.5 py-1.5 text-[12.5px] text-ink-2">
                  Deadline
                  <input type="date" aria-label="Project deadline" value={project.deadline?.toString() ?? ""} onChange={(e) => void projectRepo.setDeadline(project.id, e.target.value ? localDate(e.target.value) : null)} className={FIELD_INPUT} />
                </label>
                {project.state === "active" ? (
                  <>
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (void projectRepo.setState(project.id, "done"), close())}>
                      Mark complete
                    </button>
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (void projectRepo.setState(project.id, "someday"), close())}>
                      Move to Someday
                    </button>
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (void projectRepo.setState(project.id, "archived"), close())}>
                      Archive
                    </button>
                  </>
                ) : (
                  <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (void projectRepo.setState(project.id, "active"), close())}>
                    Back to active
                  </button>
                )}
              </>
            )}
          </MenuButton>
        }
      />

      <section className="rounded-xl border border-line bg-surface">
        <button type="button" onClick={() => setNotesOpen(!notesShown)} aria-expanded={notesShown} className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          <Icon name={notesShown ? "chevron-down" : "chevron-right"} size={14} /> Notes
          {!notesShown && project.notes && <span className="truncate font-sans text-[13px] font-normal normal-case tracking-normal text-ink-2">{project.notes}</span>}
        </button>
        {notesShown && (
          <textarea
            aria-label="Project notes"
            defaultValue={project.notes ?? ""}
            onBlur={(e) => {
              if ((e.target.value.trim() || null) !== (project.notes ?? null)) void projectRepo.setNotes(project.id, e.target.value);
            }}
            placeholder="What this project is for, links, decisions."
            rows={3}
            className="w-full resize-y border-t border-line bg-transparent px-4 py-3 text-[14px] leading-relaxed text-ink outline-none"
          />
        )}
      </section>

      {tasks.length === 0 && (
        <EmptyState>
          Nothing in this project yet. <span className="text-ink-3">Add the first task below.</span>
        </EmptyState>
      )}

      {groups.map((g) => (
        <section key={g.heading?.id ?? "loose"} className="flex flex-col gap-2">
          {g.heading && <HeadingRow heading={g.heading} onRename={(t) => void headingRepo.rename(g.heading!.id, t)} onRemove={() => void headingRepo.remove(g.heading!.id)} />}
          <TaskList>
            {g.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                draggable
                onDropTask={(src, edge) => dropInto(g)(src, t.id, edge)}
                onOpen={() => detail.open(t.id)}
                selected={sel.selectedId === t.id}
                onSelect={() => sel.select(t.id)}
                onDone={() => void tasksRepo.complete(t.id)}
                meta={<DayChipTag chip={dayChip(t, today)} />}
              />
            ))}
            <InlineAdd ctx={parseCtx} onAdd={(d) => add(d, g.heading?.id ?? null)} placeholder={g.heading ? `Add to ${g.heading.title}` : "Add a task"} autoFocus={tasks.length === 0 && !g.heading} />
          </TaskList>
        </section>
      ))}

      <div className="flex min-h-11 items-center gap-3 px-4">
        <Icon name="plus" size={16} className="shrink-0 text-ink-3" />
        <input
          aria-label="Add a heading"
          placeholder="Add a heading"
          value={newHeading}
          onChange={(e) => setNewHeading(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addHeading();
            }
          }}
          onBlur={addHeading}
          className="h-11 flex-1 bg-transparent text-[13px] font-semibold uppercase tracking-[0.08em] text-ink outline-none placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-3"
        />
      </div>

      <section className="flex flex-col gap-2">
        <button type="button" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone} className="flex min-h-11 items-center gap-2 self-start px-0.5 text-[13px] text-ink-2 hover:text-ink">
          <Icon name={showDone ? "chevron-down" : "chevron-right"} size={14} />
          {showDone ? `Hide completed${done.length ? ` · ${done.length}` : ""}` : "Show completed"}
        </button>
        {showDone &&
          (done.length === 0 ? (
            <p className="px-4 text-[13px] text-ink-3">Nothing completed in the last {months.length} months.</p>
          ) : (
            <TaskList>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => detail.open(t.id)} selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)} />
              ))}
            </TaskList>
          ))}
      </section>

      {someday.length > 0 && (
        <section className="flex flex-col gap-2">
          <button type="button" onClick={() => setShowSomeday((s) => !s)} aria-expanded={showSomeday} className="flex min-h-11 items-center gap-2 self-start px-0.5 text-[13px] text-ink-2 hover:text-ink">
            <Icon name={showSomeday ? "chevron-down" : "chevron-right"} size={14} />
            Someday in this project · {someday.length}
          </button>
          {showSomeday && (
            <TaskList>
              {someday.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={() => detail.open(t.id)} selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)}
                  onDone={() => void tasksRepo.complete(t.id)}
                  actions={<MoveActions onToday={() => void tasksRepo.reschedule(t.id, today)} onTomorrow={() => void tasksRepo.reschedule(t.id, today.add({ days: 1 }))} />}
                />
              ))}
            </TaskList>
          )}
        </section>
      )}
    </main>
  );
}

function HeadingRow({ heading, onRename, onRemove }: { heading: Heading; onRename: (title: string) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 px-0.5">
      <InlineTitle as="h2" value={heading.title} label={`Heading ${heading.title}`} onSave={onRename} className="min-w-0 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3" />
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <button type="button" onClick={onRemove} aria-label={`Delete heading ${heading.title}`} title="Delete heading (tasks move up)" className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
