// The keyboard layer's half of the command registry (SCREENS.md §12, §24): every command with a key — its id,
// chord, when it is available and what it runs — all a key needs, so this is what the shell carries. Commands the
// palette alone lists (no key) are palette-runs.ts, and the words the palette and the ? overlay show (title, group,
// keywords) are registry.ts; both load with the palette and the overlay (SYSTEM_DESIGN.md §11.6). A new command is
// a run here (or there, without a key) and its words in registry.ts, under the same id.
import type { Instant, LocalDate } from "@/core/time";
import type { Priority } from "@/core/types";
import type { TaskPatch, TaskRepo, TaskState } from "@/data/repositories/task-repo";
import type { PlanMode } from "@/features/planning/drawing";
import { requestRow } from "@/features/tasks/row-request";
import { requestOrganize } from "@/features/tasks/organize";
import { applySnooze, snoozePresets, type SnoozePreset } from "@/features/tasks/snooze";
import type { DetailField } from "@/features/tasks/task-detail";
import { requestToday } from "@/features/today/today-request";
import { requestTimeline, timelineUnavailable } from "@/features/today/timeline-request";
import { needsWidth, toggleSidebar } from "@/features/shell/panes";
import type { Binding } from "./keys";
import { hasViewKey, runViewKey, type ViewKey } from "./view-keys";

// Today's day address (`?day=`) loads with Today, or when a Day command first runs: not with every shell.
export const loadDays = () => import("@/features/today/day-address");

export type Theme = "light" | "dark" | "system";
/** `G P` and `G A` open the palette on the open projects or the areas alone (SCREENS.md §24). */
export type PaletteScope = "projects" | "areas";

export interface CommandContext {
  selectedTaskId: string | null;
  /** Rows ticked for a bulk edit (X, Shift-click, long-press). While any are ticked, the selected-task edits act on all of them. */
  checkedTaskIds: readonly string[];
  toggleCheck: (id: string) => void;
  checkAll: () => void;
  clearChecks: () => void;
  pathname: string;
  today: LocalDate;
  now: Instant;
  zone: string;
  tasks: TaskRepo;
  go: (href: string) => void;
  quickAdd: (prefill?: string) => void;
  /** Opens the task's detail; with a field, that field's picker opens with it, focused. */
  openTask: (id: string, field?: DetailField) => void;
  /** The task whose detail is open, if any: E there opens the panel's own Estimate field. */
  detailId?: string | null;
  /** Cmd+. away from Today: closes the open detail, or opens the last one again (else the selected task's). */
  toggleDetail?: () => void;
  /** One picker for every ticked row: the choice is one write and one undo; the ticks clear after. */
  editTicked: (field: DetailField) => void;
  moveSelection: (delta: 1 | -1) => void;
  openPalette: (query?: string, scope?: PaletteScope) => void;
  openShortcuts: () => void;
  setTheme: (theme: Theme) => void;
  undo: () => void;
  /** Makes the latest undone change again (⇧⌘Z, Ctrl+Y, the palette's Redo). */
  redo: () => void;
  /** Whether an undone change is waiting to be made again: without one the palette lists Redo off, with the reason. */
  canRedo: boolean;
  /** Places the task in the next free gap that fits its estimate (only where a day is in view). */
  blockTask: (id: string) => void;
  /** Whether a day on screen takes Block it (Today, the Calendar, the morning plan's last step): elsewhere it is off, with the reason. */
  canBlock?: boolean;
  /** Opens the Plan my day preview where the day is (Today, or the morning plan's last step); elsewhere it goes to Today first. */
  planDay: (mode: PlanMode) => void;
  /** A task's state as this device has it, or null when the id is not a task here (a repeat's completion row in the Logbook). */
  taskState: (id: string) => Promise<string | null>;
  /** A project's name, or null when it is not on this device. */
  projectName: (id: string) => Promise<string | null>;
}

export interface CommandRun {
  id: string;
  /** "t", "shift+t", "mod+k", "g t" — see keys.ts. */
  shortcut?: string;
  requiresSelection?: boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
  /** What the key does when it needs a selection and there is none (`T` goes back to today's page of a dated view). */
  unselected?: (ctx: CommandContext) => void;
  /** True when nothing on screen takes the key, so it goes on as if unbound: an arrow scrolls, `[` types into quick add. */
  passes?: (ctx: CommandContext) => boolean;
  /** A chord a Mac browser keeps for itself (⌘Y opens History): on a Mac it goes on unbound and the ? overlay leaves it out. */
  notOnMac?: boolean;
  /** The one view the command belongs to (`/today`, or every `/project/…` page): listed elsewhere, but disabled with the reason. */
  onlyOn?: { path: string; reason: string };
  /** Why it cannot run right now (no timeline on screen, no block selected, nothing to redo), or null when it can. */
  unavailable?: (ctx: Partial<Pick<CommandContext, "canRedo" | "canBlock">>) => string | null;
}

