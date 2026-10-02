"use client";
// A project (SCREENS.md §9): headings as section dividers, tasks in the
// project's own order with a day chip per row, an add row under every
// section, completed tasks tucked away, Someday collapsed at the bottom.
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import type { TaskDraft } from "@/core/quickadd";
import { formatMinutes, localDate } from "@/core/time";
import type { Heading } from "@/core/types";
import { toHeading, toProject, toTask } from "@/data/mappers";
import { AREAS_SQL, type AreaRow } from "@/data/queries/nav";
import { PROJECT_DONE_SQL, PROJECT_HEADINGS_SQL, PROJECT_SQL, PROJECT_TASKS_SQL, monthsBack } from "@/data/queries/views";
import type { HeadingRow, ProjectRow, TaskRow as TaskRowType } from "@/data/schema.client";
import { groupByHeading, summarise, type HeadingGroup } from "@/features/projects/organise";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { useListSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { Loading } from "../../loading-view";
import { dayChip } from "@/features/tasks/day-chip";
import { InlineAdd } from "@/features/tasks/inline-add";
import { DayChipTag, MenuOnly, MoveActions, RowAction } from "@/features/tasks/task-actions";
import { keyBetween } from "@/core/ordering";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useHeadingRepo, useProjectRepo } from "@/features/tasks/use-repos";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button, buttonClass } from "@/ui/button";
import { Chip, DeadlineChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";
import { EmptyCard, ListCard } from "@/ui/list-card";
import { FieldPopover, MENU_ITEM, MenuButton } from "@/ui/popover";
import { relativeDay } from "@/ui/relative-day";
import { EYEBROW } from "@/ui/section-label";

const NOTHING_SQL = `select * from tasks where 0`;
/** The view's h1, editable in place: the same face, step and balance as every other screen title. */
const TITLE = "font-display text-title font-book text-balance text-ink";
/** A disclosure line under a list: 44 px on the phone, 36 above, pulled out to the column's edge like a section action. */
const DISCLOSURE = "-ml-2 flex h-11 items-center gap-1.5 self-start rounded-sm px-2 text-body-sm font-medium text-ink-2 transition-[background-color,color] dur-fast hover:bg-hover hover:text-ink sm:h-9";

export default function ProjectPage({ params }: PageProps<"/project/[id]">) {
  const { id } = use(params);
  const tasksRepo = useTaskRepo();
  const projectRepo = useProjectRepo();
  const headingRepo = useHeadingRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const parseCtx = useMemo(() => ({ now, zone, eveningStartsAt: settings?.eveningStartsAt }), [now, zone, settings?.eveningStartsAt]);

  const { data: projectRows, isLoading } = useQuery<ProjectRow>(PROJECT_SQL, [id]);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: headingRows } = useQuery<HeadingRow>(PROJECT_HEADINGS_SQL, [id]);
  const { data: taskRows, isLoading: loadingTasks } = useQuery<TaskRowType>(PROJECT_TASKS_SQL, [id]);
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
  // The add row autofocuses an empty project, and `autoFocus` only fires on mount: wait for the
  // tasks before drawing the list, or every project opens with the focus ring in its add row.
  if (!project || loadingTasks) return <Loading />;

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
  // The tap path for reordering (DECISIONS.md: a tap alternative for every drag): one step up or down inside the section.
  const move = (g: HeadingGroup, taskId: string, dir: -1 | 1) => {
    const list = g.tasks;
    const i = list.findIndex((x) => x.id === taskId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const before = dir === -1 ? list[j - 1] : list[j];
    const after = dir === -1 ? list[j] : list[j + 1];
    void tasksRepo.setOrder(taskId, keyBetween(before?.sortKey ?? null, after?.sortKey ?? null));
  };
  // Under another heading, at the end of its section.
  const moveToHeading = (taskId: string, headingId: string | null) => {
    const target = groups.find((x) => (x.heading?.id ?? null) === headingId);
    const last = target?.tasks[target.tasks.length - 1];
    void tasksRepo.setOrder(taskId, keyBetween(last?.sortKey ?? null, null), headingId);
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
            <Link href={`/area/${area.id}`} className="inline-flex min-h-11 items-center rounded-sm transition-colors dur-fast hover:text-ink sm:min-h-0">
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
        compactActions={
          <MenuButton label="Project actions">
            {(close) => (
              <>
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

      {/* What the project is: the deadline as a field row (never a form inside a menu), then notes — one
          quiet 44 px line that opens into the editor; collapsed, the first words show beside the label.
          The card does not clip, because the deadline's panel opens below its row and must be able to leave it. */}
      <ListCard as="section">
        <FieldPopover
          className="[&>button]:rounded-t-xl"
          label="Deadline"
          value={project.deadline ? relativeDay(project.deadline, today) : <span className="font-normal text-ink-3">None</span>}
        >
          {(close) => (
            <div className="flex items-center gap-2">
              <DateField
                aria-label="Project deadline"
                today={today}
                value={project.deadline?.toString() ?? ""}
                onChange={(e) => void projectRepo.setDeadline(project.id, e.target.value ? localDate(e.target.value) : null)}
                className="flex-1"
              />
              {project.deadline && (
                <Button
                  variant="link"
                  onClick={() => {
                    void projectRepo.setDeadline(project.id, null);
                    close();
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          )}
        </FieldPopover>
        <button
          type="button"
          onClick={() => setNotesOpen(!notesShown)}
          aria-expanded={notesShown}
          className="flex min-h-11 w-full items-center gap-2 border-t border-line px-4 text-left transition-colors dur-fast last:rounded-b-xl hover:bg-hover focus-visible:-outline-offset-2 active:bg-press"
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
            className="w-full resize-y rounded-b-xl border-t border-line bg-transparent px-4 py-3 text-base leading-5 text-ink placeholder:text-ink-4 focus-visible:-outline-offset-2 sm:text-body"
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
                actions={
                  <>
                    <RowAction label="Move up" text={null} icon="arrow-up" onClick={() => move(g, t.id, -1)} />
                    <RowAction label="Move down" text={null} icon="arrow-down" onClick={() => move(g, t.id, 1)} />
                    {headings.length > 0 && (
                      <MenuOnly>
                        {g.heading && <RowAction label="Move out of the heading" text="No heading" onClick={() => moveToHeading(t.id, null)} />}
                        {headings
                          .filter((h) => h.id !== g.heading?.id)
                          .map((h) => (
                            <RowAction key={h.id} label={`Move to ${h.title}`} onClick={() => moveToHeading(t.id, h.id)} />
                          ))}
                      </MenuOnly>
                    )}
                  </>
                }
              />
            ))}
            <InlineAdd ctx={parseCtx} onAdd={(d) => add(d, g.heading?.id ?? null)} placeholder={g.heading ? `Add to ${g.heading.title}` : "Add a task"} autoFocus={tasks.length === 0 && !g.heading} />
          </TaskList>
        </section>
      ))}

      {/* The next heading is typed on the line it will occupy, in the disclosure's shape below: pulled out to
          the column's edge, a 14 px glyph, then the words already in the eyebrow's face. */}
      <div className="-ml-2 flex min-h-11 items-center gap-1.5 px-2 sm:min-h-9">
        <Icon name="plus" size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
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
          className={cx(EYEBROW, "h-11 min-w-0 flex-1 rounded-sm bg-transparent text-ink placeholder:text-body-sm placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-2 focus-visible:-outline-offset-2 sm:h-9")}
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
            <p className="px-4 text-body text-ink-3">Nothing completed in the last week.</p>
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
