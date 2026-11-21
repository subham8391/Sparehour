// The Logbook on the phone (ANDROID_APP_SPEC.md §10; the web's app/(app)/logbook/page.tsx), wired to the phone's own
// database and, for what was finished before the week the device holds, to the web app's API (the same
// /api/logbook/older routes, called with the session's token: ~/api). The statements, the days, the filters, what
// they choose from and the paging are the web's own code; Reopen and Restore are writes through the shared
// repositories, which record their undo. Deleting an older task for good has no undo, here as there: the view asks
// once. The filters are kept on the screen rather than in the address. The drawing is logbook-view.tsx.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { logbookDays, type CompletionRow, type LogbookEntry } from "@/app/(app)/logbook/logbook-days";
import { dayLine, filterKeys, filterLabel, filterLogbookDays, olderLogbookQuery, withoutFilter, type LogbookFilters } from "@/app/(app)/logbook/logbook-filters";
import { NO_OLDER, NO_TAGS, NO_TAG_IDS, NOTES_DAYS, TAGS_BY_ID_SQL, logbookOptions, partDayOf, type DayNote } from "@/app/(app)/logbook/logbook-options";
import { localDate } from "@/core/time";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { ALL_PROJECTS_SQL, AREAS_SQL, type AreaRow, type ProjectStateRow } from "@/data/queries/nav";
import { DAY_NOTES_SQL, DROPPED_SQL, LOGBOOK_COMPLETIONS_SQL, LOGBOOK_SQL, TAG_NAMES_SQL, logbookStream } from "@/data/queries/views";
import { restoreFinished } from "@/data/repositories/finished-restore";
import type { TaskRow } from "@/data/schema.client";
import { splitFinished, type FinishedRow } from "@/features/finished/finished";
import { deleteFinished } from "@/features/finished/finished-delete";
import { useFinished } from "@/features/finished/use-finished";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-context";
import { apiFetch } from "~/api";
import { FinishedPeek } from "./finished-peek";
import { LogbookFilterSheet } from "./logbook-filter-sheet";
import { Rows } from "../rows/rows";
import { LogbookView } from "./logbook-view";

const NONE: readonly FinishedRow[] = [];

