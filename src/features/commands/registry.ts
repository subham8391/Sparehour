// The command registry (SCREENS.md §12, §24): every action the keyboard or
// the palette can run, as data. Shortcuts are learned from the palette,
// which shows them beside each command.
import type { Instant, LocalDate } from "@/core/time";
import type { Priority } from "@/core/types";
import type { TaskPatch, TaskRepo, TaskState } from "@/data/repositories/task-repo";
import type { PlanMode } from "@/features/planning/drawing";
import { snoozePresets } from "@/features/tasks/snooze";
import type { DetailField } from "@/features/tasks/task-detail";
import type { Binding } from "./keys";
import { hasViewKey, runViewKey, type ViewKey } from "./view-keys";

export type CommandGroup = "Create" | "Go to" | "Selected task" | "List" | "View" | "App";
export const GROUP_ORDER: readonly CommandGroup[] = ["Selected task", "Create", "Go to", "List", "View", "App"];

export type Theme = "light" | "dark" | "system";

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
  openPalette: (query?: string) => void;
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

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** "t", "shift+t", "mod+k", "g t" — see keys.ts. */
  shortcut?: string;
  /** Extra words the palette matches on. */
  keywords?: string;
  requiresSelection?: boolean;
  /** Hidden from the palette (pure keyboard plumbing such as J/K). */
  hidden?: boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
  /** What the key does when it needs a selection and there is none (`T` goes back to today's page of a dated view). */
  unselected?: (ctx: CommandContext) => void;
  /** True when nothing on screen takes the key, so it goes on as if unbound: an arrow scrolls, `[` types into quick add. */
  passes?: (ctx: CommandContext) => boolean;
}

