// What a row's ⋯ holds on each list and what each side of a swipe runs, against the web's own row (features/tasks/
// task-row.tsx, row-menu.tsx, swipe-layer.tsx and their tests): the order, what steps aside, and that a swipe's
// label is always a line of the menu.
import { Temporal, localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { snoozePresets } from "@/features/tasks/snooze";
import { moveActions, rowMenu, swipeSides, type MenuInput, type MenuItem, type RowAction } from "./row-menu";

const TODAY = localDate("2026-11-21"); // a Saturday
const PRESETS = snoozePresets(Temporal.Instant.from("2026-11-21T10:00:00Z"), "UTC", TODAY);
const task = (more: Partial<Task> = {}) => ({ id: "t1", title: "Draft the proposal", state: "active", priority: 0, estimateMin: 30, carryCount: 0, projectId: null, doDate: TODAY, doTime: null, deadline: null, startDate: null, recurrenceRule: null, ...more }) as unknown as Task;
const act = (label: string, text?: string): RowAction => ({ label, text, run: jest.fn() });
const input = (over: Partial<MenuInput> = {}): MenuInput => ({ task: task(), own: [], canComplete: true, presets: PRESETS, ...over });
/** The menu as its words, a line for each divider. */
const words = (items: readonly MenuItem[]) => items.map((i) => (i.kind === "divider" ? "—" : i.label));
const ORGANISE = ["Move to project…", "Add a tag…", "Duplicate", "Copy link"];
const SNOOZES = ["This evening", "Tomorrow", "In 4 hours", "This weekend", "Next week"];

describe("rowMenu: what the ⋯ holds, list by list", () => {
  it("Today's day row: its own moves, then Complete, the organising four, and the presets, Someday and Move to…", () => {
    const own = [act("Move up"), act("Move down"), act("Tomorrow"), act("Block Draft the proposal", "Block"), act("Convert to project")];
    const menu = rowMenu(input({ own }));
    // The row's own Tomorrow steps aside for the preset of that name: nothing is listed twice.
    expect(words(menu)).toEqual(["Move up", "Move down", "Block", "Convert to project", "Complete", ...ORGANISE, "—", ...SNOOZES, "Someday", "Move to…"]);
    // The short word is shown; the whole name is what a screen reader hears.
    expect(menu[2]).toMatchObject({ label: "Block", says: "Block Draft the proposal" });
  });

  it("a carried-over row: Today and Drop are its own; its Tomorrow and Someday are the menu's", () => {
    const own = [...moveActions({ onToday: jest.fn(), onTomorrow: jest.fn(), onSomeday: jest.fn(), onDrop: jest.fn() }), act("Convert to project")];
    expect(words(rowMenu(input({ task: task({ doDate: TODAY.subtract({ days: 2 }) }), own })))).toEqual(["Today", "Drop", "Convert to project", "Complete", ...ORGANISE, "—", ...SNOOZES, "Someday", "Move to…"]);
  });

  it("the Inbox: the lead's four are said once, so the presets lose Tomorrow and the menu its own Someday", () => {
    const lead = [act("Today"), act("Tomorrow"), act("Someday"), act("Project…")];
    const own = [...moveActions({ onToday: jest.fn(), onTomorrow: jest.fn(), onSomeday: jest.fn(), onDrop: jest.fn() }), act("This week")];
    expect(words(rowMenu(input({ task: task({ state: "inbox", doDate: null }), own, lead })))).toEqual(["Drop", "This week", "Complete", ...ORGANISE, "—", "This evening", "In 4 hours", "This weekend", "Next week", "Move to…"]);
  });

  it("Someday: Today, Back to active and Drop, every preset, and no Someday for a task already parked", () => {
    const own = [act("Today"), act("Back to active"), act("Drop")];
    expect(words(rowMenu(input({ task: task({ state: "someday", doDate: null }), own })))).toEqual(["Today", "Back to active", "Drop", "Complete", ...ORGANISE, "—", ...SNOOZES, "Move to…"]);
  });

  it("a project row: the tap path for its drag, the headings it can move under, then the rest", () => {
    const own = [act("Move up"), act("Move out of the heading", "No heading"), act("Move to Research")];
    const menu = rowMenu(input({ own }));
    // "No heading" is not part of the name, so the menu, which has room, shows the whole of it.
    expect(words(menu).slice(0, 4)).toEqual(["Move up", "Move out of the heading", "Move to Research", "Complete"]);
    expect(menu[1]).toMatchObject({ says: undefined });
  });

  it("a finished or dropped row: its own action, Duplicate and Copy link, and nothing that moves it", () => {
    expect(words(rowMenu(input({ task: task({ state: "done" }), own: [act("Reopen")], canComplete: false })))).toEqual(["Reopen", "Duplicate", "Copy link"]);
    expect(words(rowMenu(input({ task: task({ state: "dropped" }), own: [act("Restore")], canComplete: false })))).toEqual(["Restore", "Duplicate", "Copy link"]);
    // A closed row's own "Tomorrow" would have no preset to step aside for.
    expect(words(rowMenu(input({ task: task({ state: "done" }), own: [act("Tomorrow")], canComplete: false })))[0]).toBe("Tomorrow");
  });

  it("a repeat that is still on can skip an occurrence; a one-off task cannot", () => {
    expect(words(rowMenu(input({ task: task({ recurrenceRule: "FREQ=DAILY" }) })))).toContain("Skip this occurrence");
    expect(words(rowMenu(input()))).not.toContain("Skip this occurrence");
    expect(words(rowMenu(input({ task: task({ recurrenceRule: "FREQ=DAILY", state: "someday" }) })))).not.toContain("Skip this occurrence");
  });

  it("an estimate over eight hours adds Break it down where the view can convert the task", () => {
    const onBreakDown = jest.fn();
    expect(words(rowMenu(input({ task: task({ estimateMin: 9 * 60 }), onBreakDown })))[0]).toBe("Break it down");
    expect(words(rowMenu(input({ task: task({ estimateMin: 8 * 60 }), onBreakDown })))).not.toContain("Break it down");
    expect(words(rowMenu(input({ task: task({ estimateMin: 9 * 60 }) })))).not.toContain("Break it down");
  });

  it("until the account's day and zone are known the presets wait; a row that cannot be completed says no Complete", () => {
    expect(words(rowMenu(input({ presets: [], canComplete: false })))).toEqual([...ORGANISE, "—", "Someday", "Move to…"]);
  });
});

describe("swipeSides: every swipe is a line of the ⋯", () => {
  const labels = (side: readonly { label: string }[]) => side.map((s) => s.label);

  it("a row of today completes on the right and goes to Tomorrow · Someday on the left, by the menu's own writes", () => {
    const sides = swipeSides({ task: task(), own: [act("Move up")], canComplete: true }, TODAY);
    expect(sides.right).toEqual([{ label: "Complete", what: { type: "complete" } }]);
    expect(sides.left).toEqual([
      { label: "Tomorrow", what: { type: "tomorrow" } },
      { label: "Someday", what: { type: "someday" } },
    ]);
    // Each is in the menu too.
    const menu = words(rowMenu(input({ own: [act("Move up")] })));
    for (const label of [...labels(sides.right), ...labels(sides.left)]) expect(menu).toContain(label);
  });

  it("a row planned for tomorrow has only Someday on the left; one that cannot be completed has nothing on the right", () => {
    const sides = swipeSides({ task: task({ doDate: TODAY.add({ days: 1 }) }), own: [], canComplete: false }, TODAY);
    expect(sides.right).toEqual([]);
    expect(labels(sides.left)).toEqual(["Someday"]);
  });

  it("a carried-over row: Today · Tomorrow and Someday · Drop, Today and Drop from the view, the other two the menu's", () => {
    const today = jest.fn();
    const drop = jest.fn();
    const own = moveActions({ onToday: today, onTomorrow: jest.fn(), onSomeday: jest.fn(), onDrop: drop });
    const sides = swipeSides({ task: task({ doDate: TODAY.subtract({ days: 1 }) }), own, canComplete: true }, TODAY);
    expect(labels(sides.right)).toEqual(["Today", "Tomorrow"]);
    expect(labels(sides.left)).toEqual(["Someday", "Drop"]);
    expect(sides.right[0].what).toEqual({ type: "own", run: today });
    expect(sides.right[1].what).toEqual({ type: "tomorrow" });
    expect(sides.left[0].what).toEqual({ type: "someday" });
    expect(sides.left[1].what).toEqual({ type: "own", run: drop });
  });

  it("the Inbox: Today and Someday, each the lead's own choice", () => {
    const today = jest.fn();
    const someday = jest.fn();
    const lead = [
      { label: "Today", run: today },
      { label: "Someday", run: someday },
    ];
    const sides = swipeSides({ task: task({ state: "inbox", doDate: null }), own: [], lead, canComplete: true }, TODAY);
    expect(sides.right).toEqual([{ label: "Today", what: { type: "own", run: today } }]);
    expect(sides.left).toEqual([{ label: "Someday", what: { type: "own", run: someday } }]);
  });

  it("Someday: Today on the right, Drop on the left; the Logbook: Reopen or Restore on the right and nothing on the left", () => {
    const own = [act("Today"), act("Back to active"), act("Drop")];
    const parked = swipeSides({ task: task({ state: "someday", doDate: null }), own, canComplete: true }, TODAY);
    expect(labels(parked.right)).toEqual(["Today"]);
    expect(labels(parked.left)).toEqual(["Drop"]);
    const done = swipeSides({ task: task({ state: "done" }), own: [act("Reopen")], canComplete: false }, TODAY);
    expect(labels(done.right)).toEqual(["Reopen"]);
    expect(done.left).toEqual([]);
    expect(labels(swipeSides({ task: task({ state: "dropped" }), own: [act("Restore")], canComplete: false }, TODAY).right)).toEqual(["Restore"]);
  });

  it("a view that offers no way to do it has no swipe for it: a Someday row without Today does not move right", () => {
    expect(swipeSides({ task: task({ state: "someday", doDate: null }), own: [act("Drop")], canComplete: true }, TODAY).right).toEqual([]);
  });
});
