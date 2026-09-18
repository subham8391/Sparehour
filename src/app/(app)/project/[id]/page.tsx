"use client";
// A project (SCREENS.md §9): headings as section dividers, tasks in the
// project's own order with a day chip per row, an add row under every
// section, completed tasks tucked away, Someday collapsed at the bottom.
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import type { TaskDraft } from "@/core/quickadd";
import { formatMinutes, localDate } from "@/core/time";
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
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { dayChip } from "@/features/tasks/day-chip";
import { InlineAdd } from "@/features/tasks/inline-add";
import { DayChipTag, MoveActions } from "@/features/tasks/task-actions";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { buttonClass } from "@/ui/button";
import { Chip, DeadlineChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";
import { EmptyCard, ListCard } from "@/ui/list-card";
import { FIELD_INPUT, MENU_ITEM, MenuButton } from "@/ui/popover";
import { EYEBROW } from "@/ui/section-label";

const NOTHING_SQL = `select * from tasks where 0`;
/** The view's h1, editable in place: the same face and step as every other screen title. */
const TITLE = "font-display text-title font-book text-ink";
/** A disclosure line under a list: 44 px on the phone, 36 above, pulled out to the column's edge like a section action. */
const DISCLOSURE = "-ml-2 flex h-11 items-center gap-1.5 self-start rounded-sm px-2 text-body-sm font-medium text-ink-2 transition-[background-color,color] dur-fast hover:bg-hover hover:text-ink sm:h-9";

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
  const sel = useListSelection([...groups.map((g) => g.tasks.map((t) => t.id)), done.map((t) => t.id), someday.map((t) => t.id)]);

  if (!isLoading && !project) {
    return (
      <main className={VIEW_COLUMN}>
        <ViewHeader eyebrow="Project" title="Not here" />
        <EmptyCard
          action={
            <Link href="/browse" className={buttonClass({ variant: "link" })}>
              Browse
              <Icon name="chevron-right" size={16} className="text-ink-3" />
            </Link>
          }
        >
          This project isn&rsquo;t on this device.
        </EmptyCard>
      </main>
    );
  }
  if (!project) return <main className={cx(VIEW_COLUMN, "text-body text-ink-3")}>Opening…</main>;

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
    <main className={VIEW_COLUMN}>
      <ViewHeader
        eyebrow={
          area ? (
            <Link href={`/area/${area.id}`} className="inline-flex min-h-11 items-center rounded-sm transition-colors dur-fast hover:text-ink sm:min-h-6">
              {area.name}
            </Link>
          ) : (
            "Project"
          )
        }
        title={<InlineTitle value={project.name} label="Project name" onSave={(name) => void projectRepo.rename(project.id, name)} className={TITLE} />}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="num">
              {summary.open} open · ~{formatMinutes(summary.minutes)}
            </span>
            {project.deadline && <DeadlineChip deadline={project.deadline} today={today} />}
            {project.state !== "active" && <Chip>{project.state}</Chip>}
          </span>
        }
        actions={
          <MenuButton label="Project actions">
            {(close) => (
              <>
                <label className="flex flex-col gap-1 px-2.5 py-1.5 text-label font-medium text-ink-2">
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

      {/* Notes: one quiet 44 px line that opens into the editor; collapsed, the first words show beside the label. */}
      <ListCard as="section" className="overflow-clip">
        <button
          type="button"
          onClick={() => setNotesOpen(!notesShown)}
          aria-expanded={notesShown}
          className="flex min-h-11 w-full items-center gap-2 px-4 text-left transition-colors dur-fast hover:bg-hover focus-visible:-outline-offset-2 active:bg-press"
        >
          <Icon name={notesShown ? "chevron-down" : "chevron-right"} size={14} className="shrink-0 text-ink-3" />
          <span className={cx(EYEBROW, "shrink-0")}>Notes</span>
          {!notesShown && project.notes && <span className="min-w-0 truncate text-body-sm text-ink-2">{project.notes}</span>}
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
            className="w-full resize-y border-t border-line bg-transparent px-4 py-3 text-base leading-5 text-ink placeholder:text-ink-4 focus-visible:-outline-offset-2 sm:text-body"
          />
        )}
      </ListCard>

      {tasks.length === 0 && <EmptyCard fact="Nothing in this project yet.">Add the first task below.</EmptyCard>}

      {groups.map((g) => (
        <section key={g.heading?.id ?? "loose"} className="flex flex-col gap-2">
          {g.heading && <HeadingRow heading={g.heading} onRename={(t) => void headingRepo.rename(g.heading!.id, t)} onRemove={() => void headingRepo.remove(g.heading!.id)} />}
          <TaskList>
            {g.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                draggable
                onDropTask={(src, edge) => dropInto(g)(src, t.id, edge)}
                onOpen={() => detail.open(t.id)}
                selected={sel.selectedId === t.id}
                onSelect={() => sel.select(t.id)}
                onDone={() => void tasksRepo.complete(t.id)}
                chips={<DayChipTag chip={dayChip(t, today)} count={false} />}
              />
            ))}
            <InlineAdd ctx={parseCtx} onAdd={(d) => add(d, g.heading?.id ?? null)} placeholder={g.heading ? `Add to ${g.heading.title}` : "Add a task"} autoFocus={tasks.length === 0 && !g.heading} />
          </TaskList>
        </section>
      ))}

      {/* The next heading is typed on the same line it will occupy: the eyebrow's face, a plus where the check ring would be, the words on the title column (56 px in from the edge on a phone, 44 above). */}
      <div className="flex min-h-11 items-center gap-3 sm:gap-0">
        <span className="flex size-11 shrink-0 items-center justify-center text-ink-3" aria-hidden="true">
          <Icon name="plus" size={16} />
        </span>
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
          className={cx(EYEBROW, "-ml-2 h-11 min-w-0 flex-1 rounded-sm bg-transparent px-2 text-ink placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-4 focus-visible:-outline-offset-2")}
        />
      </div>

      <section className="flex flex-col gap-2">
        <button type="button" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone} className={DISCLOSURE}>
          <Icon name={showDone ? "chevron-down" : "chevron-right"} size={14} className="shrink-0 text-ink-3" />
          {showDone ? (
            <>
              Hide completed
              {done.length > 0 && <span className="num"> · {done.length}</span>}
            </>
          ) : (
            "Show completed"
          )}
        </button>
        {showDone &&
          (done.length === 0 ? (
            <p className="px-4 text-body text-ink-3">Nothing completed in the last {months.length} months.</p>
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
          <button type="button" onClick={() => setShowSomeday((s) => !s)} aria-expanded={showSomeday} className={DISCLOSURE}>
            <Icon name={showSomeday ? "chevron-down" : "chevron-right"} size={14} className="shrink-0 text-ink-3" />
            Someday in this project<span className="num"> · {someday.length}</span>
          </button>
          {showSomeday && (
            <TaskList>
              {someday.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  onOpen={() => detail.open(t.id)}
                  selected={sel.selectedId === t.id}
                  onSelect={() => sel.select(t.id)}
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

/** A heading inside the project: the eyebrow, a rule to the edge, and a delete target that is 44 px on the phone. */
function HeadingRow({ heading, onRename, onRemove }: { heading: Heading; onRename: (title: string) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 px-0.5">
      <InlineTitle as="h2" value={heading.title} label={`Heading ${heading.title}`} onSave={onRename} className={cx(EYEBROW, "min-w-0")} />
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete heading ${heading.title}`}
        title="Delete heading (tasks move up)"
        className="-my-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-[background-color,color] dur-fast hover:bg-hover hover:text-ink sm:-my-2 sm:size-9"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
