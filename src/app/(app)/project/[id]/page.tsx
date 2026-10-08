"use client";
// A project (SCREENS.md §9): headings as section dividers, tasks in the
// project's own order with a day chip per row, an add row under every
// section, completed tasks tucked away, Someday collapsed at the bottom.
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@/data/powersync";
import type { TaskDraft } from "@/core/quickadd";
import { formatMinutes, localDate } from "@/core/time";
import { toHeading, toProject, toTask } from "@/data/mappers";
import { AREAS_SQL, type AreaRow } from "@/data/queries/nav";
import { PROJECT_DONE_SQL, PROJECT_HEADINGS_SQL, PROJECT_SQL, PROJECT_TASKS_SQL, doneByHeading, logbookStream } from "@/data/queries/views";
import type { HeadingRow, ProjectRow, TaskRow as TaskRowType } from "@/data/schema.client";
import { HeadingSection } from "@/features/projects/heading-section";
import { groupByHeading, summarise, type HeadingGroup } from "@/features/projects/organise";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { useListSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { Loading } from "../../loading-view";
import { dayChip } from "@/features/tasks/day-chip";
import { InlineAdd } from "@/features/tasks/inline-add";
import { DayChipTag } from "@/features/tasks/day-chip-tag";
import { MenuOnly, MoveActions, RowAction } from "@/features/tasks/task-actions";
import { keyBetween } from "@/core/ordering";
import { requestOrganize } from "@/features/tasks/organize";
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
import { notePreview } from "@/ui/markdown-plain";
import { NoteField } from "@/ui/note-field";
import { FieldPopover } from "@/ui/field-popover";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { relativeDay } from "@/ui/relative-day";
import { EYEBROW } from "@/ui/section-label";

/** "Move to area…" (the tap path for dragging a project in the sidebar): a picker loaded when it is first opened. */
const OrganiseSheet = dynamic(() => import("@/features/projects/organise-sheet").then((m) => m.OrganiseSheet), { ssr: false });

/** From 640 px the project's notes open when it has any; below, they start folded to their first line. */
const WIDE_QUERY = "(min-width: 40rem)";
const subscribeWide = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readWide = () => typeof window.matchMedia !== "function" || window.matchMedia(WIDE_QUERY).matches;
/** The view's h1, editable in place: the same face, step and balance as every other screen title. */
const TITLE = "font-display text-title font-book text-balance text-ink";
/** A disclosure line under a list: 44 px on the phone, 36 above, pulled out to the column's edge like a section action. */
const DISCLOSURE = "-ml-2 flex h-11 items-center gap-1.5 self-start rounded-sm px-2 text-body-sm font-medium text-ink-2 transition-[background-color,color] dur-fast hover:bg-hover hover:text-ink sm:h-9 touch:h-11";

export default function ProjectPage({ params, searchParams }: PageProps<"/project/[id]">) {
  const { id } = use(params);
  // `?add=1`: a task just broken down into this project (Convert to project, "Break it down") opens with the
  // cursor in the add row, ready for the first step it did not have (PRODUCT_SPEC.md §8.3.5).
  const addFirst = (searchParams ? use(searchParams) : {}).add === "1";
  const tasksRepo = useTaskRepo();
  const projectRepo = useProjectRepo();
  const headingRepo = useHeadingRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const parseCtx = useMemo(() => ({ now, zone, today, eveningStartsAt: settings?.eveningStartsAt }), [now, zone, today, settings?.eveningStartsAt]);

  const { data: projectRows, isLoading } = useQuery<ProjectRow>(PROJECT_SQL, [id]);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: headingRows } = useQuery<HeadingRow>(PROJECT_HEADINGS_SQL, [id]);
  const { data: taskRows, isLoading: loadingTasks } = useQuery<TaskRowType>(PROJECT_TASKS_SQL, [id]);
  /** Sections whose completed tasks are shown ("" is the tasks under no heading). */
  const [doneShown, setDoneShown] = useState<ReadonlySet<string>>(new Set());
  /** Headings folded away. */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [showSomeday, setShowSomeday] = useState(false);
  const [notesOpen, setNotesOpen] = useState<boolean | null>(null);
  const [newHeading, setNewHeading] = useState("");
  const [movingArea, setMovingArea] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, readWide, () => false);
  // Each heading's "Show completed · N" counts what was finished in the last week, so the week is always on hand.
  const weekAgo = useMemo(() => `${today.subtract({ days: 7 }).toString()}T00:00:00.000Z`, [today]);
  const { data: doneRows } = useQuery<TaskRowType>(PROJECT_DONE_SQL, [id, weekAgo], { streams: [{ ...logbookStream(today), ttl: 60 * 60 }] });

  const project = projectRows?.[0] ? toProject(projectRows[0]) : null;
  const area = (areaRows ?? []).find((a) => a.id === project?.areaId) ?? null;
  const headings = useMemo(() => (headingRows ?? []).map(toHeading), [headingRows]);
  const tasks = useMemo(() => (taskRows ?? []).map(toTask), [taskRows]);
  const open = useMemo(() => tasks.filter((t) => t.state === "inbox" || t.state === "active"), [tasks]);
  const someday = useMemo(() => tasks.filter((t) => t.state === "someday"), [tasks]);
  const done = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  const groups = useMemo(() => groupByHeading(open, headings), [open, headings]);
  const doneGroups = useMemo(() => doneByHeading(done, new Set(headings.map((h) => h.id))), [done, headings]);
  const summary = summarise(tasks, settings?.defaultEstimateMin ?? 30);
  // Below 640 px the notes start folded to their first line (SCREENS.md §9 "Responsive"); wider, open when there are any.
  const notesShown = notesOpen ?? (Boolean(project?.notes) && wide);
  const keyOf = (g: HeadingGroup) => g.heading?.id ?? "";
  const isFolded = (g: HeadingGroup) => g.heading !== null && folded.has(g.heading.id);
  const toggleIn = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };
  // J/K and Select all walk the rows on screen: a folded heading's tasks and a closed completed list are skipped.
  const sel = useListSelection([
    ...groups.flatMap((g) => (isFolded(g) ? [] : [g.tasks.map((t) => t.id), doneShown.has(keyOf(g)) ? (doneGroups.get(keyOf(g)) ?? []).map((t) => t.id) : []])),
    showSomeday ? someday.map((t) => t.id) : [],
  ]);

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
  // A heading moves with its tasks (they are filed under it): one key, by a drag or by Move up / Move down.
  const keyedHeadings = headings.map((h) => ({ id: h.id, key: h.sortKey }));
  const dropHeading = (sourceId: string, targetId: string, edge: Edge) => {
    const plan = planDrop(keyedHeadings, sourceId, targetId, edge);
    if (plan) void headingRepo.reorder(sourceId, plan.key);
  };
  const moveHeading = (headingId: string, dir: -1 | 1) => {
    const i = headings.findIndex((h) => h.id === headingId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= headings.length) return;
    const before = dir === -1 ? headings[j - 1] : headings[j];
    const after = dir === -1 ? headings[j] : headings[j + 1];
    void headingRepo.reorder(headingId, keyBetween(before?.sortKey ?? null, after?.sortKey ?? null));
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
                <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (setMovingArea(true), close())}>
                  Move to area…
                </button>
                {/* SCREENS.md §9 header ⋯: a copy named "… (copy)" with its headings and open tasks, which then opens. */}
                <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (requestOrganize({ kind: "duplicate-project", id: project.id }), close())}>
                  Duplicate
                </button>
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
          {!notesShown && project.notes && <span className="min-w-0 truncate text-body-sm text-ink-2">{notePreview(project.notes)}</span>}
        </button>
        {notesShown && (
          // Markdown, drawn at rest and edited in place (SCREENS.md §9); the renderer is its own lazy chunk.
          <NoteField
            value={project.notes}
            onSave={(next) => void projectRepo.setNotes(project.id, next)}
            label="Project notes"
            placeholder="What this project is for, links, decisions."
            rows={3}
            className="rounded-b-xl border-t border-line px-4 py-3 hover:bg-hover focus-visible:-outline-offset-2"
            editorClassName="block w-full resize-y rounded-b-xl border-t border-line bg-transparent px-4 py-3 text-base leading-5 text-ink [field-sizing:content] placeholder:text-ink-4 focus-visible:-outline-offset-2 sm:text-body"
          />
        )}
      </ListCard>

      {tasks.length === 0 && <EmptyCard fact="Nothing in this project yet.">Add the first task below.</EmptyCard>}

      {groups.map((g, gi) => {
        const finished = doneGroups.get(keyOf(g)) ?? [];
        const body = (
          <>
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
              <InlineAdd ctx={parseCtx} onAdd={(d) => add(d, g.heading?.id ?? null)} placeholder={g.heading ? `Add to ${g.heading.title}` : "Add a task"} autoFocus={(tasks.length === 0 || addFirst) && !g.heading} />
            </TaskList>
            {/* What this section finished in the last week, tucked under its own disclosure (SCREENS.md §9). */}
            {finished.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setDoneShown((s) => toggleIn(s, keyOf(g)))}
                  aria-expanded={doneShown.has(keyOf(g))}
                  className={DISCLOSURE}
                >
                  <Icon name={doneShown.has(keyOf(g)) ? "chevron-down" : "chevron-right"} size={14} className="shrink-0 text-ink-3" />
                  {doneShown.has(keyOf(g)) ? "Hide completed" : "Show completed"}
                  <span className="num"> · {finished.length}</span>
                  {g.heading && <span className="sr-only"> in {g.heading.title}</span>}
                </button>
                {doneShown.has(keyOf(g)) && (
                  <TaskList>
                    {finished.map((t) => (
                      <TaskRow key={t.id} task={t} onOpen={() => detail.open(t.id)} selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)} />
                    ))}
                  </TaskList>
                )}
              </>
            )}
          </>
        );
        if (!g.heading) {
          return (
            <section key="loose" className="flex flex-col gap-2">
              {body}
            </section>
          );
        }
        const heading = g.heading;
        // Headings are groups[1…]: the first and last of them can move only one way.
        return (
          <HeadingSection
            key={heading.id}
            heading={heading}
            collapsed={isFolded(g)}
            onToggle={() => setFolded((s) => toggleIn(s, heading.id))}
            openCount={g.tasks.length}
            first={gi === 1}
            last={gi === groups.length - 1}
            onMove={(dir) => moveHeading(heading.id, dir)}
            onDropHeading={(source, edge) => dropHeading(source, heading.id, edge)}
            onRename={(t) => void headingRepo.rename(heading.id, t)}
            onRemove={() => void headingRepo.remove(heading.id)}
          >
            {body}
          </HeadingSection>
        );
      })}

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
          className={cx(EYEBROW, "h-11 min-w-0 flex-1 rounded-sm bg-transparent text-ink placeholder:text-body-sm placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-2 focus-visible:-outline-offset-2 sm:h-9 touch:h-11")}
        />
      </div>

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
      {movingArea && <OrganiseSheet target={{ kind: "project", id: project.id, name: project.name }} step="move" onClose={() => setMovingArea(false)} />}
    </main>
  );
}
