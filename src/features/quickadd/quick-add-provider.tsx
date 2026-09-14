"use client";
// Mounts quick-add once for the whole app and wires the ways in: the desktop
// bottom bar and the phone FAB here; `Q` and "any printable key when nothing
// is focused" in the keyboard layer. Never navigates.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { PROJECTS_SQL, type ProjectRow } from "@/data/queries/nav";
import { ProjectRepo } from "@/data/repositories/project-repo";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Icon } from "@/ui/icons";
import { QuickAdd, type QuickAddSubmission } from "./quick-add";

const SPACE_SQL = `select personal_space_id from users limit 1`;

interface QuickAddApi {
  open: (prefill?: string) => void;
}

const QuickAddContext = createContext<QuickAddApi | null>(null);

export function useQuickAdd(): QuickAddApi {
  const api = useContext(QuickAddContext);
  if (!api) throw new Error("useQuickAdd needs a QuickAddProvider above it");
  return api;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ open: false, initial: "", key: 0 });
  const open = useCallback((prefill = "") => setState((s) => ({ open: true, initial: prefill, key: s.key + 1 })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;
  const projects = useMemo(() => (projectRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project" })), [projectRows]);

  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const projectRepo = useMemo(() => new ProjectRepo(db), [db]);

  const onSubmit = useCallback(
    async (s: QuickAddSubmission) => {
      if (!spaceId) throw new Error("no space yet");
      let projectId = s.projectId;
      if (!projectId && s.createProjectName) projectId = await projectRepo.create(s.createProjectName, { spaceId });
      await tasks.create(s.draft, { spaceId, projectId });
    },
    [spaceId, projectRepo, tasks],
  );

  const api = useMemo(() => ({ open }), [open]);
  return (
    <QuickAddContext.Provider value={api}>
      {children}
      <QuickAdd
        key={state.key}
        open={state.open}
        initial={state.initial}
        projects={projects}
        ctx={{ now, zone, today, eveningStartsAt: settings?.eveningStartsAt }}
        onClose={close}
        onSubmit={onSubmit}
      />
    </QuickAddContext.Provider>
  );
}

const KBD = "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line border-b-2 bg-surface px-1.5 font-mono text-[11px] text-ink-2";

/** The always-present bar at the bottom of the main pane (narrow band and up). */
export function QuickAddBar() {
  const { open } = useQuickAdd();
  return (
    <div className="sticky bottom-0 z-10 mt-auto hidden border-t border-line bg-paper/90 px-6 py-2 backdrop-blur sm:block md:px-10">
      <button
        type="button"
        onClick={() => open()}
        className="flex h-10 w-full max-w-6xl items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-[15px] text-ink-3 hover:border-line-strong hover:text-ink-2"
      >
        <Icon name="plus" size={16} />
        <span className="flex-1">Add a task</span>
        <kbd className={KBD}>Q</kbd>
      </button>
    </div>
  );
}

/** The phone FAB, above the tab bar. */
export function QuickAddFab() {
  const { open } = useQuickAdd();
  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label="Add a task"
      className="fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-30 flex size-14 items-center justify-center rounded-full bg-ink text-paper shadow-lg sm:hidden"
    >
      <Icon name="plus" size={24} />
    </button>
  );
}
