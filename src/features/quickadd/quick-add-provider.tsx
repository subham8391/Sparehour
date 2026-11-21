"use client";
// Mounts quick-add once for the whole app and wires the ways in: the desktop
// bottom bar and the phone FAB here; `Q` and "any printable key when nothing
// is focused" in the keyboard layer; and the installed app's "Add a task"
// shortcut, which opens `/today?quickadd=1` (features/pwa/manifest.ts).
// Never navigates.
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { usePwaOptional } from "@/features/pwa/pwa-provider";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-provider";
import { Icon } from "@/ui/icons";
import type { QuickAddSubmission } from "./quick-add";
import { SPACE_SQL, saveSubmission } from "./save-submission";
import { Kbd } from "@/ui/kbd";

// The sheet carries the natural-language parser and the project and tag lists
// it suggests from, so it stays out of the shell's first download
// (SYSTEM_DESIGN.md §11.6): fetched in idle time after the first paint,
// mounted on the first open.
const loadQuickAdd = () => import("./quick-add-connected");
const QuickAdd = dynamic(() => loadQuickAdd().then((m) => m.QuickAddConnected), { ssr: false });

/**
 * Where a task added "here" is filed when its line does not say (DECISIONS.md, amendment 2026-11-15): the day Today
 * is showing (ISO date) or the project whose page is open. Nothing is typed into the box for it; the sheet's strip
 * shows it as a chip that can be taken off.
 */
export interface AddHere {
  day?: string;
  projectId?: string;
}

interface QuickAddApi {
  open: (prefill?: string, here?: AddHere) => void;
}

const QuickAddContext = createContext<QuickAddApi | null>(null);

export function useQuickAdd(): QuickAddApi {
  const api = useContext(QuickAddContext);
  if (!api) throw new Error("useQuickAdd needs a QuickAddProvider above it");
  return api;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; initial: string; key: number; here: AddHere | null }>({ open: false, initial: "", key: 0, here: null });
  // Typing anywhere opens quick-add with the key (SCREENS.md §1 rule 4). Until the lazy sheet has taken focus every
  // further key lands here too: those are appended to the same opening, never a fresh sheet that drops the earlier ones.
  const open = useCallback(
    (prefill = "", here: AddHere | null = null) => setState((s) => (s.open && prefill && s.initial ? { ...s, initial: s.initial + prefill } : { open: true, initial: prefill, key: s.key + 1, here })),
    [],
  );
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  /** A fresh sheet holding exactly `text`: what an Undo of a discard brings back, never appended to anything. */
  const reopen = useCallback((text: string) => setState((s) => ({ open: true, initial: text, key: s.key + 1, here: s.here })), []);
  useEffect(() => preloadOnIdle(loadQuickAdd), []);
  // The "Add a task" shortcut: the sheet opens and the mark comes off the address, so a reload does not repeat it.
  // A beat after mounting, and the mark only goes as the sheet opens, so a mount that is undone first loses nothing.
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get("quickadd") !== "1") return;
    const timer = setTimeout(() => {
      url.searchParams.delete("quickadd");
      history.replaceState(history.state, "", url.pathname + url.search);
      open();
    });
    return () => clearTimeout(timer);
  }, [open]);

  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;

  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const pwa = usePwaOptional();
  const undo = useUndoSink();

  const onSubmit = useCallback(
    async (s: QuickAddSubmission): Promise<string> => {
      // The space, the project the line names and the task (save-submission.ts). A new project is made by the sheet's
      // own island (quick-add-connected.tsx): it sent this line, so it is already in memory.
      const id = await saveSubmission({ db, tasks, spaceId, makeProject: async (...made) => (await loadQuickAdd()).createProject(...made) }, s);
      // The first meaningful action is the moment to ask the browser to keep our storage (§10.4).
      pwa?.requestPersist();
      return id;
    },
    [spaceId, db, tasks, pwa],
  );

  // A paste is one undo entry for all its tasks (PRODUCT_SPEC.md §5.1 rule 6: "12 tasks — Undo"). The sheet's own
  // Undo and the stack's run the same take-back, and it runs once, whichever comes first.
  const onPasted = useCallback(
    (ids: readonly string[]) => {
      let taken: Promise<void> | null = null;
      const takeBack = () => (taken ??= tasks.removeCreated(ids));
      // Once a redo has made them again, the sheet's Undo takes them back again rather than answer with the old take-back.
      const settled = (now: "redone" | "undone") => {
        if (now === "redone") taken = null;
      };
      undo?.record({ label: `${ids.length} ${ids.length === 1 ? "task" : "tasks"} added`, toast: true, rows: { tasks: ids, task_tags: { task_id: ids } }, undo: takeBack, settled });
      return takeBack;
    },
    [tasks, undo],
  );

  // Esc with words in the box discards them with a one-step undo (§5.1 rule 4): the toast reopens the sheet holding
  // them, and a redo discards them again.
  const onDiscard = useCallback(
    (text: string, title: string) => {
      const again = { redo: async () => close(), undo: async () => reopen(text) };
      undo?.record({
        label: `Discarded “${title}”`,
        toast: true,
        undo: async () => {
          await again.undo();
          return again;
        },
      });
    },
    [undo, reopen, close],
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
          here={state.here}
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
 * button. On a phone the FAB does this job. No backdrop of its own: nothing
 * scrolls beneath it, and a painted one ended partway across a wide window
 * with no context pane (and wore the root paper on Color Field's per-view
 * pages), so the page simply runs on under it.
 *
 * `onAdd` is what the shell hands it: add a task where the person is (the `N` command), so on Today, or the day it
 * was stepped to, the task lands on that day and on a project in that project, with nothing typed into the box for
 * it (DECISIONS.md, amendment 2026-11-15). Without it the bar is plain quick add (`Q`), which files a line with no
 * day in the Inbox.
 */
export function QuickAddBar({ onAdd }: { onAdd?: () => void }) {
  const { open } = useQuickAdd();
  return (
    <div className="hidden w-full max-w-210 shrink-0 px-6 sm:block md:px-10">
      <div className="border-t border-line pt-3 pb-4">
        <button
          type="button"
          onClick={() => (onAdd ? onAdd() : open())}
          className="flex h-11 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-3.5 text-left text-body-lg text-ink-3 transition-colors dur-fast hover:border-line-control hover:text-ink-2 active:bg-press"
        >
          <Icon name="plus" size={16} className="text-ink-2" />
          <span className="flex-1">Add a task</span>
          <Kbd>{onAdd ? "N" : "Q"}</Kbd>
        </button>
      </div>
    </div>
  );
}

/** The phone FAB: 56 px, the look's primary colours (ink in Sky), a rounded square, 16 px above the tab bar. `hidden` while a sheet owns the screen. */
export function QuickAddFab({ hidden = false, onAdd }: { hidden?: boolean; /** As the bar's: add where the person is. */ onAdd?: () => void }) {
  const { open } = useQuickAdd();
  return (
    <button
      type="button"
      onClick={() => (onAdd ? onAdd() : open())}
      aria-label="Add a task"
      hidden={hidden}
      className="fixed right-5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center btn-fill btn-fab rounded-fab transition-transform dur-fast motion-safe:active:scale-94 sm:hidden"
    >
      <Icon name="plus" size={24} strokeWidth={1.8} />
    </button>
  );
}
