"use client";
// The keyboard layer: one listener, the command registry, the `G` chords,
// and the rule that any unbound printable key opens quick-add and types
// itself (SCREENS.md §1 focus model, rule 4). Also owns the `?` overlay
// and the theme.
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { PROJECT_NAME_SQL, TASK_STATE_SQL } from "@/data/queries/views";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useBlockingOptional } from "@/features/blocking/blocking-provider";
import { requestPlan } from "@/features/planning/plan-request";
import { useUndoOptional } from "@/features/undo/undo-provider";
import { chordOf, resolveKey, type SequenceState } from "./keys";
import { COMMANDS, availability, keyBindings, type Command, type CommandContext, type Theme } from "./registry";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { applyTheme, readTheme } from "./theme";

const BINDINGS = keyBindings(COMMANDS);

interface CommandsApi {
  commands: readonly Command[];
  run: (command: Command) => void;
  context: () => CommandContext;
  isMac: boolean;
  openShortcuts: () => void;
}

const CommandsContext = createContext<CommandsApi | null>(null);

export function useCommands(): CommandsApi {
  const api = useContext(CommandsContext);
  if (!api) throw new Error("useCommands needs a KeyboardProvider above it");
  return api;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

/** A focused control that Enter or Space already presses (a button, a link, a menu item, a switch…). */
function isActivatable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(
    el.closest("a[href], button, summary, [role='button'], [role='link'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='checkbox'], [role='switch'], [role='radio'], [role='tab'], [role='option']"),
  );
}

function modalOpen(): boolean {
  return Boolean(document.querySelector("[role='dialog'][aria-modal='true']"));
}

export function KeyboardProvider({ children, onOpenPalette }: { children: ReactNode; onOpenPalette?: (query?: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const quickAdd = useQuickAdd();
  const detail = useTaskDetail();
  const selection = useSelection();
  const tasks = useTaskRepo();
  const db = useLocalDatabase();
  const undoApi = useUndoOptional();
  const blocking = useBlockingOptional();
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const isMac = useMemo(() => (typeof navigator !== "undefined" ? /Mac|iPhone|iPad/.test(navigator.platform) : true), []);

  useEffect(() => {
    applyTheme(readTheme());
  }, []);

  const context = useCallback(
    (): CommandContext => ({
      selectedTaskId: selection.selectedId,
      checkedTaskIds: selection.checkedIds,
      toggleCheck: selection.toggleCheck,
      checkAll: selection.checkAll,
      clearChecks: selection.clearChecks,
      pathname,
      today,
      now,
      zone,
      tasks,
      go: (href) => router.push(href),
      quickAdd: (prefill) => quickAdd.open(prefill),
      openTask: (id) => detail.open(id),
      moveSelection: (delta) => selection.moveSelection(delta),
      openPalette: (query) => onOpenPalette?.(query),
      openShortcuts: () => setShortcutsOpen(true),
      setTheme: (theme: Theme) => applyTheme(theme),
      undo: () => void undoApi?.undo(),
      blockTask: (id) => blocking?.blockTask(id),
      planDay: (mode) => {
        // Today and the morning plan take the request where they are; anywhere else it waits for Today to open.
        if (!requestPlan(mode)) router.push("/today");
      },
      taskState: async (id) => (await db.getOptional<{ state: string | null }>(TASK_STATE_SQL, [id]))?.state ?? null,
      projectName: async (id) => (await db.getOptional<{ name: string | null }>(PROJECT_NAME_SQL, [id]))?.name ?? null,
    }),
    [selection, pathname, today, now, zone, tasks, db, router, quickAdd, detail, onOpenPalette, undoApi, blocking],
  );
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });

  const run = useCallback((command: Command) => {
    const ctx = contextRef.current();
    if (!availability(command, ctx).enabled) return;
    void command.run(ctx);
  }, []);

  const pendingRef = useRef<SequenceState>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      if (isTypingTarget(e.target) || modalOpen()) {
        pendingRef.current = null;
        return;
      }
      // A focused control keeps its own keys: Enter and Space press the button or follow the link
      // (SCREENS.md §1 focus model). Only with nothing pressable focused do they open the selected task.
      if ((e.key === "Enter" || e.key === " ") && isActivatable(e.target)) {
        pendingRef.current = null;
        return;
      }
      const chord = chordOf(e, isMac);
      const r = resolveKey(chord, pendingRef.current, BINDINGS);
      pendingRef.current = r.pending;
      if (r.match) {
        e.preventDefault();
        run(r.match);
        return;
      }
      if (r.consumed) {
        e.preventDefault();
        return;
      }
      // Rule 4: an unbound printable key opens quick-add and types itself. No keystroke is lost.
      // Any modifier makes it a chord, not typing: Control+Z on a Mac (where ⌘ is the app's modifier) must not type a "z".
      if (!chord.mod && !chord.alt && !e.ctrlKey && !e.metaKey && e.key.length === 1 && !/\s/.test(e.key)) {
        e.preventDefault();
        contextRef.current().quickAdd(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMac, run]);

  const api = useMemo<CommandsApi>(() => ({ commands: COMMANDS, run, context: () => contextRef.current(), isMac, openShortcuts: () => setShortcutsOpen(true) }), [run, isMac]);

  return (
    <CommandsContext.Provider value={api}>
      {children}
      {shortcutsOpen && <ShortcutsDialog isMac={isMac} onClose={() => setShortcutsOpen(false)} />}
    </CommandsContext.Provider>
  );
}
