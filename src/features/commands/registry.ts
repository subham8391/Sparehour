// The command registry (SCREENS.md §12, §24): every action the keyboard or
// the palette can run, as data. Shortcuts are learned from the palette,
// which shows them beside each command. What a keyed command runs, its chord
// and when it is available are command-runs.ts, the keyboard layer's half that
// the shell carries; the commands only the palette lists are palette-runs.ts;
// the words here (title, group, keywords, and where the ? overlay lists the
// key) load with the palette and the overlay. A new command is a run there and
// its words here, under the same id.
import { TODAY_SORTS } from "@/core/today/sort-options";
import { CALENDAR_RUNS } from "./calendar-commands";
import { RUNS } from "./command-runs";
import { PALETTE_RUNS, type PaletteRun } from "./palette-runs";

export { availability, keyBindings, prefillHere, targets, type Availability, type CommandContext, type PaletteScope, type Theme } from "./command-runs";
export type { PaletteContext, PaletteStep, StepAction } from "./palette-runs";

export type CommandGroup = "Create" | "Go to" | "Day" | "Selected task" | "List" | "View" | "App";
export const GROUP_ORDER: readonly CommandGroup[] = ["Selected task", "Create", "Go to", "Day", "List", "View", "App"];

/** The ? overlay's sections, in SCREENS.md §24's order. */
export const KEY_GROUPS = ["Global", "Navigation", "List and selection", "Editing the selected task", "Scheduling and snooze", "Timeline and calendar", "Rituals and the day"] as const;
export type KeyGroup = (typeof KEY_GROUPS)[number];

interface Words {
  title: string;
  group: CommandGroup;
  /** Extra words the palette matches on. */
  keywords?: string;
  /** Hidden from the palette (pure keyboard plumbing such as J/K). */
  hidden?: boolean;
  /** Where the ? overlay lists the key: its §24 section and its row there (keys sharing a row share a number). */
  keys?: readonly [KeyGroup, number];
  /** The overlay's name for the row, when it is not the palette's title (J, K, ↓ and ↑ are one "Move the selection"). */
  keyTitle?: string;
  /** Said under the row in the overlay: where the key works ("installed app"), or how it differs from its neighbour (§24 "Conflicts resolved"). */
  keyNote?: string;
}

export type Command = PaletteRun & Words;