/** Commands that need exactly one task (open, the field pickers) use the keyboard selection. */
export const onSelected =
  (fn: (ctx: CommandContext, id: string) => void | Promise<void>) =>
  (ctx: CommandContext): void | Promise<void> => {
    if (ctx.selectedTaskId) return fn(ctx, ctx.selectedTaskId);
  };

/** A command for one task: the keyboard selection, else the only ticked row. */
export const onOne =
  (fn: (ctx: CommandContext, id: string) => void | Promise<void>) =>
  (ctx: CommandContext): void | Promise<void> => {
    const id = ctx.selectedTaskId ?? (ctx.checkedTaskIds.length === 1 ? ctx.checkedTaskIds[0] : null);
    if (id) return fn(ctx, id);
  };

/** The tasks an edit applies to: every ticked row, or else the keyboard selection. */
export function targets(ctx: Pick<CommandContext, "selectedTaskId" | "checkedTaskIds">): string[] {
  if (ctx.checkedTaskIds.length > 0) return [...ctx.checkedTaskIds];
  return ctx.selectedTaskId ? [ctx.selectedTaskId] : [];
}

export const onTargets =
  (fn: (ctx: CommandContext, ids: string[]) => void | Promise<void>) =>
  (ctx: CommandContext): void | Promise<void> => {
    const ids = targets(ctx);
    if (ids.length > 0) return fn(ctx, ids);
  };

export const applyPatch = (ctx: CommandContext, ids: string[], patch: TaskPatch, note?: string) => {
  if (ids.length === 1) return note === undefined ? ctx.tasks.update(ids[0], patch) : ctx.tasks.update(ids[0], patch, note);
  return note === undefined ? ctx.tasks.updateMany(ids, patch) : ctx.tasks.updateMany(ids, patch, note);
};
export const applyState = (ctx: CommandContext, ids: string[], state: TaskState) => (ids.length === 1 ? ctx.tasks.setState(ids[0], state) : ctx.tasks.setStateMany(ids, state));

export const snooze = (presetId: SnoozePreset["id"]) =>
  onTargets((ctx, ids) => {
    const preset = snoozePresets(ctx.now, ctx.zone, ctx.today).find((p) => p.id === presetId);
    if (preset) return applySnooze(ctx.tasks, ids, preset);
  });

/** A key the view on screen gives its meaning to (view-keys.ts), handed the selected task. */
export const viewKey = (key: ViewKey) => (ctx: CommandContext) => void runViewKey(key, ctx.selectedTaskId);
/** A view key passes on where no view takes it, or (`needsTask`) while no task is selected. */
const unclaimed = (key: ViewKey, needsTask = false) => (ctx: CommandContext) => !hasViewKey(key) || (needsTask && !ctx.selectedTaskId);

/** J/K: the next row in the view's order, or inside its column where the view keeps them there (Upcoming's week). */
const selectNext = (ctx: CommandContext, delta: 1 | -1) => {
  if (!runViewKey(delta === 1 ? "down" : "up", ctx.selectedTaskId)) ctx.moveSelection(delta);
};

const priority = (value: Priority) => onTargets((ctx, ids) => applyPatch(ctx, ids, { priority: value }));

/**
 * D, ⇧D, ⇧S, E (SCREENS.md §24): the field's picker. One task — the selection, or the one ticked row — opens in
 * the detail with the picker open; several ticked rows get one picker that sets all of them (DECISIONS.md
 * "Shortcuts with rows ticked").
 */
const pickField = (field: DetailField) =>
  onTargets((ctx, ids) => {
    // E on one row opens the presets beside its estimate chip, the chip's own picker (SCREENS.md §2.4); the detail when
    // that task's detail is open, or where no row answers.
    if (ids.length === 1) void ((field === "estimate" && ctx.detailId !== ids[0] && requestRow(ids[0], "estimate")) || ctx.openTask(ids[0], field));
    else ctx.editTicked(field);
  });

/**
 * U (SCREENS.md §8, §24): un-complete. Only a done task is reopened — anything else the selection lands on is
 * left as it is, so the key is harmless outside the Logbook. Each reopen is its own undo entry.
 */
