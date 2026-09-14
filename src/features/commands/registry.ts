// The command registry (SCREENS.md §12, §24): every action the keyboard or
// the palette can run, as data. Shortcuts are learned from the palette,
// which shows them beside each command.
import type { Instant, LocalDate } from "@/core/time";
import type { Priority } from "@/core/types";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { snoozePresets } from "@/features/tasks/snooze";
import type { Binding } from "./keys";

export type CommandGroup = "Create" | "Go to" | "Selected task" | "List" | "View" | "App";
export const GROUP_ORDER: readonly CommandGroup[] = ["Selected task", "Create", "Go to", "List", "View", "App"];

export type Theme = "light" | "dark" | "system";

export interface CommandContext {
  selectedTaskId: string | null;
  pathname: string;
  today: LocalDate;
  now: Instant;
  zone: string;
  tasks: TaskRepo;
  go: (href: string) => void;
  quickAdd: (prefill?: string) => void;
  openTask: (id: string) => void;
  moveSelection: (delta: 1 | -1) => void;
  openPalette: (query?: string) => void;
  openShortcuts: () => void;
  setTheme: (theme: Theme) => void;
  undo: () => void;
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
}

const onSelected =
  (fn: (ctx: CommandContext, id: string) => void | Promise<void>) =>
  (ctx: CommandContext): void | Promise<void> => {
    if (ctx.selectedTaskId) return fn(ctx, ctx.selectedTaskId);
  };

const snooze = (presetId: "evening" | "tomorrow" | "in4h" | "weekend" | "nextweek") =>
  onSelected((ctx, id) => {
    const preset = snoozePresets(ctx.now, ctx.zone, ctx.today).find((p) => p.id === presetId);
    if (preset) return ctx.tasks.update(id, preset.patch, `Moved {title} to ${preset.label.toLowerCase()}`);
  });

const priority = (value: Priority) => onSelected((ctx, id) => ctx.tasks.update(id, { priority: value }));

