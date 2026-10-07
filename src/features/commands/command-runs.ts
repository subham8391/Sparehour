// The keyboard layer's half of the command registry (SCREENS.md §12, §24): every command's id, chord, when it
// is available and what it runs — all a key needs, so this is what the shell carries. The words the palette and
// the ? overlay show (title, group, keywords) are registry.ts, which loads with them (SYSTEM_DESIGN.md §11.6).
// A new command is a run here and its words there, under the same id.
import type { Instant, LocalDate } from "@/core/time";
import { TODAY_SORTS } from "@/core/today/sort-options";
import type { Priority } from "@/core/types";
import type { TaskPatch, TaskRepo, TaskState } from "@/data/repositories/task-repo";
import type { PlanMode } from "@/features/planning/drawing";
import { requestRow } from "@/features/tasks/row-request";
import { requestOrganize } from "@/features/tasks/organize";
import { applySnooze, snoozePresets, type SnoozePreset } from "@/features/tasks/snooze";
import type { DetailField } from "@/features/tasks/task-detail";
import { requestToday } from "@/features/today/today-request";
import type { Binding } from "./keys";
import { hasViewKey, runViewKey, type ViewKey } from "./view-keys";

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
  /** One picker for every ticked row: the choice is one write and one undo; the ticks clear after. */
  editTicked: (field: DetailField) => void;
  moveSelection: (delta: 1 | -1) => void;
  openPalette: (query?: string, scope?: PaletteScope) => void;
  openShortcuts: () => void;
  setTheme: (theme: Theme) => void;
  undo: () => void;
  /** Places the task in the next free gap that fits its estimate (only where a day is in view). */
  blockTask: (id: string) => void;
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
  /** The one view the command belongs to (`/today`, or every `/project/…` page): listed elsewhere, but disabled with the reason. */
  onlyOn?: { path: string; reason: string };
}

/** Commands that need exactly one task (open, the field pickers) use the keyboard selection. */
const onSelected =
  (fn: (ctx: CommandContext, id: string) => void | Promise<void>) =>
  (ctx: CommandContext): void | Promise<void> => {
    if (ctx.selectedTaskId) return fn(ctx, ctx.selectedTaskId);
  };

/** A command for one task: the keyboard selection, else the only ticked row. */
const onOne =
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

const onTargets =
  (fn: (ctx: CommandContext, ids: string[]) => void | Promise<void>) =>
  (ctx: CommandContext): void | Promise<void> => {
    const ids = targets(ctx);
    if (ids.length > 0) return fn(ctx, ids);
  };

const applyPatch = (ctx: CommandContext, ids: string[], patch: TaskPatch, note?: string) => {
  if (ids.length === 1) return note === undefined ? ctx.tasks.update(ids[0], patch) : ctx.tasks.update(ids[0], patch, note);
  return note === undefined ? ctx.tasks.updateMany(ids, patch) : ctx.tasks.updateMany(ids, patch, note);
};
const applyState = (ctx: CommandContext, ids: string[], state: TaskState) => (ids.length === 1 ? ctx.tasks.setState(ids[0], state) : ctx.tasks.setStateMany(ids, state));

const snooze = (presetId: SnoozePreset["id"]) =>
  onTargets((ctx, ids) => {
    const preset = snoozePresets(ctx.now, ctx.zone, ctx.today).find((p) => p.id === presetId);
    if (preset) return applySnooze(ctx.tasks, ids, preset);
  });

