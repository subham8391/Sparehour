"use client";
// The palette wired to the app: projects, areas and a task search from the
// local database, recents from this browser, and the keyboard layer's
// commands. An island with the palette itself (palette-provider.tsx mounts
// it in idle time, or at the first ⌘K), so none of it rides in the shell's
// first download.
import { useRouter } from "next/navigation";
import { useCallback, useContext, useMemo, useState } from "react";
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
import { availability, type Command } from "./registry";

const RECENTS_KEY = "sparehour.recent-commands";

function readRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
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
  const { commands, run, context, isMac } = useCommands();
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const detail = useTaskDetail();
  const now = useNow();
  const { today } = useLocalDay(now);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecents()));
  // Each opening re-reads what other tabs may have run since.
  const [seenKey, setSeenKey] = useState(state.key);
  if (seenKey !== state.key) {
    setSeenKey(state.key);
    setRecents(readRecents());
  }

  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const q = query.trim();
  const like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const { data: taskRows } = useQuery<TaskRowType>(state.open && q ? TASK_SEARCH_SQL : NONE_SQL, state.open && q ? [like, like] : []);

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
      commands={commands}
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
