"use client";
// Logbook (SCREENS.md §8): completed tasks, newest first, grouped by the day
// they were completed, with each day's dropped tasks in a collapsed
// sub-group. A row opens its task; Reopen (U on the keyboard) un-completes a
// done one and Restore brings a dropped one back, both undoable. Cold data:
// the logbook stream delivers the finished months on open and keeps them
// cached after the view closes; dropped tasks are in the working set already.
// The device holds a week of finished tasks; what was finished before that is
// kept on the server and comes a page at a time under "Show older"
// (DECISIONS.md, amendment 2026-11-14): those rows open a read-only view and
// Reopen makes one a task again.
// A task the rollover dropped under the "expire" policy says "Expired", and
// `?show=expired` (Review on Today's expired digest) lists only those.
// Filters (project, area, tag, dates, done vs dropped) live in the URL and
// narrow the days, their counts and minutes with them; Escape takes off the
// newest. A day the shutdown rated or gave a highlight says so in a quiet
// line under its header.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { formatMinutes, instant } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import { ALL_PROJECTS_SQL, AREAS_SQL, type AreaRow, type ProjectStateRow } from "@/data/queries/nav";
import { DAY_NOTES_SQL, DROPPED_SQL, LOGBOOK_COMPLETIONS_SQL, LOGBOOK_SQL, TAG_NAMES_SQL, logbookStream } from "@/data/queries/views";
import { restoreFinished } from "@/data/repositories/finished-restore";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { splitFinished, type FinishedRow } from "@/features/finished/finished";
import { FinishedPeek } from "@/features/finished/finished-peek";
import { useFinished, type Finished } from "@/features/finished/use-finished";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useListSelection, useSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { RowAction } from "@/features/tasks/task-actions";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-provider";
import { CollapsedGroup } from "@/ui/collapsed-group";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";
import { LogbookFilterBar } from "./logbook-filter-bar";
import { dayLine, filterKeys, filterLogbookDays, olderLogbookQuery, parseLogbookParams, toLogbookParams, withoutLast, type LogbookFilters } from "./logbook-filters";
import { logbookDays, type CompletionRow, type LogbookEntry } from "./logbook-days";

/** Reads the query: `?show=expired` (the view Review on Today's digest opens) and the filters. */
function ParamsFromQuery({ onChange }: { onChange: (query: string) => void }) {
  const query = useSearchParams().toString();
  useEffect(() => onChange(query), [query, onChange]);
  return null;
}

type DayNote = { date: string; day_rating: number | null; highlights: string | null };
const NO_TAGS = `select task_id, name from task_tags where 0`;
/** The tags by id, lower-cased as the tag filter compares them: an older row names its tags by id. */
const TAGS_BY_ID_SQL = `select id, lower(name) as name from tags where deleted_at is null`;
const NO_TAG_IDS = `select id, name from tags where 0`;
/** How far back the day line looks: the device holds a week of done tasks, dropped ones longer. */
const NOTES_DAYS = 60;
/** With "Dropped" alone asked for there is nothing older to fetch: the question that is never sent. */
const NO_OLDER = { limit: 1 } as const;

/** The way to what was finished before the week the device holds: a page per press, and when there is no more. */
function ShowOlder({ older, filtering }: { older: Finished; filtering: boolean }) {
  if (!older.available) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      {older.status === "error" && (
        <p role="alert" className="text-body-sm text-pretty text-ink-2">
          Couldn&rsquo;t load older tasks. Check the connection and try again.
        </p>
      )}
      {older.more === false ? (
        <p role="status" className="text-body-sm text-ink-3">
          {older.rows.length > 0 ? "That is everything." : filtering ? "Nothing older matches." : "Nothing older."}
        </p>
      ) : (
        <Button variant="secondary" onClick={older.load} disabled={older.status === "loading"}>
          {older.status === "loading" ? "Loading…" : "Show older"}
        </Button>
      )}
    </div>
  );
}

const NONE: readonly FinishedRow[] = [];

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.("input, textarea, select, [contenteditable='true']"));
}

