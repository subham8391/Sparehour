"use client";
// Mounts quick-add once for the whole app and wires the ways in: the desktop
// bottom bar and the phone FAB here; `Q` and "any printable key when nothing
// is focused" in the keyboard layer. Never navigates.
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { ProjectRepo } from "@/data/repositories/project-repo";
import { usePwaOptional } from "@/features/pwa/pwa-provider";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-provider";
import { Icon } from "@/ui/icons";
import type { QuickAddSubmission } from "./quick-add";
import { Kbd } from "@/ui/kbd";

// The sheet carries the natural-language parser and the project and tag lists
// it suggests from, so it stays out of the shell's first download
// (SYSTEM_DESIGN.md §11.6): fetched in idle time after the first paint,
// mounted on the first open.
const loadQuickAdd = () => import("./quick-add-connected");
const QuickAdd = dynamic(() => loadQuickAdd().then((m) => m.QuickAddConnected), { ssr: false });

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
  // Typing anywhere opens quick-add with the key (SCREENS.md §1 rule 4). Until the lazy sheet has taken focus every
  // further key lands here too: those are appended to the same opening, never a fresh sheet that drops the earlier ones.
  const open = useCallback(
    (prefill = "") => setState((s) => (s.open && prefill && s.initial ? { ...s, initial: s.initial + prefill } : { open: true, initial: prefill, key: s.key + 1 })),
    [],
  );
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  /** A fresh sheet holding exactly `text`: what an Undo of a discard brings back, never appended to anything. */
  const reopen = useCallback((text: string) => setState((s) => ({ open: true, initial: text, key: s.key + 1 })), []);
  useEffect(() => preloadOnIdle(loadQuickAdd), []);

  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;

  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const projectRepo = useMemo(() => new ProjectRepo(db), [db]);
  const pwa = usePwaOptional();
  const undo = useUndoSink();

  const onSubmit = useCallback(
    async (s: QuickAddSubmission): Promise<string> => {
      // Right after the first sync the watch query can lag the data by a beat; read the row directly rather than fail.
      const sid = spaceId ?? (await db.getOptional<{ personal_space_id: string | null }>(SPACE_SQL))?.personal_space_id ?? null;
      if (!sid) throw new Error("Your account is still loading — try again in a moment.");
      let projectId = s.projectId;
      if (!projectId && s.createProjectName) {
        // Two quick lines can both name the same new project before the list catches up: the second one joins the first.
        const existing = await db.getOptional<{ id: string }>(`select id from projects where deleted_at is null and lower(name) = lower(?) limit 1`, [s.createProjectName]);
        projectId = existing?.id ?? (await projectRepo.create(s.createProjectName, { spaceId: sid }));
      }
      const id = await tasks.create(s.draft, { spaceId: sid, projectId });
      // The first meaningful action is the moment to ask the browser to keep our storage (§10.4).
      pwa?.requestPersist();
      return id;
    },
    [spaceId, db, projectRepo, tasks, pwa],
  );

  // A paste is one undo entry for all its tasks (PRODUCT_SPEC.md §5.1 rule 6: "12 tasks — Undo"). The sheet's own
  // Undo and the stack's run the same take-back, and it runs once, whichever comes first.
  const onPasted = useCallback(
    (ids: readonly string[]) => {
      let taken: Promise<void> | null = null;
      const takeBack = () => (taken ??= tasks.removeCreated(ids));
      undo?.record({ label: `${ids.length} ${ids.length === 1 ? "task" : "tasks"} added`, toast: true, undo: takeBack });
      return takeBack;
    },
    [tasks, undo],
  );

  // Esc with words in the box discards them with a one-step undo (§5.1 rule 4): the toast reopens the sheet holding them.
  const onDiscard = useCallback(
    (text: string, title: string) => undo?.record({ label: `Discarded “${title}”`, toast: true, undo: async () => reopen(text) }),
    [undo, reopen],
  );

  const api = useMemo(() => ({ open }), [open]);
  return (
    <QuickAddContext.Provider value={api}>
      {children}
      {state.key > 0 && (
        <QuickAdd
          key={state.key}
          open={state.open}
          initial={state.initial}
          ctx={{ now, zone, today, eveningStartsAt: settings?.eveningStartsAt }}
          onClose={close}
          onSubmit={onSubmit}
          onPasted={onPasted}
          onDiscard={onDiscard}
        />
      )}
    </QuickAddContext.Provider>
  );
}


/**
 * The bar at the foot of the list column (narrow band and up): a real footer
 * under the column's scroll region (the shell's `Frame`), so it never sits
 * over a row; the width of the column and no wider, a hairline above the
 * button. On a phone the FAB does this job.
 */
export function QuickAddBar() {
  const { open } = useQuickAdd();
  return (
    <div className="hidden w-full max-w-210 shrink-0 bg-paper px-6 sm:block md:px-10">
      <div className="border-t border-line pt-3 pb-4">
        <button
          type="button"
          onClick={() => open()}
          className="flex h-11 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-3.5 text-left text-body-lg text-ink-3 transition-colors dur-fast hover:border-line-control hover:text-ink-2 active:bg-press"
        >
          <Icon name="plus" size={16} className="text-ink-2" />
          <span className="flex-1">Add a task</span>
          <Kbd>Q</Kbd>
        </button>
      </div>
    </div>
  );
}

/** The phone FAB: 56 px, ink, a rounded square, 16 px above the tab bar. `hidden` while a sheet owns the screen. */
export function QuickAddFab({ hidden = false }: { hidden?: boolean }) {
  const { open } = useQuickAdd();
  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label="Add a task"
      hidden={hidden}
      className="fixed right-5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-fab bg-ink text-ink-inverse shadow-lift transition-transform dur-fast motion-safe:active:scale-94 sm:hidden"
    >
      <Icon name="plus" size={24} strokeWidth={1.8} />
    </button>
  );
}