const uncomplete = onTargets(async (ctx, ids) => {
  for (const id of ids) {
    if ((await ctx.taskState(id)) === "done") await ctx.tasks.reopen(id);
  }
});

/**
 * ⌘Enter (SCREENS.md §24 "Complete / un-complete"): a done task reopens (as U does, its own undo entry), anything
 * else completes, the open ones in one write and one undo (a repeat still rolls on). Mixed ticked rows each toggle.
 */
const toggleComplete = onTargets(async (ctx, ids) => {
  const states = await Promise.all(ids.map((id) => ctx.taskState(id)));
  const open = ids.filter((_, i) => states[i] !== "done");
  for (const id of ids.filter((_, i) => states[i] === "done")) await ctx.tasks.reopen(id);
  if (open.length === 1) await ctx.tasks.complete(open[0]);
  else if (open.length > 1) await ctx.tasks.completeMany(open);
});

/** The project a `/project/<id>` path shows, else null. */
export const projectIn = (pathname: string): string | null => {
  const id = /^\/project\/([^/?#]+)/.exec(pathname)?.[1];
  return id ? decodeURIComponent(id) : null;
};

/**
 * N (SCREENS.md §24 "Add a task in the current list"): quick-add opened with the words that file the task where
 * the person is — the project's token on a project, "today" on Today (or the later day it was stepped to) — and
 * empty anywhere else.
 */
export async function prefillHere(ctx: Pick<CommandContext, "pathname" | "projectName" | "today">): Promise<string | undefined> {
  if (ctx.pathname === "/today") {
    const { dayWords, parseDay } = await loadDays();
    const search = typeof window === "undefined" ? "" : window.location.search;
    return dayWords(parseDay(new URLSearchParams(search).get("day")) ?? ctx.today, ctx.today);
  }
  const id = projectIn(ctx.pathname);
  if (!id) return undefined;
  const name = await ctx.projectName(id);
  if (!name) return undefined;
  // The token rules live with the quick-add parser, which stays out of the shell (SYSTEM_DESIGN.md §11.6).
  const { projectToken } = await import("@/features/quickadd/interpret");
  return `${projectToken(name)} `;
}

export const ON_TODAY = { path: "/today", reason: "on Today" };
export const ON_PROJECT = { path: "/project/", reason: "on a project" };

/** `#`, `@` and `M` with nothing selected open quick-add and type themselves, as any unbound key does (§1 rule 4). */
const typesItself = (key: string) => (ctx: CommandContext) => ctx.quickAdd(key);
const pick = (kind: "move" | "tag", areas = false) => onTargets((_, ids) => requestOrganize(kind === "tag" ? { kind, ids } : { kind, ids, areas }));

/** In the registry's order: the palette lists its words over these, by id. */
export const RUNS: readonly CommandRun[] = [
  // ---- selected task (or every ticked row)
  // Space peeks (opens the detail); Enter edits the title in place, or opens the task where no row can (SCREENS.md §24).
  { id: "task.open", shortcut: "space", requiresSelection: true, run: onSelected((ctx, id) => ctx.openTask(id)) },
  { id: "task.rename", shortcut: "enter", requiresSelection: true, run: onSelected((ctx, id) => void (requestRow(id, "rename") || ctx.openTask(id))) },
  { id: "task.complete", shortcut: "mod+enter", requiresSelection: true, run: toggleComplete },
  { id: "task.uncomplete", shortcut: "u", requiresSelection: true, run: uncomplete },
  {
    id: "task.today",
    shortcut: "t",
    requiresSelection: true,
    run: onTargets((ctx, ids) => applyPatch(ctx, ids, { doDate: ctx.today, doTime: null, evening: false }, "Moved {title} to today")),
    unselected: viewKey("home"),
  },
  { id: "task.tomorrow", shortcut: "shift+t", requiresSelection: true, run: snooze("tomorrow") },
  { id: "task.evening", shortcut: "shift+e", requiresSelection: true, run: snooze("evening") },
  { id: "task.weekend", shortcut: "w", requiresSelection: true, run: snooze("weekend") },
  { id: "task.in4h", shortcut: "h", requiresSelection: true, run: snooze("in4h") },
  // `.` (SCREENS.md §24): the selected row's ⋯ menu; a row without one (a week column's compact row) opens the task.
  // With nothing selected the key is typing, and opens quick add like any other (SCREENS.md §1 rule 4).
  {
    id: "task.menu",
    shortcut: ".",
    requiresSelection: true,
    run: onSelected((ctx, id) => void (requestRow(id, "menu") || ctx.openTask(id))),
    passes: (ctx) => !ctx.selectedTaskId,
  },
  { id: "task.someday", shortcut: "s", requiresSelection: true, run: onTargets((ctx, ids) => applyState(ctx, ids, "someday")) },
  { id: "task.drop", shortcut: "backspace", requiresSelection: true, run: onTargets((ctx, ids) => applyState(ctx, ids, "dropped")) },
  { id: "task.priority1", shortcut: "1", requiresSelection: true, run: priority(3) },
  { id: "task.priority2", shortcut: "2", requiresSelection: true, run: priority(2) },
  { id: "task.priority3", shortcut: "3", requiresSelection: true, run: priority(1) },
  { id: "task.priority0", shortcut: "0", requiresSelection: true, run: priority(0) },
  // Off a day that places blocks it is listed off with the reason rather than doing nothing (SCREENS.md §12 rules).
  { id: "task.block", shortcut: "b", requiresSelection: true, run: onSelected((ctx, id) => ctx.blockTask(id)), unavailable: (ctx) => (ctx.canBlock === false ? "where a timeline is shown" : null) },
  { id: "task.do", shortcut: "d", requiresSelection: true, run: pickField("do") },
  { id: "task.deadline", shortcut: "shift+d", requiresSelection: true, run: pickField("deadline") },
  { id: "task.start", shortcut: "shift+s", requiresSelection: true, run: pickField("start") },
  { id: "task.estimate", shortcut: "e", requiresSelection: true, run: pickField("estimate") },
  // A rule is set one task at a time: R opens the Repeat picker of the selected task, or of the one ticked row.
  { id: "task.repeat", shortcut: "r", requiresSelection: true, run: onOne((ctx, id) => ctx.openTask(id, "repeat")) },
  // Organising (SCREENS.md §24, §12): the pickers, Duplicate and Copy link run in a lazy island (tasks/organize.tsx).
  { id: "task.move-project", shortcut: "#", requiresSelection: true, run: pick("move"), unselected: typesItself("#") },
  { id: "task.add-tag", shortcut: "@", requiresSelection: true, run: pick("tag"), unselected: typesItself("@") },
  // M lists projects and, once a task can sit loose in one, areas (DECISIONS.md "Loose tasks in an area").
  { id: "task.move", shortcut: "m", requiresSelection: true, run: pick("move", true), unselected: typesItself("m") },
  // Where days sit side by side (Upcoming's week); elsewhere the arrows do nothing.
  { id: "task.day-earlier", shortcut: "arrowleft", requiresSelection: true, run: viewKey("earlier"), passes: unclaimed("earlier", true) },
  { id: "task.day-later", shortcut: "arrowright", requiresSelection: true, run: viewKey("later"), passes: unclaimed("later", true) },

  // ---- create
  { id: "create.task", shortcut: "q", run: (ctx) => ctx.quickAdd() },
  { id: "create.task-here", shortcut: "n", run: async (ctx) => ctx.quickAdd(await prefillHere(ctx)) },

  // ---- go to
  { id: "go.today", shortcut: "g t", run: (ctx) => ctx.go("/today") },
  { id: "go.inbox", shortcut: "g i", run: (ctx) => ctx.go("/inbox") },
  { id: "go.upcoming", shortcut: "g u", run: (ctx) => ctx.go("/upcoming") },
  { id: "go.calendar", shortcut: "g c", run: (ctx) => ctx.go("/calendar") },
  { id: "go.someday", shortcut: "g s", run: (ctx) => ctx.go("/someday") },
  { id: "go.logbook", shortcut: "g l", run: (ctx) => ctx.go("/logbook") },
  { id: "go.project", shortcut: "g p", run: (ctx) => ctx.openPalette("", "projects") },
  { id: "go.area", shortcut: "g a", run: (ctx) => ctx.openPalette("", "areas") },
  { id: "go.settings", shortcut: "mod+,", run: (ctx) => ctx.go("/settings") },
  { id: "day.plan", shortcut: "mod+shift+m", run: (ctx) => ctx.go("/plan") },
  { id: "day.shutdown", shortcut: "mod+shift+e", run: (ctx) => ctx.go("/shutdown") },
  { id: "day.plan-my-day", shortcut: "mod+shift+p", run: (ctx) => ctx.planDay("plan") },

  // ---- list plumbing
  { id: "list.down", shortcut: "j", run: (ctx) => selectNext(ctx, 1) },
  { id: "list.up", shortcut: "k", run: (ctx) => selectNext(ctx, -1) },
  { id: "list.down-arrow", shortcut: "arrowdown", run: (ctx) => selectNext(ctx, 1) },
  { id: "list.up-arrow", shortcut: "arrowup", run: (ctx) => selectNext(ctx, -1) },
  {
    id: "list.check",
    shortcut: "x",
    requiresSelection: true,
    run: (ctx) => {
      if (ctx.selectedTaskId) ctx.toggleCheck(ctx.selectedTaskId);
    },
  },
  { id: "list.check-all", shortcut: "mod+a", run: (ctx) => ctx.checkAll() },

  // ---- view
  { id: "view.prev", shortcut: "[", run: viewKey("prev"), passes: unclaimed("prev") },
  { id: "view.next", shortcut: "]", run: viewKey("next"), passes: unclaimed("next") },
  // The timeline on screen (SCREENS.md §2.6, §24): + and - step its rows; with no timeline the keys type as unbound keys do.
  ...(["zoom-in", "zoom-out"] as const).map(
    (z): CommandRun => ({ id: `view.${z}`, shortcut: z === "zoom-in" ? "+" : "-", run: () => void requestTimeline(z), passes: () => timelineUnavailable(false) !== null, unavailable: () => timelineUnavailable(false) }),
  ),
  // The panes (SCREENS.md §1, §24): Cmd+\ folds the sidebar to the rail from the medium band. Cmd+. is the context
  // pane's: on Today the timeline (the List | Day view below the wide band, DECISIONS.md "Medium and narrow Today"),
  // elsewhere the task detail.
  { id: "view.toggle-sidebar", shortcut: "mod+\\", run: toggleSidebar, unavailable: needsWidth(900) },
  { id: "view.toggle-pane", shortcut: "mod+.", run: (ctx) => void (ctx.pathname === "/today" ? requestToday({ kind: "pane" }) : ctx.toggleDetail?.()), unavailable: needsWidth(640) },

  // ---- app
  { id: "app.undo", shortcut: "mod+z", run: (ctx) => ctx.undo() },
  // ⇧⌘Z everywhere, and Ctrl+Y as Windows has it (SCREENS.md §24); on a Mac ⌘Y stays the browser's History. Inside a
  // text field the browser keeps its own redo: the keyboard layer never takes keys from a typing target.
  { id: "app.redo", shortcut: "mod+shift+z", run: (ctx) => ctx.redo(), unavailable: (ctx) => (ctx.canRedo === false ? "after an undo" : null) },
  { id: "app.redo-y", shortcut: "mod+y", notOnMac: true, run: (ctx) => ctx.redo(), unavailable: (ctx) => (ctx.canRedo === false ? "after an undo" : null) },
  { id: "app.palette", shortcut: "mod+k", run: (ctx) => ctx.openPalette() },
  { id: "app.search", shortcut: "/", run: (ctx) => ctx.go("/search") },
  { id: "app.shortcuts", shortcut: "?", run: (ctx) => ctx.openShortcuts() },
];

/** Every command with a shortcut, for the keyboard layer (the registry's words ride along when they are passed in). */
export function keyBindings(): Binding<CommandRun>[];
export function keyBindings<T extends CommandRun>(commands: readonly T[]): Binding<T>[];
export function keyBindings(commands: readonly CommandRun[] = RUNS): Binding<CommandRun>[] {
  return commands.filter((c): c is CommandRun & { shortcut: string } => Boolean(c.shortcut)).map((c) => ({ shortcut: c.shortcut, value: c }));
}

export interface Availability {
  enabled: boolean;
  reason?: string;
}

/** Commands that need a selection are listed but disabled with the reason (§12 rules). */
export function availability(command: CommandRun, ctx: Pick<CommandContext, "selectedTaskId" | "checkedTaskIds"> & { pathname?: string; canRedo?: boolean; canBlock?: boolean }): Availability {
  const only = command.onlyOn;
  if (only && ctx.pathname !== only.path && !(only.path.endsWith("/") && ctx.pathname?.startsWith(only.path))) return { enabled: false, reason: only.reason };
  if (command.requiresSelection && targets(ctx).length === 0) return { enabled: false, reason: "select a task first" };
  const why = command.unavailable?.(ctx);
  return why ? { enabled: false, reason: why } : { enabled: true };
}
