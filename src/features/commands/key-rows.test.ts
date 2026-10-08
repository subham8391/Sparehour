import { describe, expect, it } from "vitest";
import { EXTRA_ROWS, filterSections, keySections } from "./key-rows";
import { COMMANDS, KEY_GROUPS } from "./registry";

const titles = (isMac = true) => keySections(isMac).map((s) => [s.label, s.rows.map((r) => r.title)]);
/** The row by its name; Someday is both `G S` (Navigation) and `S`, so the later section wins where two share one. */
const row = (title: string, isMac = true) => keySections(isMac).flatMap((s) => s.rows).findLast((r) => r.title === title)!;

describe("the ? overlay's rows (SCREENS.md §24)", () => {
  it("are SCREENS.md §24's seven groups, in its order", () => {
    expect(keySections(true).map((s) => s.group)).toEqual([...KEY_GROUPS]);
    expect(keySections(true).map((s) => s.label)).toEqual([
      "Global",
      "Navigation (G then a key)",
      "List and selection",
      "Editing the selected task",
      "Scheduling and snooze",
      "Timeline and calendar",
      "Rituals and the day",
    ]);
  });

  it("list every row of §24 that is built, in its order, with the keys that are no command", () => {
    expect(titles()).toEqual([
      [
        "Global",
        [
          "Command palette",
          "Quick add, from anywhere",
          "Add a task in the current list",
          "Search",
          "This shortcut map",
          "Undo · Redo",
          "Unwind one layer",
          "Toggle sidebar",
          "Toggle the context pane (timeline or detail)",
          "Settings",
          "Opens quick-add and types it",
        ],
      ],
      [
        "Navigation (G then a key)",
        [
          "Today",
          "Inbox",
          "Upcoming (the rolling 7 days)",
          "Calendar",
          "Someday",
          "Logbook",
          "Project picker",
          "Area picker",
          "Previous · next day (Today, Calendar) or week (Upcoming)",
          "Calendar: day · work week · week",
        ],
      ],
      [
        "List and selection",
        [
          "Move the selection",
          "Peek the task detail",
          "Edit the title inline",
          "Complete / un-complete",
          "Toggle multi-select on the row",
          "Select all in the section",
          "Open the row’s ⋯ menu",
          "Drop (with an undo toast)",
          "Un-complete (Logbook)",
        ],
      ],
      [
        "Editing the selected task",
        ["Do-date picker", "Deadline", "Start date", "Estimate", "Move to project", "Add a tag", "Priority · none", "Repeat", "Move (project / area picker)"],
      ],
      [
        "Scheduling and snooze",
        ["Move to Today", "Tomorrow", "This evening", "This weekend", "In 4 hours", "This evening · Tomorrow · In 4 hours · This weekend · Next week · Move to… (the row’s ⋯ menu)", "Someday", "Block it in the next free gap that fits", "A day earlier · later (Upcoming’s week)"],
      ],
      [
        "Timeline and calendar",
        ["Lock / unlock the selected block", "Zoom in · out", "Duplicate a block", "Remove the selected block (the task stays)", "Shorten or lengthen the selected block"],
      ],
      ["Rituals and the day", ["Morning plan", "Evening shutdown", "Plan my day"]],
    ]);
  });

  it("put two keys for one action on one row", () => {
    expect(row("Move the selection").keys).toEqual(["J", "K", "↓", "↑"]);
    expect(row("Priority · none").keys).toEqual(["1", "2", "3", "0"]);
    expect(row("Undo · Redo").keys).toEqual(["⌘Z", "⌘⇧Z"]);
    // Ctrl+Y is Windows' redo; a Mac browser keeps ⌘Y for its History, so the overlay leaves it out there.
    expect(row("Undo · Redo", false).keys).toEqual(["Ctrl+Z", "Ctrl+Shift+Z", "Ctrl+Y"]);
    expect(row("Calendar: day · work week · week").keys).toEqual(["⌘1", "⌘2", "⌘3"]);
    expect(row("Duplicate a block")).toMatchObject({ keys: ["⌥"], words: "drag" });
    expect(row("Opens quick-add and types it")).toMatchObject({ keys: [], words: "Any character, nothing focused" });
    expect(row("This evening · Tomorrow · In 4 hours · This weekend · Next week · Move to… (the row’s ⋯ menu)")).toMatchObject({ keys: ["."], words: "then a preset" });
  });

  it("note the four conflicts under the key itself", () => {
    expect(row("Move to Today").note).toMatch(/nothing selected, back to today/);
    expect(row("Someday").note).toBe("Shift+S is the start date");
    expect(row("Estimate").note).toMatch(/^Evening is Shift\+E/);
    expect(row("Move (project / area picker)").note).toMatch(/^Not the morning plan/);
  });

  it("come from the registry: every keyed command has a place, and no two actions share one", () => {
    const keyed = COMMANDS.filter((c) => c.shortcut);
    expect(keyed.filter((c) => !c.keys).map((c) => c.id)).toEqual([]);
    const byPlace = new Map<string, Set<string>>();
    for (const c of keyed) {
      const at = c.keys!.join(":");
      byPlace.set(at, (byPlace.get(at) ?? new Set()).add(c.keyTitle ?? c.title));
    }
    for (const x of EXTRA_ROWS) {
      const at = `${x.group}:${x.at}`;
      expect(byPlace.has(at), at).toBe(false);
    }
    expect([...byPlace].filter(([, names]) => names.size > 1)).toEqual([]);
  });
});

describe("the overlay's search", () => {
  const sections = keySections(true);
  const found = (q: string) => filterSections(sections, q).flatMap((s) => s.rows.map((r) => r.title));

  it("matches the action's name and its notes", () => {
    expect(found("evening")).toEqual(["Estimate", "This evening", "This evening · Tomorrow · In 4 hours · This weekend · Next week · Move to… (the row’s ⋯ menu)", "Evening shutdown"]);
  });

  it("matches a key by its name, though a Mac shows a glyph", () => {
    expect(found("shift")).toEqual(expect.arrayContaining(["Undo · Redo", "Deadline", "Start date", "Tomorrow", "This evening", "Morning plan", "Someday"]));
    expect(found("shift d")).toContain("Deadline");
    expect(found("shift d")).not.toContain("Do-date picker");
    expect(found("⇧D")).toEqual(["Deadline"]);
    expect(found("esc")).toEqual(["Unwind one layer"]);
    expect(found("cmd k")).toEqual(["Command palette"]);
    expect(found("g t")[0]).toBe("Today");
  });

  it("finds nothing for words no row has, and every row for an empty search", () => {
    expect(filterSections(sections, "zebra")).toEqual([]);
    expect(filterSections(sections, "  ")).toEqual(sections);
  });
});
