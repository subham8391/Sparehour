// The command registry (SCREENS.md §12, §24): every action the keyboard or
// the palette can run, as data. Shortcuts are learned from the palette,
// which shows them beside each command. What a command runs, its chord and
// when it is available are command-runs.ts, the keyboard layer's half that the
// shell carries; the words here (title, group, keywords) load with the palette
// and the ? overlay. A new command is a run there and its words here.
import { TODAY_SORTS } from "@/core/today/sort-options";
import { RUNS, type CommandRun } from "./command-runs";

export { availability, keyBindings, prefillHere, targets, type Availability, type CommandContext, type PaletteScope, type Theme } from "./command-runs";

export type CommandGroup = "Create" | "Go to" | "Day" | "Selected task" | "List" | "View" | "App";
export const GROUP_ORDER: readonly CommandGroup[] = ["Selected task", "Create", "Go to", "Day", "List", "View", "App"];

interface Words {
  title: string;
  group: CommandGroup;
  /** Extra words the palette matches on. */
  keywords?: string;
  /** Hidden from the palette (pure keyboard plumbing such as J/K). */
  hidden?: boolean;
}

export type Command = CommandRun & Words;

const WORDS: Record<string, Words> = {
  "task.open": { title: "Open", group: "Selected task" },
  "task.rename": { title: "Rename in place", group: "Selected task", keywords: "edit title inline", hidden: true },
  "task.complete": { title: "Complete", group: "Selected task" },
  "task.uncomplete": { title: "Un-complete", group: "Selected task", keywords: "reopen restore done logbook" },
  "task.today": { title: "Move to Today", group: "Selected task" },
  "task.tomorrow": { title: "Tomorrow", group: "Selected task" },
  "task.evening": { title: "This evening", group: "Selected task" },
  "task.weekend": { title: "This weekend", group: "Selected task" },
  "task.in4h": { title: "In 4 hours", group: "Selected task" },
  "task.nextweek": { title: "Next week", group: "Selected task" },
  "task.menu": { title: "More actions", group: "Selected task", keywords: "menu row options snooze" },
  "task.move-day": { title: "Move to…", group: "Selected task", keywords: "day date reschedule snooze another day pick" },
  "task.someday": { title: "Move to Someday", group: "Selected task" },
  "task.drop": { title: "Drop", group: "Selected task" },
  "task.priority1": { title: "Priority 1", group: "Selected task" },
  "task.priority2": { title: "Priority 2", group: "Selected task" },
  "task.priority3": { title: "Priority 3", group: "Selected task" },
  "task.priority0": { title: "No priority", group: "Selected task" },
  "task.block": { title: "Block it", group: "Selected task", keywords: "schedule time slot gap" },
  "task.do": { title: "Pick a date", group: "Selected task", keywords: "do date when day schedule" },
  "task.deadline": { title: "Set deadline", group: "Selected task", keywords: "due" },
  "task.start": { title: "Set start date", group: "Selected task", keywords: "starts after hide until" },
  "task.estimate": { title: "Set estimate", group: "Selected task", keywords: "time minutes" },
  "task.repeat": { title: "Repeat", group: "Selected task", keywords: "recurring every" },
  "task.convert": { title: "Convert to project", group: "Selected task", keywords: "break it down steps checklist project" },
  "task.move-project": { title: "Move to project", group: "Selected task", keywords: "file project list #" },
  "task.add-tag": { title: "Add tag", group: "Selected task", keywords: "label tag @" },
  "task.move": { title: "Move…", group: "Selected task", keywords: "project area file" },
  "task.duplicate": { title: "Duplicate", group: "Selected task", keywords: "copy again clone" },
  "task.copy-link": { title: "Copy link", group: "Selected task", keywords: "share url address" },
  "project.duplicate": { title: "Duplicate project", group: "Create", keywords: "copy clone project" },
  "task.skip-occurrence": { title: "Skip this occurrence", group: "Selected task", keywords: "repeat recurring once next" },
  "task.pause-repeats": { title: "Pause repeats until…", group: "Selected task", keywords: "repeat recurring hold break" },
  "task.resume-repeats": { title: "Resume repeats", group: "Selected task", keywords: "repeat recurring pause unpause" },
  "task.day-earlier": { title: "A day earlier", group: "Selected task", hidden: true },
  "task.day-later": { title: "A day later", group: "Selected task", hidden: true },
  "create.task": { title: "Add task", group: "Create", keywords: "new quick add" },
  "create.task-here": { title: "Add a task in this list", group: "Create", hidden: true },
  "create.project": { title: "Add project", group: "Create", keywords: "new project" },
  "create.area": { title: "Add area", group: "Create", keywords: "new area" },
  "go.today": { title: "Go to Today", group: "Go to" },
  "go.inbox": { title: "Go to Inbox", group: "Go to" },
  "go.upcoming": { title: "Go to Upcoming", group: "Go to", keywords: "week" },
  "go.calendar": { title: "Go to Calendar", group: "Go to" },
  "go.someday": { title: "Go to Someday", group: "Go to" },
  "go.logbook": { title: "Go to Logbook", group: "Go to", keywords: "done completed" },
  "go.project": { title: "Go to project…", group: "Go to", keywords: "open project picker" },
  "go.area": { title: "Go to area…", group: "Go to", keywords: "open area picker" },
  "go.browse": { title: "Go to Browse", group: "Go to", keywords: "areas projects" },
  "go.settings": { title: "Settings", group: "Go to" },
  "day.plan": { title: "Start morning plan", group: "Day", keywords: "plan the day ritual pick" },
  "day.shutdown": { title: "Start evening shutdown", group: "Day", keywords: "close the day ritual" },
  "day.plan-my-day": { title: "Plan my day", group: "Day", keywords: "schedule suggest timeline blocks" },
  "day.trim": { title: "Trim today…", group: "Day", keywords: "over too much fits move tomorrow someday" },
  "day.replan": { title: "Re-plan the rest of today", group: "Day", keywords: "plan my day schedule blocks afternoon" },
  "day.tomorrow": { title: "Go to tomorrow", group: "Day", keywords: "next day step ] plan ahead" },
  "day.yesterday": { title: "Go to yesterday", group: "Day", keywords: "previous day step [ back done" },
  "day.jump": { title: "Jump to date…", group: "Day", keywords: "go to day date pick show another day" },
  "inbox.triage-all": { title: "Triage all", group: "Go to", keywords: "inbox zero one at a time" },
  "list.down": { title: "Select next", group: "List", hidden: true },
  "list.up": { title: "Select previous", group: "List", hidden: true },
  "list.down-arrow": { title: "Select next", group: "List", hidden: true },
  "list.up-arrow": { title: "Select previous", group: "List", hidden: true },
  "list.check": { title: "Tick the row for a bulk edit", group: "List", keywords: "multi select" },
  "list.check-all": { title: "Select all in this section", group: "List", keywords: "multi bulk every" },
  "list.clear-checks": { title: "Clear the selection", group: "List", keywords: "deselect none" },
  // `[` and `]` step a day on Today and a week in Upcoming (SCREENS.md §24).
  "view.prev": { title: "Previous day or week", group: "View", hidden: true },
  "view.next": { title: "Next day or week", group: "View", hidden: true },
  "view.sort": { title: "Sort by…", group: "View", keywords: "order manual time priority deadline estimate" },
  "view.show-completed": { title: "Show completed", group: "View", keywords: "done finished hide" },
  "view.zoom-in": { title: "Zoom timeline in", group: "View", keywords: "zoom timeline day rows 15 5 minutes closer" },
  "view.zoom-out": { title: "Zoom timeline out", group: "View", keywords: "zoom timeline day rows 30 minutes wider" },
  "block.move": { title: "Move block to…", group: "Selected task", keywords: "block time slot timeline reschedule" },
  "block.duplicate": { title: "Duplicate block", group: "Selected task", keywords: "block copy again timeline" },
  "block.rename": { title: "Rename block", group: "Selected task", keywords: "block title name timeline" },
  "view.toggle-sidebar": { title: "Toggle sidebar", group: "View", keywords: "collapse expand rail hide show navigation" },
  "view.toggle-pane": { title: "Toggle timeline", group: "View", keywords: "context pane detail day list panel hide show" },
  "view.theme-light": { title: "Light theme", group: "View", keywords: "appearance" },
  "view.theme-dark": { title: "Dark theme", group: "View", keywords: "appearance" },
  "view.theme-system": { title: "Follow the system theme", group: "View", keywords: "appearance auto" },
  "app.undo": { title: "Undo", group: "App" },
  "app.redo": { title: "Redo", group: "App", keywords: "again undo" },
  "app.redo-y": { title: "Redo", group: "App", hidden: true },
  "app.palette": { title: "Command palette", group: "App", hidden: true },
  "app.search": { title: "Search", group: "App", keywords: "find filter" },
  "app.export": { title: "Export your data", group: "App", keywords: "download backup json markdown csv" },
  "app.connect-calendar": { title: "Connect calendar", group: "App", keywords: "google meetings busy sync" },
  "app.shortcuts": { title: "Keyboard shortcuts", group: "App", keywords: "help keys" },
  ...Object.fromEntries(
    TODAY_SORTS.map((o): [string, Words] => [`view.sort-${o.value}`, { title: `Sort Today by ${o.value === "manual" ? "hand (Manual)" : o.label.toLowerCase()}`, group: "View", keywords: "sort order" }]),
  ),
};

export const COMMANDS: readonly Command[] = RUNS.map((r) => ({ ...r, ...WORDS[r.id] }));
