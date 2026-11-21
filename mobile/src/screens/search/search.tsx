// Search on the phone (SCREENS.md §13; the web's app/(app)/search/page.tsx), wired to the phone's own database.
// Everything it knows is the web app's own code, used as it is: the statement built from the words and the filters
// with its matching and its order (features/search/search.ts), the split into what can be acted on and "Also
// found", the line that says where the words were found, the project and area matches (features/commands/fuzzy.ts),
// what a result's row offers and the write behind each choice (features/search/hit-moves.ts, features/tasks/
// snooze.ts), and the repository that writes and records the undo the app's one toast offers. What was finished
// before the week the phone holds is searched on the server when asked (older-found.tsx). The words and the filters
// are kept on the screen rather than in the address. The drawing is search-view.tsx.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { localDate } from "@/core/time";
import type { TagRef } from "@/core/types";
import { toTask } from "@/data/mappers";
import { useQuery } from "@/data/powersync";
import { ALL_PROJECTS_SQL, AREAS_SQL, isOpenProject, projectStateLabel, type AreaRow, type ProjectStateRow } from "@/data/queries/nav";
import { TAGS_SQL, logbookStream } from "@/data/queries/views";
import type { TaskRow } from "@/data/schema.client";
import { rankNamed } from "@/features/commands/fuzzy";
import { dayPart } from "@/features/looks/look";
import { runHitMove } from "@/features/search/hit-moves";
import { buildChecklistMatch, buildTaskSearch, contextFor, splitResults, type SearchFilters } from "@/features/search/search";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { applySnooze } from "@/features/tasks/snooze";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useQuickAdd } from "../quick-add/quick-add";
import { OlderFound } from "./older-found";
import { SearchView, type SearchHit } from "./search-view";

const NONE_SQL = `select * from tasks where 0`;
const NO_ITEMS_SQL = `select task_id, title from checklist_items where 0`;
/** Typing updates the box at once and the statements a beat later, as on the web. */
const DEBOUNCE_MS = 150;

export function Search() {
  const router = useRouter();
  // `/search?q=…` opens on those words.
  const asked = useLocalSearchParams<{ q?: string }>().q ?? "";
  const [draft, setDraft] = useState(asked);
  const [query, setQuery] = useState(asked);
  useEffect(() => {
    if (draft === query) return;
    const t = setTimeout(() => setQuery(draft), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, query]);
  const [filters, setFilters] = useState<SearchFilters>({});

  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const repo = useTaskRepo();
  const quickAdd = useQuickAdd();

  const statement = useMemo(() => buildTaskSearch(query, filters), [query, filters]);
  // Done tasks live outside the working set: while there is a search, the logbook stream is subscribed so they can
  // match under "Also found" without the Logbook having been opened first.
  // By its date: the day object is a new one each minute, the day is not.
  const todayIso = today.toString();
  const day = useMemo(() => localDate(todayIso), [todayIso]);
  const stream = useMemo(() => logbookStream(day), [day]);
  const { data: taskRows, isLoading } = useQuery<TaskRow>(statement?.sql ?? NONE_SQL, statement?.params ?? [], { streams: statement ? [{ ...stream, ttl: 60 * 60 }] : undefined });
  const steps = useMemo(() => buildChecklistMatch(query), [query]);
  const { data: itemRows } = useQuery<{ task_id: string; title: string }>(steps?.sql ?? NO_ITEMS_SQL, steps?.params ?? []);
  const { data: projectRows } = useQuery<ProjectStateRow>(ALL_PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<TagRef>(TAGS_SQL);

  // Search reaches every project, finished ones included (said with their state); the filters offer the open ones.
  const allProjects = useMemo(() => (projectRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", state: p.state })), [projectRows]);
  const projects = useMemo(() => allProjects.filter((p) => isOpenProject(p.state)).map(({ id, name }) => ({ id, name })), [allProjects]);
  const areas = useMemo(() => (areaRows ?? []).map((a) => ({ id: a.id, name: a.name ?? "Untitled area" })), [areaRows]);
  const { hits, alsoFound } = useMemo(() => {
    const found = new Map<string, string[]>();
    for (const r of itemRows ?? []) found.set(r.task_id, [...(found.get(r.task_id) ?? []), r.title]);
    const names = new Map(allProjects.map((p) => [p.id, p.name]));
    const tasks = (taskRows ?? []).map(toTask);
    const split = splitResults(tasks, day, filters.state);
    const hit = (t: (typeof tasks)[number]): SearchHit => ({ task: t, projectName: t.projectId ? (names.get(t.projectId) ?? null) : null, context: contextFor(t, found.get(t.id) ?? [], query) });
    return { hits: split.found.map(hit), alsoFound: split.alsoFound.map(hit) };
  }, [taskRows, itemRows, allProjects, day, query, filters.state]);
  const projectMatches = useMemo(() => rankNamed(query, allProjects, 5).map((p) => ({ id: p.id, name: p.name, note: projectStateLabel(p.state) })), [query, allProjects]);
  const areaMatches = useMemo(() => rankNamed(query, areas, 5), [query, areas]);

  return (
    <SearchView
      part={dayPart(now.toZonedDateTimeISO(zone).hour)}
      query={draft}
      onQueryChange={setDraft}
      filters={filters}
      onFiltersChange={setFilters}
      projects={projects}
      areas={areas}
      tags={tagRows ?? []}
      // Also while the words just typed have not reached the statements yet, so "Nothing matched" is never said of them early.
      searching={draft.trim() !== query.trim() || (Boolean(statement) && isLoading)}
      hits={hits}
      alsoFound={alsoFound}
      projectMatches={projectMatches}
      areaMatches={areaMatches}
      today={today}
      now={now}
      zone={zone}
      defaultEstimateMin={settings?.defaultEstimateMin ?? 30}
      onOpen={(task) => router.push(`/task/${task.id}`)}
      // Every write records its own undo; the toast with Undo is the app's one (ui/undo-provider.tsx).
      onComplete={(task) => void repo.complete(task.id)}
      onMove={(task, move) => void runHitMove(repo, task.id, move, today)}
      onSnooze={(task, preset) => void applySnooze(repo, [task.id], preset)}
      onOpenProject={(id) => router.push(`/project/${id}`)}
      onOpenArea={(id) => router.push(`/area/${id}`)}
      onAddTask={(title) => quickAdd.open({ text: title })}
      older={query.trim() ? <OlderFound words={query} zone={zone} today={today} /> : null}
    />
  );
}
