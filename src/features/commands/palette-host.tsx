"use client";
// The palette wired to the app: projects, areas and a task search from the
// local database, recents from this browser, and the commands with the
// registry's words, run through the keyboard layer. An island with the
// palette itself (palette-provider.tsx mounts it in idle time, or at the
// first ⌘K), so none of it rides in the shell's first download.
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { TASK_SEARCH_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useCommands } from "./keyboard-provider";
import { Palette } from "./palette";
import { PaletteStateContext, usePalette } from "./palette-provider";
import { pushRecent } from "./palette-rank";
import { COMMANDS, availability, type Command } from "./registry";

const RECENTS_KEY = "sparehour.recent-commands";
/** The projects and areas opened lately, newest first: `G P` and `G A` list them first. */
const PLACES_KEY = "sparehour.recent-places";
const PLACES_LIMIT = 12;

function readRecents(key = RECENTS_KEY): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const NONE_SQL = `select * from tasks where 0`;

/** Renders the palette; must sit inside KeyboardProvider and PaletteProvider. */
export function PaletteHost() {
  const state = useContext(PaletteStateContext);
  const { close } = usePalette();
  const { run, context, isMac } = useCommands();
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const detail = useTaskDetail();
  const now = useNow();
  const { today } = useLocalDay(now);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecents()));
  const [places, setPlaces] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecents(PLACES_KEY)));
  // Each opening re-reads what other tabs may have run (and opened) since.
  const [seenKey, setSeenKey] = useState(state.key);
  if (seenKey !== state.key) {
    setSeenKey(state.key);
    setRecents(readRecents());
    setPlaces(readRecents(PLACES_KEY));
  }
  // Every project or area page opened while the palette is loaded counts as recent, however it was reached.
  const pathname = usePathname();
  useEffect(() => {
    const m = /^\/(?:project|area)\/([^/?#]+)/.exec(pathname);
    if (!m) return;
    try {
      localStorage.setItem(PLACES_KEY, JSON.stringify(pushRecent(readRecents(PLACES_KEY), decodeURIComponent(m[1]), PLACES_LIMIT)));
    } catch {
      // storage unavailable: the scoped palette keeps its plain order
    }
  }, [pathname]);

  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const q = query.trim();
  const like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const searching = state.open && q && !state.scope;
  const { data: taskRows } = useQuery<TaskRowType>(searching ? TASK_SEARCH_SQL : NONE_SQL, searching ? [like, like] : []);

  const projects = useMemo(() => (projectRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", href: `/project/${p.id}` })), [projectRows]);
  const areas = useMemo(() => (areaRows ?? []).map((a) => ({ id: a.id, name: a.name ?? "Untitled area", href: `/area/${a.id}` })), [areaRows]);
  const tasks = useMemo(() => (taskRows ?? []).map(toTask), [taskRows]);
  const avail = useCallback((c: Command) => availability(c, context()), [context]);

  const onRun = (command: Command) => {
    const next = pushRecent(recents, command.id);
    setRecents(next);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: recents just don't persist
    }
    run(command);
  };

  if (!state.open) return null;
  return (
    <Palette
      key={state.key}
      open={state.open}
      initialQuery={state.initialQuery}
      scope={state.scope}
      places={places}
      commands={COMMANDS}
      availability={avail}
      recents={recents}
      projects={projects}
      areas={areas}
      tasks={tasks}
      today={today}
      isMac={isMac}
      onQueryChange={setQuery}
      onRun={onRun}
      onOpenTask={(id) => detail.open(id)}
      onGo={(href) => router.push(href)}
      onAddTask={(title) => quickAdd.open(title)}
      onClose={close}
    />
  );
}