/** A key the view on screen gives its meaning to (view-keys.ts), handed the selected task. */
const viewKey = (key: ViewKey) => (ctx: CommandContext) => void runViewKey(key, ctx.selectedTaskId);
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
    if (ids.length === 1) ctx.openTask(ids[0], field);
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
const projectIn = (pathname: string): string | null => {
  const id = /^\/project\/([^/?#]+)/.exec(pathname)?.[1];
  return id ? decodeURIComponent(id) : null;
};

/**
 * N (SCREENS.md §24 "Add a task in the current list"): quick-add opened with the words that file the task where
 * the person is — the project's token on a project, "today" on Today — and empty anywhere else.
 */
export async function prefillHere(ctx: Pick<CommandContext, "pathname" | "projectName">): Promise<string | undefined> {
  if (ctx.pathname === "/today") return "today ";
  const id = projectIn(ctx.pathname);
  if (!id) return undefined;
  const name = await ctx.projectName(id);
  if (!name) return undefined;
  // The token rules live with the quick-add parser, which stays out of the shell (SYSTEM_DESIGN.md §11.6).
  const { projectToken } = await import("@/features/quickadd/interpret");
  return `${projectToken(name)} `;
}

const ON_TODAY = { path: "/today", reason: "on Today" };
const ON_PROJECT = { path: "/project/", reason: "on a project" };

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
  { id: "task.nextweek", requiresSelection: true, run: snooze("nextweek") },
  // `.` (SCREENS.md §24): the selected row's ⋯ menu; a row without one (a week column's compact row) opens the task.
  // With nothing selected the key is typing, and opens quick add like any other (SCREENS.md §1 rule 4).
  {
    id: "task.menu",
    shortcut: ".",
    requiresSelection: true,
    run: onSelected((ctx, id) => void (requestRow(id, "menu") || ctx.openTask(id))),
    passes: (ctx) => !ctx.selectedTaskId,
  },
  // Move to… (SCREENS.md §3): the row's day picker; several ticked rows share the bulk date picker, and a row with
  // no picker of its own opens its detail at the do-date.
  {
    id: "task.move-day",
    requiresSelection: true,
    run: onTargets((ctx, ids) => {
      if (ids.length > 1) return ctx.editTicked("do");
      if (!requestRow(ids[0], "move")) ctx.openTask(ids[0], "do");
    }),
  },
  { id: "task.someday", shortcut: "s", requiresSelection: true, run: onTargets((ctx, ids) => applyState(ctx, ids, "someday")) },
  { id: "task.drop", shortcut: "backspace", requiresSelection: true, run: onTargets((ctx, ids) => applyState(ctx, ids, "dropped")) },
  { id: "task.priority1", shortcut: "1", requiresSelection: true, run: priority(3) },
  { id: "task.priority2", shortcut: "2", requiresSelection: true, run: priority(2) },
  { id: "task.priority3", shortcut: "3", requiresSelection: true, run: priority(1) },
  { id: "task.priority0", shortcut: "0", requiresSelection: true, run: priority(0) },
  { id: "task.block", shortcut: "b", requiresSelection: true, run: onSelected((ctx, id) => ctx.blockTask(id)) },
  { id: "task.do", shortcut: "d", requiresSelection: true, run: pickField("do") },
  { id: "task.deadline", shortcut: "shift+d", requiresSelection: true, run: pickField("deadline") },
  { id: "task.start", shortcut: "shift+s", requiresSelection: true, run: pickField("start") },
  { id: "task.estimate", shortcut: "e", requiresSelection: true, run: pickField("estimate") },
  // A rule is set one task at a time: R opens the Repeat picker of the selected task, or of the one ticked row.
  { id: "task.repeat", shortcut: "r", requiresSelection: true, run: onOne((ctx, id) => ctx.openTask(id, "repeat")) },
  // PRODUCT_SPEC.md §6: the task's steps become tasks of a new project, which opens with the cursor in its add row.
  {
    id: "task.convert",
    requiresSelection: true,
    run: onOne(async (ctx, id) => {
      const out = await ctx.tasks.convertToProject(id);
      if (out) ctx.go(`/project/${encodeURIComponent(out.projectId)}?add=1`);
    }),
  },
  // Organising (SCREENS.md §24, §12): the pickers, Duplicate and Copy link run in a lazy island (tasks/organize.tsx).
  { id: "task.move-project", shortcut: "#", requiresSelection: true, run: pick("move"), unselected: typesItself("#") },
  { id: "task.add-tag", shortcut: "@", requiresSelection: true, run: pick("tag"), unselected: typesItself("@") },
  // M lists projects and, once a task can sit loose in one, areas (DECISIONS.md "Loose tasks in an area").
  { id: "task.move", shortcut: "m", requiresSelection: true, run: pick("move", true), unselected: typesItself("m") },
  { id: "task.duplicate", requiresSelection: true, run: onOne((_, id) => requestOrganize({ kind: "duplicate", id })) },
  { id: "task.copy-link", requiresSelection: true, run: onOne((_, id) => requestOrganize({ kind: "copy-link", id })) },
  {
    id: "project.duplicate",
    onlyOn: ON_PROJECT,
    run: (ctx) => {
      const id = projectIn(ctx.pathname);
      if (id) requestOrganize({ kind: "duplicate-project", id });
    },
  },
  // A repeat's series edits (SYSTEM_DESIGN.md §5.2), one task at a time; they do nothing to a task that does not repeat.
  // The logic loads with the recurrence engine (TaskRepo.series()), never with the shell.
  { id: "task.skip-occurrence", requiresSelection: true, run: onOne(async (ctx, id) => (await ctx.tasks.series()).skip(id)) },
  { id: "task.pause-repeats", requiresSelection: true, run: onOne((ctx, id) => ctx.openTask(id, "pause")) },
  { id: "task.resume-repeats", requiresSelection: true, run: onOne(async (ctx, id) => (await ctx.tasks.series()).resume(id)) },
  // Where days sit side by side (Upcoming's week); elsewhere the arrows do nothing.
  { id: "task.day-earlier", shortcut: "arrowleft", requiresSelection: true, run: viewKey("earlier"), passes: unclaimed("earlier", true) },
  { id: "task.day-later", shortcut: "arrowright", requiresSelection: true, run: viewKey("later"), passes: unclaimed("later", true) },

  // ---- create
  { id: "create.task", shortcut: "q", run: (ctx) => ctx.quickAdd() },
  { id: "create.task-here", shortcut: "n", run: async (ctx) => ctx.quickAdd(await prefillHere(ctx)) },
  { id: "create.project", run: (ctx) => ctx.go("/browse?add=project") },
  { id: "create.area", run: (ctx) => ctx.go("/browse?add=area") },

  // ---- go to
  { id: "go.today", shortcut: "g t", run: (ctx) => ctx.go("/today") },
  { id: "go.inbox", shortcut: "g i", run: (ctx) => ctx.go("/inbox") },
  { id: "go.upcoming", shortcut: "g u", run: (ctx) => ctx.go("/upcoming") },
  { id: "go.calendar", shortcut: "g c", run: (ctx) => ctx.go("/calendar") },
  { id: "go.someday", shortcut: "g s", run: (ctx) => ctx.go("/someday") },
  { id: "go.logbook", shortcut: "g l", run: (ctx) => ctx.go("/logbook") },
  { id: "go.project", shortcut: "g p", run: (ctx) => ctx.openPalette("", "projects") },
  { id: "go.area", shortcut: "g a", run: (ctx) => ctx.openPalette("", "areas") },
  { id: "go.browse", run: (ctx) => ctx.go("/browse") },
  { id: "go.settings", shortcut: "mod+,", run: (ctx) => ctx.go("/settings") },
  { id: "day.plan", shortcut: "mod+shift+m", run: (ctx) => ctx.go("/plan") },
  { id: "day.shutdown", shortcut: "mod+shift+e", run: (ctx) => ctx.go("/shutdown") },
  { id: "day.plan-my-day", shortcut: "mod+shift+p", run: (ctx) => ctx.planDay("plan") },
  // Trim today (PRODUCT_SPEC.md §9.4): Today opens its panel, at once or as soon as Today is open. The ellipsis says a
  // panel opens (and keeps "today" finding Go to Today first).
  { id: "day.trim", run: (ctx) => void (requestToday({ kind: "trim" }) || ctx.go("/today")) },
  { id: "day.replan", run: (ctx) => ctx.planDay("replan") },

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
  { id: "list.clear-checks", run: (ctx) => ctx.clearChecks() },

  // ---- view
  { id: "view.prev", shortcut: "[", run: viewKey("prev"), passes: unclaimed("prev") },
  { id: "view.next", shortcut: "]", run: viewKey("next"), passes: unclaimed("next") },
  // Sort and Show completed are Today's view preferences (DECISIONS.md "Sort", 2026-10-06): Today only. "Sort by…"
  // reopens the palette on the five sorts once the palette has closed behind it.
  { id: "view.sort", onlyOn: ON_TODAY, run: (ctx) => void setTimeout(() => ctx.openPalette("Sort Today by "), 0) },
  ...TODAY_SORTS.map(
    (o): CommandRun => ({
      id: `view.sort-${o.value}`,
      onlyOn: ON_TODAY,
      run: () => void requestToday({ kind: "sort", sort: o.value }),
    }),
  ),
  { id: "view.show-completed", onlyOn: ON_TODAY, run: () => void requestToday({ kind: "completed" }) },
  { id: "view.theme-light", run: (ctx) => ctx.setTheme("light") },
  { id: "view.theme-dark", run: (ctx) => ctx.setTheme("dark") },
  { id: "view.theme-system", run: (ctx) => ctx.setTheme("system") },

  // ---- app
  { id: "app.undo", shortcut: "mod+z", run: (ctx) => ctx.undo() },
  { id: "app.palette", shortcut: "mod+k", run: (ctx) => ctx.openPalette() },
  { id: "app.search", shortcut: "/", run: (ctx) => ctx.go("/search") },
  { id: "app.export", run: (ctx) => ctx.go("/settings") },
  { id: "app.connect-calendar", run: (ctx) => ctx.go("/settings#calendar") },
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
export function availability(command: CommandRun, ctx: Pick<CommandContext, "selectedTaskId" | "checkedTaskIds"> & { pathname?: string }): Availability {
  const only = command.onlyOn;
  if (only && ctx.pathname !== only.path && !(only.path.endsWith("/") && ctx.pathname?.startsWith(only.path))) return { enabled: false, reason: only.reason };
  if (command.requiresSelection && targets(ctx).length === 0) return { enabled: false, reason: "select a task first" };
  return { enabled: true };
}
