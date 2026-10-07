"use client";
// The keyboard layer: one listener, the command registry, the `G` chords,
// and the rule that any unbound printable key opens quick-add and types
// itself (SCREENS.md §1 focus model, rule 4). Also owns the `?` overlay
// and the theme.
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { SETTINGS_SQL } from "@/data/queries/today";
import { SettingsRepo } from "@/data/repositories/user-settings-repo";
import { PROJECT_NAME_SQL, TASK_STATE_SQL } from "@/data/queries/shell";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { showsChrome } from "@/features/shell/nav";
import { requestBulkField } from "@/features/tasks/bulk-field-request";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useBlockingOptional } from "@/features/blocking/blocking-provider";
import { requestPlan } from "@/features/planning/plan-request";
import { useUndoOptional } from "@/features/undo/undo-provider";
import { chordOf, resolveKey, type SequenceState } from "./keys";
// The registry's runs only: titles and keywords load with the palette and the ? overlay (registry.ts).
import { RUNS, availability, keyBindings, type CommandContext, type CommandRun, type PaletteScope, type Theme } from "./command-runs";
import dynamic from "next/dynamic";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { applyTheme, readTheme } from "./theme";

const BINDINGS = keyBindings(RUNS);

interface CommandsApi {
  commands: readonly CommandRun[];
  run: (command: CommandRun) => void;
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

/** null outside the provider, so a component that only offers a command stays usable on its own (Settings › About). */
export function useCommandsOptional(): CommandsApi | null {
  return useContext(CommandsContext);
}

// The ? overlay loads on idle rather than with every page (the shells' 320 KB budget).
const loadShortcuts = () => import("./shortcuts-dialog");
const ShortcutsDialog = dynamic(() => loadShortcuts().then((m) => m.ShortcutsDialog), { ssr: false });

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

export function KeyboardProvider({ children, onOpenPalette }: { children: ReactNode; onOpenPalette?: (query?: string, scope?: PaletteScope) => void }) {
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
  useEffect(() => preloadOnIdle(loadShortcuts), []);
  // Appearance is an account setting (SCREENS.md §18): the stored choice follows the person to every device. This
  // device's copy (localStorage, read before paint) catches up once the settings row is here.
  const { data: settingsRows } = useQuery<{ id: string; theme: string | null }>(SETTINGS_SQL);
  const account = settingsRows?.[0];
  const accountTheme: Theme | null = account ? (account.theme === "light" || account.theme === "dark" ? account.theme : "system") : null;
  useEffect(() => {
    if (accountTheme && accountTheme !== readTheme()) applyTheme(accountTheme);
  }, [accountTheme]);
  const accountId = account?.id ?? null;

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
      openTask: (id, field) => detail.open(id, field),
      editTicked: (field) => void requestBulkField(field),
      moveSelection: (delta) => selection.moveSelection(delta),
      openPalette: (query, scope) => onOpenPalette?.(query, scope),
      openShortcuts: () => setShortcutsOpen(true),
      // The palette's theme commands save to the account like Settings does, so the two never disagree.
      setTheme: (theme: Theme) => {
        applyTheme(theme);
        if (accountId) void new SettingsRepo(db).update(accountId, { theme });
      },
      undo: () => void undoApi?.undo(),
      blockTask: (id) => blocking?.blockTask(id),
      planDay: (mode) => {
        // Today and the morning plan take the request where they are; anywhere else it waits for Today to open.
        if (!requestPlan(mode)) router.push("/today");
      },
      taskState: async (id) => (await db.getOptional<{ state: string | null }>(TASK_STATE_SQL, [id]))?.state ?? null,
      projectName: async (id) => (await db.getOptional<{ name: string | null }>(PROJECT_NAME_SQL, [id]))?.name ?? null,
    }),
    [selection, pathname, today, now, zone, tasks, db, router, quickAdd, detail, onOpenPalette, undoApi, blocking, accountId],
  );
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });

  const run = useCallback((command: CommandRun) => {
    const ctx = contextRef.current();
    if (availability(command, ctx).enabled) void command.run(ctx);
    else command.unselected?.(ctx);
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
      // The first run stands alone (ONBOARDING.md 1b and step 3): no single-key navigation, quick add or list keys
      // to wander off with; only the modifier chords (undo, the palette) still answer there.
      const bare = !showsChrome(contextRef.current().pathname);
      if (bare && !chord.mod) {
        pendingRef.current = null;
        return;
      }
      const r = resolveKey(chord, pendingRef.current, BINDINGS);
      pendingRef.current = r.pending;
      if (r.match) {
        // A key the view on screen does not take goes on as if unbound (an arrow scrolls, `[` types itself below).
        if (!r.match.passes?.(contextRef.current())) {
          e.preventDefault();
          run(r.match);
          return;
        }
      } else if (r.consumed) {
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

  const api = useMemo<CommandsApi>(() => ({ commands: RUNS, run, context: () => contextRef.current(), isMac, openShortcuts: () => setShortcutsOpen(true) }), [run, isMac]);

  return (
    <CommandsContext.Provider value={api}>
      {children}
      {shortcutsOpen && <ShortcutsDialog isMac={isMac} onClose={() => setShortcutsOpen(false)} />}
    </CommandsContext.Provider>
  );
}
