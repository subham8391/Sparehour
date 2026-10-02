"use client";
// Palette state lives above the keyboard layer (which opens it) while the
// palette itself renders inside it (it runs commands): PaletteProvider holds
// open/query, PaletteHost draws it.
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { TASK_SEARCH_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useCommands } from "./keyboard-provider";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { pushRecent } from "./palette-rank";
import { availability, type Command } from "./registry";

interface PaletteApi {
  open: (query?: string) => void;
  close: () => void;
  isOpen: boolean;
}

// The palette is an island like quick-add (CLAUDE.md: the shells stay under 320 KB): fetched when the browser is idle,
// so ⌘K opens it at once without it riding in every first download.
const loadPalette = () => import("./palette");
const Palette = dynamic(() => loadPalette().then((m) => m.Palette), { ssr: false });

const PaletteContext = createContext<PaletteApi | null>(null);

export function usePalette(): PaletteApi {
  const api = useContext(PaletteContext);
  if (!api) throw new Error("usePalette needs a PaletteProvider above it");
  return api;
}

interface PaletteState {
  open: boolean;
  initialQuery: string;
  key: number;
}

const PaletteStateContext = createContext<PaletteState>({ open: false, initialQuery: "", key: 0 });

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PaletteState>({ open: false, initialQuery: "", key: 0 });
  const open = useCallback((query = "") => setState((s) => ({ open: true, initialQuery: query, key: s.key + 1 })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const api = useMemo(() => ({ open, close, isOpen: state.open }), [open, close, state.open]);
  useEffect(() => preloadOnIdle(loadPalette), []);
  return (
    <PaletteContext.Provider value={api}>
      <PaletteStateContext.Provider value={state}>{children}</PaletteStateContext.Provider>
    </PaletteContext.Provider>
  );
}

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