export function Logbook() {
  const router = useRouter();
  // `/logbook?show=expired` is the list Review on Today's expired digest opens.
  const expiredOnly = useLocalSearchParams<{ show?: string }>().show === "expired";
  const repo = useTaskRepo();
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const now = useNow();
  const { today, settings, zone } = useLocalDay(now);
  const todayIso = today.toString();
  const stream = useMemo(() => logbookStream(localDate(todayIso)), [todayIso]);
  const { data, isLoading } = useQuery<TaskRow>(LOGBOOK_SQL, [], { streams: [{ ...stream, ttl: 60 * 60, waitForStream: true }] });
  const { data: completions } = useQuery<CompletionRow>(LOGBOOK_COMPLETIONS_SQL);
  const { data: dropped, isLoading: droppedLoading } = useQuery<TaskRow>(DROPPED_SQL);
  const projectNames = useProjectNames();
  const [filters, setFilters] = useState<LogbookFilters>({});
  const [sheet, setSheet] = useState(false);
  const keys = filterKeys(filters);

  // Older than the week the device holds: asked for under the same filters, a page at a time.
  const olderAsk = useMemo(() => olderLogbookQuery(filters, zone), [filters, zone]);
  const older = useFinished(olderAsk ?? NO_OLDER, apiFetch);
  const olderOn = !expiredOnly && olderAsk !== null;
  const olderRows = olderOn ? older.rows : NONE;
  const finished = useMemo(() => new Map(olderRows.map((r) => [r.id, r])), [olderRows]);
  const olderKeys = useMemo(() => new Map(olderRows.map((r) => [r.id, !r.occurrence_of])), [olderRows]);
  // While there is more to fetch, the oldest day shown may be cut by the page: its count would be of part of it.
  const lastOlder = older.more && olderRows.length > 0 ? olderRows[olderRows.length - 1].completed_at : null;
  const partDay = useMemo(() => partDayOf(lastOlder, zone), [lastOlder, zone]);
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
  // Deleted for good (the view asked and the server answered): the row leaves the list, and the view if it is still this one.
  const forgetOlder = useCallback(
    (id: string) => {
      removeOlder(id);
      setPeek((p) => (p?.id === id ? null : p));
    },
    [removeOlder],
  );

  const defaultEstimateMin = settings?.defaultEstimateMin ?? 30;
  const rolloverHour = settings?.dayRolloverHour ?? 4;
  const allDays = useMemo(() => {
    const kept = splitFinished(olderRows);
    return logbookDays({ done: [...(data ?? []), ...kept.done], completions: [...(completions ?? []), ...kept.completions], dropped, zone, rolloverHour, defaultEstimateMin });
  }, [data, completions, dropped, olderRows, zone, rolloverHour, defaultEstimateMin]);
  const expired = useMemo(() => allDays.flatMap((d) => d.dropped.filter((e) => e.expired)), [allDays]);

  // What the filters choose from: the projects, areas and tags the Logbook has in it.
  const { data: projectRows } = useQuery<ProjectStateRow>(ALL_PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<{ task_id: string; name: string }>(allDays.length > 0 ? TAG_NAMES_SQL : NO_TAGS);
  const { data: tagIdRows } = useQuery<{ id: string; name: string }>(olderRows.length > 0 ? TAGS_BY_ID_SQL : NO_TAG_IDS);
  const { data: noteRows } = useQuery<DayNote>(DAY_NOTES_SQL, [localDate(todayIso).subtract({ days: NOTES_DAYS }).toString()]);
  const dayLines = useMemo(() => {
    const lines = new Map<string, string>();
    for (const n of noteRows ?? []) {
      const line = dayLine(n);
      if (line) lines.set(String(n.date).slice(0, 10), line);
    }
    return lines;
  }, [noteRows]);
  const { options, ctx } = useMemo(() => logbookOptions({ projects: projectRows, areas: areaRows, tags: tagRows, tagIds: tagIdRows, older: olderRows, days: allDays }), [projectRows, areaRows, tagRows, tagIdRows, olderRows, allDays]);
  const days = useMemo(() => filterLogbookDays(allDays, filters, ctx, defaultEstimateMin), [allDays, filters, ctx, defaultEstimateMin]);
  const names = {
    project: (id: string) => options.projects.find((p) => p.id === id)?.name ?? null,
    area: (id: string) => options.areas.find((a) => a.id === id)?.name ?? null,
  };
  const chips = keys.flatMap((key) => {
    const label = filterLabel(key, filters, names, today);
    return label ? [{ key, label }] : [];
  });

  const open = (e: LogbookEntry) => {
    const kept = finished.get(e.key);
    // An older task is not on the device: it opens the read-only view of the server's row.
    if (kept) setPeek(kept);
    else router.push(`/task/${e.task.id}`);
  };
  const reopen = (e: LogbookEntry) => {
    const kept = finished.get(e.key);
    if (kept) void reopenOlder(kept);
    else void repo.reopen(e.task.id);
  };

  return (
    <Rows>
      <LogbookView
        today={today}
        defaultEstimateMin={defaultEstimateMin}
        days={days}
        hasAny={allDays.length > 0}
        empty={!isLoading && !droppedLoading && allDays.length === 0}
        dayLines={dayLines}
        partDay={partDay}
        projectNames={projectNames}
        olderRows={olderKeys}
        filterChips={chips}
        droppedOnly={filters.show === "dropped"}
        older={olderOn && !isLoading ? { available: older.available, status: older.status, more: older.more, count: older.rows.length } : null}
        expired={expiredOnly ? expired : null}
        loading={droppedLoading}
        onOpenFilters={() => setSheet(true)}
        onRemoveFilter={(key) => setFilters(withoutFilter(filters, key))}
        onClearFilters={() => setFilters({})}
        onLoadOlder={older.load}
        onOpen={open}
        onReopen={reopen}
        onRestore={(e) => void repo.setState(e.task.id, "active", "Brought back {title}")}
        onWholeLogbook={() => router.setParams({ show: undefined })}
      />
      <LogbookFilterSheet open={sheet} filters={filters} onChange={setFilters} options={options} today={today} onClose={() => setSheet(false)} />
      <FinishedPeek
        row={peek}
        projectName={peek?.project_id ? projectNames.get(peek.project_id) : null}
        tagNames={peek ? ctx.tagsOf(peek.occurrence_of ?? peek.id) : []}
        zone={zone}
        today={today}
        onReopen={peek && !peek.occurrence_of ? () => void reopenOlder(peek) : undefined}
        onDelete={(signal) => (peek ? deleteFinished(peek.id, signal, apiFetch) : Promise.reject(new Error("nothing to delete")))}
        onDeleted={() => peek && forgetOlder(peek.id)}
        onClose={() => setPeek(null)}
      />
    </Rows>
  );
}