export const COMMANDS: readonly Command[] = [
  // ---- selected task
  { id: "task.open", title: "Open", group: "Selected task", shortcut: "enter", requiresSelection: true, run: onSelected((ctx, id) => ctx.openTask(id)) },
  { id: "task.peek", title: "Peek", group: "Selected task", shortcut: "space", requiresSelection: true, hidden: true, run: onSelected((ctx, id) => ctx.openTask(id)) },
  { id: "task.complete", title: "Complete", group: "Selected task", shortcut: "mod+enter", requiresSelection: true, run: onSelected((ctx, id) => ctx.tasks.complete(id)) },
  { id: "task.today", title: "Move to Today", group: "Selected task", shortcut: "t", requiresSelection: true, run: onSelected((ctx, id) => ctx.tasks.update(id, { doDate: ctx.today, doTime: null, evening: false }, "Moved {title} to today")) },
  { id: "task.tomorrow", title: "Tomorrow", group: "Selected task", shortcut: "shift+t", requiresSelection: true, run: snooze("tomorrow") },
  { id: "task.evening", title: "This evening", group: "Selected task", shortcut: "shift+e", requiresSelection: true, run: snooze("evening") },
  { id: "task.weekend", title: "This weekend", group: "Selected task", shortcut: "w", requiresSelection: true, run: snooze("weekend") },
  { id: "task.in4h", title: "In 4 hours", group: "Selected task", shortcut: "h", requiresSelection: true, run: snooze("in4h") },
  { id: "task.nextweek", title: "Next week", group: "Selected task", requiresSelection: true, run: snooze("nextweek") },
  { id: "task.someday", title: "Move to Someday", group: "Selected task", shortcut: "s", requiresSelection: true, run: onSelected((ctx, id) => ctx.tasks.setState(id, "someday")) },
  { id: "task.drop", title: "Drop", group: "Selected task", shortcut: "backspace", requiresSelection: true, run: onSelected((ctx, id) => ctx.tasks.setState(id, "dropped")) },
  { id: "task.priority1", title: "Priority 1", group: "Selected task", shortcut: "1", requiresSelection: true, run: priority(3) },
  { id: "task.priority2", title: "Priority 2", group: "Selected task", shortcut: "2", requiresSelection: true, run: priority(2) },
  { id: "task.priority3", title: "Priority 3", group: "Selected task", shortcut: "3", requiresSelection: true, run: priority(1) },
  { id: "task.priority0", title: "No priority", group: "Selected task", shortcut: "0", requiresSelection: true, run: priority(0) },
  { id: "task.do", title: "Set do-date", group: "Selected task", shortcut: "d", requiresSelection: true, keywords: "when day schedule", run: onSelected((ctx, id) => ctx.openTask(id)) },
  { id: "task.deadline", title: "Set deadline", group: "Selected task", shortcut: "shift+d", requiresSelection: true, keywords: "due", run: onSelected((ctx, id) => ctx.openTask(id)) },
  { id: "task.estimate", title: "Set estimate", group: "Selected task", shortcut: "e", requiresSelection: true, keywords: "time minutes", run: onSelected((ctx, id) => ctx.openTask(id)) },
  { id: "task.repeat", title: "Repeat", group: "Selected task", shortcut: "r", requiresSelection: true, keywords: "recurring every", run: onSelected((ctx, id) => ctx.openTask(id)) },

  // ---- create
  { id: "create.task", title: "Add task", group: "Create", shortcut: "q", keywords: "new quick add", run: (ctx) => ctx.quickAdd() },
  { id: "create.task-here", title: "Add a task in this list", group: "Create", shortcut: "n", hidden: true, run: (ctx) => ctx.quickAdd() },

  // ---- go to
  { id: "go.today", title: "Go to Today", group: "Go to", shortcut: "g t", run: (ctx) => ctx.go("/today") },
  { id: "go.inbox", title: "Go to Inbox", group: "Go to", shortcut: "g i", run: (ctx) => ctx.go("/inbox") },
  { id: "go.upcoming", title: "Go to Upcoming", group: "Go to", shortcut: "g u", keywords: "week", run: (ctx) => ctx.go("/upcoming") },
  { id: "go.calendar", title: "Go to Calendar", group: "Go to", shortcut: "g c", run: (ctx) => ctx.go("/calendar") },
  { id: "go.someday", title: "Go to Someday", group: "Go to", shortcut: "g s", run: (ctx) => ctx.go("/someday") },
  { id: "go.logbook", title: "Go to Logbook", group: "Go to", shortcut: "g l", keywords: "done completed", run: (ctx) => ctx.go("/logbook") },
  { id: "go.browse", title: "Go to Browse", group: "Go to", keywords: "areas projects", run: (ctx) => ctx.go("/browse") },
  { id: "go.settings", title: "Settings", group: "Go to", shortcut: "mod+,", run: (ctx) => ctx.go("/settings") },

  // ---- list plumbing
  { id: "list.down", title: "Select next", group: "List", shortcut: "j", hidden: true, run: (ctx) => ctx.moveSelection(1) },
  { id: "list.up", title: "Select previous", group: "List", shortcut: "k", hidden: true, run: (ctx) => ctx.moveSelection(-1) },
  { id: "list.down-arrow", title: "Select next", group: "List", shortcut: "arrowdown", hidden: true, run: (ctx) => ctx.moveSelection(1) },
  { id: "list.up-arrow", title: "Select previous", group: "List", shortcut: "arrowup", hidden: true, run: (ctx) => ctx.moveSelection(-1) },

  // ---- view
  { id: "view.theme-light", title: "Light theme", group: "View", keywords: "appearance", run: (ctx) => ctx.setTheme("light") },
  { id: "view.theme-dark", title: "Dark theme", group: "View", keywords: "appearance", run: (ctx) => ctx.setTheme("dark") },
  { id: "view.theme-system", title: "Follow the system theme", group: "View", keywords: "appearance auto", run: (ctx) => ctx.setTheme("system") },

  // ---- app
  { id: "app.undo", title: "Undo", group: "App", shortcut: "mod+z", run: (ctx) => ctx.undo() },
  { id: "app.palette", title: "Command palette", group: "App", shortcut: "mod+k", hidden: true, run: (ctx) => ctx.openPalette() },
  { id: "app.search", title: "Search", group: "App", shortcut: "/", keywords: "find", run: (ctx) => ctx.openPalette("") },
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
export function availability(command: Command, ctx: Pick<CommandContext, "selectedTaskId">): Availability {
  if (command.requiresSelection && !ctx.selectedTaskId) return { enabled: false, reason: "select a task first" };
  return { enabled: true };
}