export default function LogbookPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today, settings, zone } = useLocalDay(now);
  const stream = useMemo(() => logbookStream(today), [today]);
  const { data, isLoading } = useQuery<TaskRowType>(LOGBOOK_SQL, [], {
    streams: [{ ...stream, ttl: 60 * 60, waitForStream: true }],
  });
  const { data: completions } = useQuery<CompletionRow>(LOGBOOK_COMPLETIONS_SQL);
  const { data: dropped, isLoading: droppedLoading } = useQuery<TaskRowType>(DROPPED_SQL);
  const projectNames = useProjectNames();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { expiredOnly, filters } = useMemo(() => {
    const params = new URLSearchParams(query);
    return { expiredOnly: params.get("show") === "expired", filters: parseLogbookParams(params) };
  }, [query]);
  const setFilters = useCallback((f: LogbookFilters) => {
    const q = toLogbookParams(f);
    router.replace(q ? `/logbook?${q}` : "/logbook", { scroll: false });
  }, [router]);
  const filtering = filterKeys(filters).length > 0;

  // Older than the week the device holds: asked for under the same filters, a page at a time.
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const olderAsk = useMemo(() => olderLogbookQuery(filters, zone), [filters, zone]);
  const older = useFinished(olderAsk ?? NO_OLDER);
  const olderOn = !expiredOnly && olderAsk !== null;
  const olderRows = olderOn ? older.rows : NONE;
  const finished = useMemo(() => new Map(olderRows.map((r) => [r.id, r])), [olderRows]);
  // While there is more to fetch, the oldest day shown may be cut by the page: its count would be of part of it.
  const lastOlder = older.more && olderRows.length > 0 ? olderRows[olderRows.length - 1].completed_at : null;
  const partDay = useMemo(() => (lastOlder ? instant(normaliseTimestamp(lastOlder)).toZonedDateTimeISO(zone).toPlainDate().toString() : null), [lastOlder, zone]);
  const [peek, setPeek] = useState<FinishedRow | null>(null);
  const removeOlder = older.remove;
  const reopenOlder = useCallback(
    async (f: FinishedRow) => {
      await restoreFinished(db, undo, f);
      removeOlder(f.id);
      setPeek(null);
    },
    [db, undo, removeOlder],
  );

  const defaultEstimateMin = settings?.defaultEstimateMin ?? 30;
  const allDays = useMemo(() => {
    const kept = splitFinished(olderRows);
    return logbookDays({ done: [...(data ?? []), ...kept.done], completions: [...(completions ?? []), ...kept.completions], dropped, zone, defaultEstimateMin });
  }, [data, completions, dropped, olderRows, zone, defaultEstimateMin]);
  const expired = useMemo(() => allDays.flatMap((d) => d.dropped.filter((e) => e.expired)), [allDays]);

  // What the filters choose from: the projects, areas and tags the Logbook has in it.
  const { data: projectRows } = useQuery<ProjectStateRow>(ALL_PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<{ task_id: string; name: string }>(allDays.length > 0 ? TAG_NAMES_SQL : NO_TAGS);
  const { data: tagIdRows } = useQuery<{ id: string; name: string }>(olderRows.length > 0 ? TAGS_BY_ID_SQL : NO_TAG_IDS);
  const { data: noteRows } = useQuery<DayNote>(DAY_NOTES_SQL, [today.subtract({ days: NOTES_DAYS }).toString()]);
  const notes = useMemo(() => new Map((noteRows ?? []).map((n) => [String(n.date).slice(0, 10), n])), [noteRows]);
  const { options, ctx } = useMemo(() => {
    const areaOfProject = new Map((projectRows ?? []).map((p) => [p.id, p.area_id]));
    const tagsByTask = new Map<string, string[]>();
    for (const t of tagRows ?? []) tagsByTask.set(t.task_id, [...(tagsByTask.get(t.task_id) ?? []), t.name]);
    // An older task's tags are in its own row, by id; a repeat's occurrence takes its task's, as above.
    const tagName = new Map((tagIdRows ?? []).map((t) => [t.id, t.name]));
    for (const f of olderRows) if (!f.occurrence_of && f.tag_ids?.length) tagsByTask.set(f.id, f.tag_ids.flatMap((id) => tagName.get(id) ?? []));
    const tasks = allDays.flatMap((d) => [...d.done, ...d.dropped]).map((e) => e.task);
    const projectIds = new Set<string>(tasks.flatMap((t) => (t.projectId ? [t.projectId] : [])));
    const areaIds = new Set([...projectIds].map((id) => areaOfProject.get(id)).filter((id): id is string => Boolean(id)));
    const tagNames = [...new Set(tasks.flatMap((t) => tagsByTask.get(t.id) ?? []))].sort();
    return {
      options: {
        projects: (projectRows ?? []).filter((p) => projectIds.has(p.id)).map((p) => ({ id: p.id, name: p.name ?? "Untitled project" })),
        areas: (areaRows ?? []).filter((a) => areaIds.has(a.id)).map((a) => ({ id: a.id, name: a.name ?? "Untitled area" })),
        tags: tagNames.map((name) => ({ name })),
      },
      ctx: { areaOf: (id: string) => areaOfProject.get(id) ?? null, tagsOf: (id: string) => tagsByTask.get(id) ?? [] },
    };
  }, [projectRows, areaRows, tagRows, tagIdRows, olderRows, allDays]);
  const days = useMemo(() => filterLogbookDays(allDays, filters, ctx, defaultEstimateMin), [allDays, filters, ctx, defaultEstimateMin]);

  // Escape takes off the newest filter, once nothing nearer wants the key (an open task, ticked rows, a dialog).
  const detailOpen = detail.selectedId !== null;
  const ticked = useSelection().checkedIds.length > 0;
  useEffect(() => {
    if (!filtering || expiredOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || detailOpen || ticked || isTypingTarget(e.target) || document.querySelector("[role='dialog'], [role='menu']")) return;
      const next = withoutLast(filters);
      if (!next) return;
      e.preventDefault();
      setFilters(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtering, expiredOnly, filters, setFilters, detailOpen, ticked]);

  // J/K walks the done rows and the dropped rows of the days whose group is open: a closed group's rows can't be seen.
  // A repeat's completion row is one occurrence, not a task to select or reopen; it opens its task.
  const [openDropped, setOpenDropped] = useState<ReadonlySet<string>>(() => new Set());
  const toggleDropped = useCallback((key: string, open: boolean) => {
    setOpenDropped((s) => {
      if (s.has(key) === open) return s;
      const next = new Set(s);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const sel = useListSelection(
    expiredOnly
      ? expired.map((e) => e.key)
      : // An older task is not on the device, so the task keys have nothing to act on: it is opened and reopened by pointer.
        days.map((d) => [...d.done.filter((e) => e.kind === "done" && !finished.has(e.key)).map((e) => e.key), ...(filters.show === "dropped" || openDropped.has(d.day.toString()) ? d.dropped.map((e) => e.key) : [])]),
  );

  const meta = ({ task: t, at, expired: wasExpired }: LogbookEntry) => (
    <>
      {wasExpired && <span>Expired</span>}
      {t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>}
      <span className="num">{at}</span>
    </>
  );
  const row = (e: LogbookEntry) => {
    const kept = finished.get(e.key);
    if (kept) {
      return (
        <TaskRow
          key={e.key}
          task={e.task}
          today={today}
          onOpen={() => setPeek(kept)}
          meta={meta(e)}
          actions={kept.occurrence_of ? undefined : <RowAction label="Reopen" primary onClick={() => void reopenOlder(kept)} />}
        />
      );
    }
    const selectable = e.kind !== "completion";
    return (
      <TaskRow
        key={e.key}
        task={e.task}
        today={today}
        onOpen={() => detail.open(e.task.id)}
        selected={selectable && sel.selectedId === e.key}
        onSelect={selectable ? () => sel.select(e.key) : undefined}
        meta={meta(e)}
        actions={
          e.kind === "done" ? (
            <RowAction label="Reopen" primary title="Reopen (U)" onClick={() => void repo.reopen(e.task.id)} />
          ) : e.kind === "dropped" ? (
            <RowAction label="Restore" primary onClick={() => void repo.setState(e.task.id, "active", "Brought back {title}")} />
          ) : undefined
        }
      />
    );
  };

  const empty = !isLoading && !droppedLoading && allDays.length === 0;
  const params = (
    <Suspense fallback={null}>
      <ParamsFromQuery onChange={setQuery} />
    </Suspense>
  );
  if (expiredOnly) {
    return (
      <main className={VIEW_COLUMN}>
        {params}
        <ViewHeader eyebrow="Logbook" title="Expired" subtitle="Time-sensitive tasks the day moved past. Restore brings one back." />
        {expired.length === 0 ? (
          !droppedLoading && <EmptyCard fact="Nothing expired." />
        ) : (
          <section className="flex flex-col gap-2">
            <SectionLabel className="px-0.5" count={expired.length}>
              Dropped
            </SectionLabel>
            <TaskList>{expired.map(row)}</TaskList>
          </section>
        )}
        <Link href="/logbook" className="flex min-h-11 items-center self-start text-body-sm text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink sm:min-h-0">
          The whole Logbook
        </Link>
      </main>
    );
  }
  return (
    <main className={VIEW_COLUMN}>
      {params}
      <ViewHeader eyebrow="Logbook" title="Done" subtitle={olderRows.length > 0 ? "The last week and older" : allDays.length > 0 ? "The last week" : undefined} />
      {((!empty && allDays.length > 0) || filtering) && <LogbookFilterBar filters={filters} onChange={setFilters} options={options} today={today} />}
      {empty && !filtering ? (
        <div className="flex flex-col gap-3">
          <Icon name="book" size={20} className="text-ink-3" />
          <EmptyCard fact="Nothing finished this week.">{olderOn && older.available ? "What you finished before that is kept." : "What you finish shows here."}</EmptyCard>
        </div>
      ) : filtering && days.length === 0 ? (
        <EmptyCard
          fact="Nothing here matches those filters."
          action={
            <Button variant="link" onClick={() => setFilters({})}>
              Clear the filters
            </Button>
          }
        />
      ) : (
        days.map((d) => {
          const key = d.day.toString();
          const line = dayLine(notes.get(key));
          return (
            <section key={key} className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <SectionLabel className="px-0.5" detail={d.done.length > 0 && key !== partDay ? `${d.done.length} done · ${formatMinutes(d.minutes)}` : undefined}>
                  {formatDay(d.day, { weekday: "long", today })}
                </SectionLabel>
                {line && <p className="px-0.5 text-body-sm text-pretty text-ink-2 [overflow-wrap:anywhere]">{line}</p>}
              </div>
              {d.done.length > 0 && <TaskList>{d.done.map(row)}</TaskList>}
              {/* Asked for on their own, the dropped ones are the list; otherwise they stay folded under the day. */}
              {d.dropped.length > 0 &&
                (filters.show === "dropped" ? (
                  <TaskList>{d.dropped.map(row)}</TaskList>
                ) : (
                  <CollapsedGroup label="Dropped" count={d.dropped.length} onToggle={(open) => toggleDropped(key, open)}>
                    <TaskList>{d.dropped.map(row)}</TaskList>
                  </CollapsedGroup>
                ))}
            </section>
          );
        })
      )}
      {olderOn && !isLoading && <ShowOlder older={older} filtering={filtering} />}
      {peek && (
        <FinishedPeek
          row={peek}
          projectName={peek.project_id ? projectNames.get(peek.project_id) : null}
          tagNames={ctx.tagsOf(peek.occurrence_of ?? peek.id)}
          zone={zone}
          today={today}
          onReopen={peek.occurrence_of ? undefined : () => void reopenOlder(peek)}
          onClose={() => setPeek(null)}
        />
      )}
    </main>
  );
}