const WORDS: Record<string, Words> = {
  "task.open": { title: "Open", group: "Selected task", keys: ["List and selection", 2], keyTitle: "Peek the task detail" },
  "task.rename": { title: "Rename in place", group: "Selected task", keywords: "edit title inline", hidden: true, keys: ["List and selection", 3], keyTitle: "Edit the title inline" },
  "task.complete": { title: "Complete", group: "Selected task", keys: ["List and selection", 4], keyTitle: "Complete / un-complete" },
  "task.uncomplete": { title: "Un-complete", group: "Selected task", keywords: "reopen restore done logbook", keys: ["List and selection", 9], keyTitle: "Un-complete (Logbook)" },
  "task.today": { title: "Move to Today", group: "Selected task", keys: ["Scheduling and snooze", 1], keyNote: "With nothing selected, back to today (Today, Calendar) or this week (Upcoming)" },
  "task.tomorrow": { title: "Tomorrow", group: "Selected task", keys: ["Scheduling and snooze", 2] },
  "task.evening": { title: "This evening", group: "Selected task", keys: ["Scheduling and snooze", 3] },
  "task.weekend": { title: "This weekend", group: "Selected task", keys: ["Scheduling and snooze", 4] },
  "task.in4h": { title: "In 4 hours", group: "Selected task", keys: ["Scheduling and snooze", 5] },
  "task.nextweek": { title: "Next week", group: "Selected task" },
  "task.menu": { title: "More actions", group: "Selected task", keywords: "menu row options snooze", keys: ["List and selection", 7], keyTitle: "Open the row’s ⋯ menu" },
  "task.move-day": { title: "Move to…", group: "Selected task", keywords: "day date reschedule snooze another day pick" },
  "task.someday": { title: "Move to Someday", group: "Selected task", keys: ["Scheduling and snooze", 7], keyTitle: "Someday", keyNote: "Shift+S is the start date" },
  "task.drop": { title: "Drop", group: "Selected task", keys: ["List and selection", 8], keyTitle: "Drop (with an undo toast)" },
  "task.priority1": { title: "Priority 1", group: "Selected task", keys: ["Editing the selected task", 7], keyTitle: "Priority · none", keyNote: "Digits are always priority, never a snooze" },
  "task.priority2": { title: "Priority 2", group: "Selected task", keys: ["Editing the selected task", 7], keyTitle: "Priority · none" },
  "task.priority3": { title: "Priority 3", group: "Selected task", keys: ["Editing the selected task", 7], keyTitle: "Priority · none" },
  "task.priority0": { title: "No priority", group: "Selected task", keys: ["Editing the selected task", 7], keyTitle: "Priority · none" },
  "task.block": { title: "Block it", group: "Selected task", keywords: "schedule time slot gap", keys: ["Scheduling and snooze", 8], keyTitle: "Block it in the next free gap that fits" },
  "task.do": { title: "Pick a date", group: "Selected task", keywords: "do date when day schedule", keys: ["Editing the selected task", 1], keyTitle: "Do-date picker" },
  "task.deadline": { title: "Set deadline", group: "Selected task", keywords: "due", keys: ["Editing the selected task", 2], keyTitle: "Deadline" },
  "task.start": { title: "Set start date", group: "Selected task", keywords: "starts after hide until", keys: ["Editing the selected task", 3], keyTitle: "Start date" },
  "task.estimate": { title: "Set estimate", group: "Selected task", keywords: "time minutes", keys: ["Editing the selected task", 4], keyTitle: "Estimate", keyNote: "Evening is Shift+E, beside the shutdown’s Cmd+Shift+E" },
  "task.repeat": { title: "Repeat", group: "Selected task", keywords: "recurring every", keys: ["Editing the selected task", 8] },
  "task.convert": { title: "Convert to project", group: "Selected task", keywords: "break it down steps checklist project" },
  "task.move-project": { title: "Move to project", group: "Selected task", keywords: "file project list #", keys: ["Editing the selected task", 5] },
  "task.add-tag": { title: "Add tag", group: "Selected task", keywords: "label tag @", keys: ["Editing the selected task", 6], keyTitle: "Add a tag" },
  "task.move": { title: "Move…", group: "Selected task", keywords: "project area file", keys: ["Editing the selected task", 9], keyTitle: "Move (project / area picker)", keyNote: "Not the morning plan: the rituals all use Cmd+Shift" },
  "task.duplicate": { title: "Duplicate", group: "Selected task", keywords: "copy again clone" },
  "task.copy-link": { title: "Copy link", group: "Selected task", keywords: "share url address" },
  "project.duplicate": { title: "Duplicate project", group: "Create", keywords: "copy clone project" },
  "task.skip-occurrence": { title: "Skip this occurrence", group: "Selected task", keywords: "repeat recurring once next" },
  "task.pause-repeats": { title: "Pause repeats until…", group: "Selected task", keywords: "repeat recurring hold break" },
  "task.resume-repeats": { title: "Resume repeats", group: "Selected task", keywords: "repeat recurring pause unpause" },
  "task.day-earlier": { title: "A day earlier", group: "Selected task", hidden: true, keys: ["Scheduling and snooze", 9], keyTitle: "A day earlier · later (Upcoming’s week)" },
  "task.day-later": { title: "A day later", group: "Selected task", hidden: true, keys: ["Scheduling and snooze", 9], keyTitle: "A day earlier · later (Upcoming’s week)" },
  "create.task": { title: "Add task", group: "Create", keywords: "new quick add", keys: ["Global", 2], keyTitle: "Quick add, from anywhere" },
  "create.task-here": { title: "Add a task in this list", group: "Create", hidden: true, keys: ["Global", 3], keyTitle: "Add a task in the current list" },
  "create.inbox": { title: "Add task to Inbox", group: "Create", keywords: "new capture quick add inbox" },
  "create.tag": { title: "Add tag…", group: "Create", keywords: "new create label @" },
  "create.block": { title: "Add time block", group: "Create", keywords: "new block of your own timeline schedule 30 minutes" },
  "create.project": { title: "Add project", group: "Create", keywords: "new project" },
  "create.area": { title: "Add area", group: "Create", keywords: "new area" },
  "go.today": { title: "Go to Today", group: "Go to", keys: ["Navigation", 1], keyTitle: "Today" },
  "go.inbox": { title: "Go to Inbox", group: "Go to", keys: ["Navigation", 2], keyTitle: "Inbox" },
  "go.upcoming": { title: "Go to Upcoming", group: "Go to", keywords: "week", keys: ["Navigation", 3], keyTitle: "Upcoming (the rolling 7 days)" },
  "go.calendar": { title: "Go to Calendar", group: "Go to", keys: ["Navigation", 4], keyTitle: "Calendar" },
  "calendar.day": { title: "Calendar: Day", group: "View", keywords: "calendar day one mode", keyNote: "In the installed app; a browser tab keeps these keys", keys: ["Navigation", 10], keyTitle: "Calendar: day · work week · week" },
  "calendar.workweek": { title: "Calendar: Work week", group: "View", keywords: "calendar five weekdays mode", keyNote: "In the installed app; a browser tab keeps these keys", keys: ["Navigation", 10], keyTitle: "Calendar: day · work week · week" },
  "calendar.week": { title: "Calendar: Week", group: "View", keywords: "calendar seven days mode", keyNote: "In the installed app; a browser tab keeps these keys", keys: ["Navigation", 10], keyTitle: "Calendar: day · work week · week" },
  "go.someday": { title: "Go to Someday", group: "Go to", keys: ["Navigation", 5], keyTitle: "Someday" },
  "go.logbook": { title: "Go to Logbook", group: "Go to", keywords: "done completed", keys: ["Navigation", 6], keyTitle: "Logbook" },
  "go.project": { title: "Go to project…", group: "Go to", keywords: "open project picker", keys: ["Navigation", 7], keyTitle: "Project picker" },
  "go.area": { title: "Go to area…", group: "Go to", keywords: "open area picker", keys: ["Navigation", 8], keyTitle: "Area picker" },
  "go.browse": { title: "Go to Browse", group: "Go to", keywords: "areas projects" },
  "go.settings": { title: "Settings", group: "Go to", keys: ["Global", 10] },
  "day.plan": { title: "Start morning plan", group: "Day", keywords: "plan the day ritual pick", keys: ["Rituals and the day", 1], keyTitle: "Morning plan" },
  "day.shutdown": { title: "Start evening shutdown", group: "Day", keywords: "close the day ritual", keys: ["Rituals and the day", 2], keyTitle: "Evening shutdown" },
  "day.plan-my-day": { title: "Plan my day", group: "Day", keywords: "schedule suggest timeline blocks", keys: ["Rituals and the day", 3] },
  "day.trim": { title: "Trim today…", group: "Day", keywords: "over too much fits move tomorrow someday" },
  "day.clear-slate": { title: "Clear the slate…", group: "Day", keywords: "archive fresh start reset backlog" },
  "day.replan": { title: "Re-plan the rest of today", group: "Day", keywords: "plan my day schedule blocks afternoon" },
  "day.tomorrow": { title: "Go to tomorrow", group: "Day", keywords: "next day step ] plan ahead" },
  "day.yesterday": { title: "Go to yesterday", group: "Day", keywords: "previous day step [ back done" },
  "day.jump": { title: "Jump to date…", group: "Day", keywords: "go to day date pick show another day" },
  "inbox.triage-all": { title: "Triage all", group: "Go to", keywords: "inbox zero one at a time" },
  "list.down": { title: "Select next", group: "List", hidden: true, keys: ["List and selection", 1], keyTitle: "Move the selection" },
  "list.up": { title: "Select previous", group: "List", hidden: true, keys: ["List and selection", 1], keyTitle: "Move the selection" },
  "list.down-arrow": { title: "Select next", group: "List", hidden: true, keys: ["List and selection", 1], keyTitle: "Move the selection" },
  "list.up-arrow": { title: "Select previous", group: "List", hidden: true, keys: ["List and selection", 1], keyTitle: "Move the selection" },
  "list.check": { title: "Tick the row for a bulk edit", group: "List", keywords: "multi select", keys: ["List and selection", 5], keyTitle: "Toggle multi-select on the row" },
  "list.check-all": { title: "Select all in this section", group: "List", keywords: "multi bulk every", keys: ["List and selection", 6], keyTitle: "Select all in the section" },
  "list.clear-checks": { title: "Clear the selection", group: "List", keywords: "deselect none" },
  // `[` and `]` step a day on Today and a week in Upcoming (SCREENS.md §24).
  "view.prev": { title: "Previous day or week", group: "View", hidden: true, keys: ["Navigation", 9], keyTitle: "Previous · next day (Today, Calendar) or week (Upcoming)" },
  "view.next": { title: "Next day or week", group: "View", hidden: true, keys: ["Navigation", 9], keyTitle: "Previous · next day (Today, Calendar) or week (Upcoming)" },
  "view.sort": { title: "Sort by…", group: "View", keywords: "order manual time priority deadline estimate" },
  "view.show-completed": { title: "Show completed", group: "View", keywords: "done finished hide" },
  "view.zoom-in": { title: "Zoom timeline in", group: "View", keywords: "zoom timeline day rows 15 5 minutes closer", keys: ["Timeline and calendar", 2], keyTitle: "Zoom in · out" },
  "view.zoom-out": { title: "Zoom timeline out", group: "View", keywords: "zoom timeline day rows 30 minutes wider", keys: ["Timeline and calendar", 2], keyTitle: "Zoom in · out" },
  "block.move": { title: "Move block to…", group: "Selected task", keywords: "block time slot timeline reschedule" },
  "block.duplicate": { title: "Duplicate block", group: "Selected task", keywords: "block copy again timeline" },
  "block.rename": { title: "Rename block", group: "Selected task", keywords: "block title name timeline" },
  "view.toggle-sidebar": { title: "Toggle sidebar", group: "View", keywords: "collapse expand rail hide show navigation", keys: ["Global", 8] },
  "view.toggle-pane": { title: "Toggle timeline", group: "View", keywords: "context pane detail day list panel hide show", keys: ["Global", 9], keyTitle: "Toggle the context pane (timeline or detail)" },
  "view.theme-light": { title: "Light theme", group: "View", keywords: "appearance" },
  "view.theme-dark": { title: "Dark theme", group: "View", keywords: "appearance" },
  "view.theme-system": { title: "Follow the system theme", group: "View", keywords: "appearance auto" },
  "app.undo": { title: "Undo", group: "App", keys: ["Global", 6], keyTitle: "Undo · Redo" },
  "app.redo": { title: "Redo", group: "App", keywords: "again undo", keys: ["Global", 6], keyTitle: "Undo · Redo" },
  "app.redo-y": { title: "Redo", group: "App", hidden: true, keys: ["Global", 6], keyTitle: "Undo · Redo" },
  "app.palette": { title: "Command palette", group: "App", hidden: true, keys: ["Global", 1] },
  "app.search": { title: "Search", group: "App", keywords: "find filter", keys: ["Global", 4] },
  "app.sync": { title: "Sync now", group: "App", keywords: "refresh upload download calendar" },
  "app.export": { title: "Export data", group: "App", keywords: "download backup json markdown csv your" },
  "app.connect-calendar": { title: "Connect calendar", group: "App", keywords: "google meetings busy sync" },
  "app.signout": { title: "Sign out", group: "App", keywords: "log out leave account device" },
  "app.shortcuts": { title: "Keyboard shortcuts", group: "App", keywords: "help keys", keys: ["Global", 5], keyTitle: "This shortcut map" },
  ...Object.fromEntries(
    TODAY_SORTS.map((o): [string, Words] => [`view.sort-${o.value}`, { title: `Sort Today by ${o.value === "manual" ? "hand (Manual)" : o.label.toLowerCase()}`, group: "View", keywords: "sort order" }]),
  ),
};

// The Calendar's mode commands are the palette's and the overlay's only: the Calendar binds their keys itself.
export const COMMANDS: readonly Command[] = [...RUNS, ...PALETTE_RUNS, ...CALENDAR_RUNS].map((r) => ({ ...r, ...WORDS[r.id] }));