/** Commands that need exactly one task (open, the field pickers) use the keyboard selection. */
const onSelected =
  (fn: (ctx: CommandContext, id: string) => void | Promise<void>) =>
  (ctx: CommandContext): void | Promise<void> => {
    if (ctx.selectedTaskId) return fn(ctx, ctx.selectedTaskId);
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

const snooze = (presetId: "evening" | "tomorrow" | "in4h" | "weekend" | "nextweek") =>
  onTargets((ctx, ids) => {
    const preset = snoozePresets(ctx.now, ctx.zone, ctx.today).find((p) => p.id === presetId);
    if (preset) return applyPatch(ctx, ids, preset.patch, `Moved {title} to ${preset.label.toLowerCase()}`);
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
 * N (SCREENS.md §24 "Add a task in the current list"): quick-add opened with the words that file the task where
 * the person is — the project's token on a project, "today" on Today — and empty anywhere else.
 */
export async function prefillHere(ctx: Pick<CommandContext, "pathname" | "projectName">): Promise<string | undefined> {
  if (ctx.pathname === "/today") return "today ";
  const id = /^\/project\/([^/?#]+)/.exec(ctx.pathname)?.[1];
  if (!id) return undefined;
  const name = await ctx.projectName(decodeURIComponent(id));
  if (!name) return undefined;
  // The token rules live with the quick-add parser, which stays out of the shell (SYSTEM_DESIGN.md §11.6).
  const { projectToken } = await import("@/features/quickadd/interpret");
  return `${projectToken(name)} `;
}

export const COMMANDS: readonly Command[] = [
  // ---- selected task (or every ticked row)
  { id: "task.open", title: "Open", group: "Selected task", shortcut: "enter", requiresSelection: true, run: onSelected((ctx, id) => ctx.openTask(id)) },
  { id: "task.peek", title: "Peek", group: "Selected task", shortcut: "space", requiresSelection: true, hidden: true, run: onSelected((ctx, id) => ctx.openTask(id)) },
  { id: "task.complete", title: "Complete", group: "Selected task", shortcut: "mod+enter", requiresSelection: true, run: onTargets((ctx, ids) => (ids.length === 1 ? ctx.tasks.complete(ids[0]) : ctx.tasks.completeMany(ids))) },
  { id: "task.uncomplete", title: "Un-complete", group: "Selected task", shortcut: "u", requiresSelection: true, keywords: "reopen restore done logbook", run: uncomplete },
  {
    id: "task.today",
    title: "Move to Today",
    group: "Selected task",
    shortcut: "t",
    requiresSelection: true,
    run: onTargets((ctx, ids) => applyPatch(ctx, ids, { doDate: ctx.today, doTime: null, evening: false }, "Moved {title} to today")),
    unselected: viewKey("home"),
  },
  { id: "task.tomorrow", title: "Tomorrow", group: "Selected task", shortcut: "shift+t", requiresSelection: true, run: snooze("tomorrow") },
  { id: "task.evening", title: "This evening", group: "Selected task", shortcut: "shift+e", requiresSelection: true, run: snooze("evening") },
  { id: "task.weekend", title: "This weekend", group: "Selected task", shortcut: "w", requiresSelection: true, run: snooze("weekend") },
  { id: "task.in4h", title: "In 4 hours", group: "Selected task", shortcut: "h", requiresSelection: true, run: snooze("in4h") },
  { id: "task.nextweek", title: "Next week", group: "Selected task", requiresSelection: true, run: snooze("nextweek") },
  { id: "task.someday", title: "Move to Someday", group: "Selected task", shortcut: "s", requiresSelection: true, run: onTargets((ctx, ids) => applyState(ctx, ids, "someday")) },
  { id: "task.drop", title: "Drop", group: "Selected task", shortcut: "backspace", requiresSelection: true, run: onTargets((ctx, ids) => applyState(ctx, ids, "dropped")) },
  { id: "task.priority1", title: "Priority 1", group: "Selected task", shortcut: "1", requiresSelection: true, run: priority(3) },
  { id: "task.priority2", title: "Priority 2", group: "Selected task", shortcut: "2", requiresSelection: true, run: priority(2) },
  { id: "task.priority3", title: "Priority 3", group: "Selected task", shortcut: "3", requiresSelection: true, run: priority(1) },
  { id: "task.priority0", title: "No priority", group: "Selected task", shortcut: "0", requiresSelection: true, run: priority(0) },
  { id: "task.block", title: "Block it", group: "Selected task", shortcut: "b", requiresSelection: true, keywords: "schedule time slot gap", run: onSelected((ctx, id) => ctx.blockTask(id)) },
  { id: "task.do", title: "Pick a date", group: "Selected task", shortcut: "d", requiresSelection: true, keywords: "do date when day schedule", run: pickField("do") },
  { id: "task.deadline", title: "Set deadline", group: "Selected task", shortcut: "shift+d", requiresSelection: true, keywords: "due", run: pickField("deadline") },
  { id: "task.start", title: "Set start date", group: "Selected task", shortcut: "shift+s", requiresSelection: true, keywords: "starts after hide until", run: pickField("start") },
  { id: "task.estimate", title: "Set estimate", group: "Selected task", shortcut: "e", requiresSelection: true, keywords: "time minutes", run: pickField("estimate") },
  // A rule is set one task at a time: R opens the Repeat picker of the selected task (or of the one ticked row).
  {
    id: "task.repeat",
    title: "Repeat",
    group: "Selected task",
    shortcut: "r",
    requiresSelection: true,
    keywords: "recurring every",
    run: (ctx) => {
      const id = ctx.selectedTaskId ?? (ctx.checkedTaskIds.length === 1 ? ctx.checkedTaskIds[0] : null);
      if (id) ctx.openTask(id, "repeat");
    },
  },
  // Where days sit side by side (Upcoming's week); elsewhere the arrows do nothing.
  { id: "task.day-earlier", title: "A day earlier", group: "Selected task", shortcut: "arrowleft", requiresSelection: true, hidden: true, run: viewKey("earlier"), passes: unclaimed("earlier", true) },
  { id: "task.day-later", title: "A day later", group: "Selected task", shortcut: "arrowright", requiresSelection: true, hidden: true, run: viewKey("later"), passes: unclaimed("later", true) },

  // ---- create
  { id: "create.task", title: "Add task", group: "Create", shortcut: "q", keywords: "new quick add", run: (ctx) => ctx.quickAdd() },
  { id: "create.task-here", title: "Add a task in this list", group: "Create", shortcut: "n", hidden: true, run: async (ctx) => ctx.quickAdd(await prefillHere(ctx)) },
  { id: "create.project", title: "Add project", group: "Create", keywords: "new project", run: (ctx) => ctx.go("/browse?add=project") },
  { id: "create.area", title: "Add area", group: "Create", keywords: "new area", run: (ctx) => ctx.go("/browse?add=area") },

  // ---- go to
  { id: "go.today", title: "Go to Today", group: "Go to", shortcut: "g t", run: (ctx) => ctx.go("/today") },
  { id: "go.inbox", title: "Go to Inbox", group: "Go to", shortcut: "g i", run: (ctx) => ctx.go("/inbox") },
  { id: "go.upcoming", title: "Go to Upcoming", group: "Go to", shortcut: "g u", keywords: "week", run: (ctx) => ctx.go("/upcoming") },
  { id: "go.calendar", title: "Go to Calendar", group: "Go to", shortcut: "g c", run: (ctx) => ctx.go("/calendar") },
  { id: "go.someday", title: "Go to Someday", group: "Go to", shortcut: "g s", run: (ctx) => ctx.go("/someday") },
  { id: "go.logbook", title: "Go to Logbook", group: "Go to", shortcut: "g l", keywords: "done completed", run: (ctx) => ctx.go("/logbook") },
  { id: "go.browse", title: "Go to Browse", group: "Go to", keywords: "areas projects", run: (ctx) => ctx.go("/browse") },
  { id: "go.settings", title: "Settings", group: "Go to", shortcut: "mod+,", run: (ctx) => ctx.go("/settings") },
  { id: "day.plan", title: "Start morning plan", group: "Go to", shortcut: "mod+shift+m", keywords: "plan the day ritual pick", run: (ctx) => ctx.go("/plan") },
  { id: "day.shutdown", title: "Start evening shutdown", group: "Go to", shortcut: "mod+shift+e", keywords: "close the day ritual", run: (ctx) => ctx.go("/shutdown") },
  { id: "day.plan-my-day", title: "Plan my day", group: "Go to", shortcut: "mod+shift+p", keywords: "schedule suggest timeline blocks", run: (ctx) => ctx.planDay("plan") },
  { id: "day.replan", title: "Re-plan the rest of today", group: "Go to", keywords: "plan my day schedule blocks afternoon", run: (ctx) => ctx.planDay("replan") },

  // ---- list plumbing
  { id: "list.down", title: "Select next", group: "List", shortcut: "j", hidden: true, run: (ctx) => selectNext(ctx, 1) },
  { id: "list.up", title: "Select previous", group: "List", shortcut: "k", hidden: true, run: (ctx) => selectNext(ctx, -1) },
  { id: "list.down-arrow", title: "Select next", group: "List", shortcut: "arrowdown", hidden: true, run: (ctx) => selectNext(ctx, 1) },
  { id: "list.up-arrow", title: "Select previous", group: "List", shortcut: "arrowup", hidden: true, run: (ctx) => selectNext(ctx, -1) },
  {
    id: "list.check",
    title: "Tick the row for a bulk edit",
    group: "List",
    shortcut: "x",
    requiresSelection: true,
    keywords: "multi select",
    run: (ctx) => {
      if (ctx.selectedTaskId) ctx.toggleCheck(ctx.selectedTaskId);
    },
  },
  { id: "list.check-all", title: "Select all in this section", group: "List", shortcut: "mod+a", keywords: "multi bulk every", run: (ctx) => ctx.checkAll() },
  { id: "list.clear-checks", title: "Clear the selection", group: "List", keywords: "deselect none", run: (ctx) => ctx.clearChecks() },

  // ---- view
  { id: "view.prev", title: "Previous week", group: "View", shortcut: "[", hidden: true, run: viewKey("prev"), passes: unclaimed("prev") },
  { id: "view.next", title: "Next week", group: "View", shortcut: "]", hidden: true, run: viewKey("next"), passes: unclaimed("next") },
  { id: "view.theme-light", title: "Light theme", group: "View", keywords: "appearance", run: (ctx) => ctx.setTheme("light") },
  { id: "view.theme-dark", title: "Dark theme", group: "View", keywords: "appearance", run: (ctx) => ctx.setTheme("dark") },
  { id: "view.theme-system", title: "Follow the system theme", group: "View", keywords: "appearance auto", run: (ctx) => ctx.setTheme("system") },

  // ---- app
  { id: "app.undo", title: "Undo", group: "App", shortcut: "mod+z", run: (ctx) => ctx.undo() },
  { id: "app.palette", title: "Command palette", group: "App", shortcut: "mod+k", hidden: true, run: (ctx) => ctx.openPalette() },
  { id: "app.search", title: "Search", group: "App", shortcut: "/", keywords: "find filter", run: (ctx) => ctx.go("/search") },
  { id: "app.export", title: "Export your data", group: "App", keywords: "download backup json markdown csv", run: (ctx) => ctx.go("/settings") },
  { id: "app.connect-calendar", title: "Connect calendar", group: "App", keywords: "google meetings busy sync", run: (ctx) => ctx.go("/settings#calendar") },
  { id: "app.shortcuts", title: "Keyboard shortcuts", group: "App", shortcut: "?", keywords: "help keys", run: (ctx) => ctx.openShortcuts() },
];

/** Every command with a shortcut, for the keyboard layer. */
export function keyBindings(commands: readonly Command[] = COMMANDS): Binding<Command>[] {
  return commands.filter((c): c is Command & { shortcut: string } => Boolean(c.shortcut)).map((c) => ({ shortcut: c.shortcut, value: c }));
}

export interface Availability {
  enabled: boolean;
  reason?: string;
}

/** Commands that need a selection are listed but disabled with the reason (§12 rules). */
export function availability(command: Command, ctx: Pick<CommandContext, "selectedTaskId" | "checkedTaskIds">): Availability {
  if (command.requiresSelection && targets(ctx).length === 0) return { enabled: false, reason: "select a task first" };
  return { enabled: true };
}
