"use client";
// Search (SCREENS.md §13). The URL is the state — `/search?q=…&project=…` —
// so a search can be shared; the statements run against the local database
// and update as it syncs.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import type { TagRef } from "@/core/types";
import { toTask } from "@/data/mappers";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { TAGS_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { rankNamed } from "@/features/commands/palette-rank";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { CHECKLIST_MATCH_SQL, buildTaskSearch, contextFor, likePattern, parseSearchParams, splitResults, toSearchParams, type SearchFilters } from "@/features/search/search";
import { SearchView, type SearchHit } from "@/features/search/search-view";
import { useListSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";

const NONE_SQL = `select * from tasks where 0`;
const NO_ITEMS_SQL = `select task_id, title from checklist_items where 0`;
const DEBOUNCE_MS = 150;

export default function SearchPage() {
  return (
    <Suspense>
      <SearchScreen />
    </Suspense>
  );
}

function SearchScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const key = params.toString();
  const { query, filters } = useMemo(() => parseSearchParams(new URLSearchParams(key)), [key]);

  // Typing updates the box at once and the URL a beat later; the URL drives the statements.
  const [draft, setDraft] = useState(query);
  const [seen, setSeen] = useState(query);
  if (seen !== query) {
    setSeen(query);
    setDraft(query);
  }
  useEffect(() => {
    if (draft === query) return;
    const t = setTimeout(() => router.replace(`/search?${toSearchParams(draft, filters)}`), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, query, filters, router]);
  const setFilters = (next: SearchFilters) => router.replace(`/search?${toSearchParams(draft, next)}`);

  const now = useNow();
  const { today } = useLocalDay(now);
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  const quickAdd = useQuickAdd();

  const statement = useMemo(() => buildTaskSearch(query, filters), [query, filters]);
  const { data: taskRows, isLoading } = useQuery<TaskRowType>(statement?.sql ?? NONE_SQL, statement?.params ?? []);
  const { data: itemRows } = useQuery<{ task_id: string; title: string }>(query.trim() ? CHECKLIST_MATCH_SQL : NO_ITEMS_SQL, query.trim() ? [likePattern(query)] : []);
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<TagRef>(TAGS_SQL);

  const projects = useMemo(() => (projectRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project" })), [projectRows]);
  const areas = useMemo(() => (areaRows ?? []).map((a) => ({ id: a.id, name: a.name ?? "Untitled area" })), [areaRows]);
  const { hits, alsoFound } = useMemo(() => {
    const steps = new Map<string, string[]>();
    for (const r of itemRows ?? []) steps.set(r.task_id, [...(steps.get(r.task_id) ?? []), r.title]);
    const names = new Map(projects.map((p) => [p.id, p.name]));
    const tasks = (taskRows ?? []).map(toTask);
    const split = splitResults(tasks, today);
    const hit = (t: (typeof tasks)[number]): SearchHit => ({ task: t, projectName: t.projectId ? (names.get(t.projectId) ?? null) : null, context: contextFor(t, steps.get(t.id) ?? [], query) });
    return { hits: split.found.map(hit), alsoFound: split.alsoFound.map(hit) };
  }, [taskRows, itemRows, projects, today, query]);
  const projectMatches = useMemo(() => rankNamed(query, projects, 5).map((p) => ({ ...p, href: `/project/${p.id}` })), [query, projects]);
  const areaMatches = useMemo(() => rankNamed(query, areas, 5).map((a) => ({ ...a, href: `/area/${a.id}` })), [query, areas]);

  const sel = useListSelection([...hits, ...alsoFound].map((h) => h.task.id));
  const close = () => {
    if (window.history.length > 1) router.back();
    else router.push("/today");
  };

  return (
    <SearchView
      query={draft}
      onQueryChange={setDraft}
      filters={filters}
      onFiltersChange={setFilters}
      projects={projects}
      areas={areas}
      tags={tagRows ?? []}
      searching={Boolean(statement) && isLoading}
      hits={hits}
      alsoFound={alsoFound}
      projectMatches={projectMatches}
      areaMatches={areaMatches}
      today={today}
      selectedId={sel.selectedId}
      onSelect={(id) => sel.select(id)}
      onOpen={(id) => detail.open(id)}
      onDone={(id) => void repo.complete(id)}
      onAddTask={(title) => quickAdd.open(title)}
      onClose={close}
    />
  );
}
