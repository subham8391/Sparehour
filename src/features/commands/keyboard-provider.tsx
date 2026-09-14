"use client";
// The keyboard layer: one listener, the command registry, the `G` chords,
// and the rule that any unbound printable key opens quick-add and types
// itself (SCREENS.md §1 focus model, rule 4). Also owns the `?` overlay
// and the theme.
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useBlockingOptional } from "@/features/blocking/blocking-provider";
import { useUndoOptional } from "@/features/undo/undo-provider";
import { Icon } from "@/ui/icons";
import { chordOf, displayShortcut, resolveKey, type SequenceState } from "./keys";
import { COMMANDS, GROUP_ORDER, availability, keyBindings, type Command, type CommandContext, type Theme } from "./registry";
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
    }),
    [selection, pathname, today, now, zone, tasks, router, quickAdd, detail, onOpenPalette, undoApi, blocking],
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
      if (!chord.mod && !chord.alt && e.key.length === 1 && !/\s/.test(e.key)) {
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

const KBD = "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line border-b-2 bg-surface px-1.5 font-mono text-[11px] text-ink-2";

/** The `?` overlay (SCREENS.md §24): every shortcut, grouped as the spec groups them. */
function ShortcutsDialog({ isMac, onClose }: { isMac: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const groups = GROUP_ORDER.map((g) => ({ group: g, commands: COMMANDS.filter((c) => c.group === g && c.shortcut) })).filter((g) => g.commands.length > 0);
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-start sm:justify-center sm:pt-[8vh]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/20" />
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="relative flex max-h-[85dvh] w-full flex-col rounded-t-[20px] border-t border-line bg-surface shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-display text-2xl text-ink">Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-m-2 flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-paper hover:text-ink">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 overflow-y-auto px-5 pb-6 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.group}>
              <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{g.group}</h3>
              <dl className="flex flex-col gap-1.5">
                {g.commands.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 text-[14px]">
                    <dt className="text-ink">{c.title}</dt>
                    <dd>
                      <kbd className={KBD}>{displayShortcut(c.shortcut!, isMac)}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="text-[12.5px] text-ink-3 sm:col-span-2">Any other letter opens quick-add and types itself. `T` with nothing selected jumps to today.</p>
        </div>
      </div>
    </div>
  );
}
