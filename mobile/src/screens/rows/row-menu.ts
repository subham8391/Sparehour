// What a task row's ⋯ holds and what each side of a swipe offers, as lists (the web builds the same from its row's
// children: features/tasks/task-row.tsx, row-menu.tsx, swipe-layer.tsx). The view's own actions come first, one that
// the menu already says in its own group stepping aside; then Complete, a repeat's Skip, the organising four; then,
// for an open task, the snooze presets, Someday and Move to…. A view's lead (the Inbox's four) heads it all and wins
// over anything of the same name. Pure: every rule here is the web's own (row-menu-rules.ts, snooze.ts, swipe.ts,
// row-words.ts); only the putting together is the phone's, and it is tested against the web's order.
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { canSkipOccurrence, isOpenTask, ownedLabels } from "@/features/tasks/row-menu-rules";
import { LONG_ESTIMATE_MIN } from "@/features/tasks/row-words";
import type { SnoozePreset } from "@/features/tasks/snooze";
import { COMPLETE, swipePlan, type SwipeSide } from "@/features/tasks/swipe";

/** One thing a view's row offers: the web's `RowAction`, without its drawing. */
export interface RowAction {
  /** Its name, and what a screen reader hears: "Tomorrow", "Block Draft the proposal". */
  label: string;
  /** What the menu shows when it is part of the label ("Block"); the menu has room for the whole word otherwise. */
  text?: string;
  run: () => void;
}

/** The move actions shared by the Inbox, Carried over, Someday and Upcoming lists (the web's `MoveActions`), in its order. */
export function moveActions(on: { onToday?: () => void; onTomorrow?: () => void; onSomeday?: () => void; onDrop?: () => void }): RowAction[] {
  return [
    ...(on.onToday ? [{ label: "Today", run: on.onToday }] : []),
    ...(on.onTomorrow ? [{ label: "Tomorrow", run: on.onTomorrow }] : []),
    ...(on.onSomeday ? [{ label: "Someday", run: on.onSomeday }] : []),
    ...(on.onDrop ? [{ label: "Drop", run: on.onDrop }] : []),
  ];
}

/** What a line of the menu does: the view's own action, or one of the menu's own, which the screen's frame runs. */
export type MenuRun =
  | { type: "own"; run: () => void }
  | { type: "complete" }
  | { type: "skip" }
  | { type: "move-project" }
  | { type: "tag" }
  | { type: "duplicate" }
  | { type: "copy-link" }
  | { type: "preset"; preset: SnoozePreset }
  | { type: "someday" }
  | { type: "move-day" };

export type MenuItem = { kind: "item"; label: string; /** A screen reader's name when the line shows a shorter word. */ says?: string; what: MenuRun } | { kind: "divider" };

export interface MenuInput {
  task: Task;
  /** The view's own actions for the row, in its order. */
  own: readonly RowAction[];
  /** The view's lead (the Inbox's Today · Tomorrow · Someday · Project…). */
  lead?: readonly RowAction[];
  /** The ring can complete the row: the menu says so too, since every swipe has a tap path. */
  canComplete: boolean;
  /** Converts the task to a project: the long-estimate hint's answer ("Break it down"). */
  onBreakDown?: () => void;
  /** The snooze presets for the account's day and zone; empty until those are known, as the web's menu waits for them. */
  presets: readonly SnoozePreset[];
}

/** The row's own actions as its menu and its swipes read them: the long hint's "Break it down" joins them. */
export function ownActions(input: Pick<MenuInput, "task" | "own" | "onBreakDown">): RowAction[] {
  const long = input.task.estimateMin != null && input.task.estimateMin > LONG_ESTIMATE_MIN;
  return long && input.onBreakDown ? [...input.own, { label: "Break it down", run: input.onBreakDown }] : [...input.own];
}

/** The word a line shows: a short text that is part of the label, else the whole label (WCAG 2.5.3, as on the web). */
const word = (a: RowAction): string => (a.text && a.label.toLowerCase().includes(a.text.toLowerCase()) ? a.text : a.label);

/** The lines under the lead, in the web's order. */
export function rowMenu(input: MenuInput): MenuItem[] {
  const { task } = input;
  const movable = isOpenTask(task.state);
  const parked = task.state === "someday";
  const led = new Set((input.lead ?? []).map((a) => a.label));
  // Only an open task's menu has a group of its own for anything to step aside for.
  const owned = movable ? ownedLabels(led, parked) : new Set<string>();
  const item = (label: string, what: MenuRun, says?: string): MenuItem => ({ kind: "item", label, what, says });
  const out: MenuItem[] = [];
  for (const a of ownActions(input)) {
    if (owned.has(a.label)) continue;
    const shown = word(a);
    out.push(item(shown, { type: "own", run: a.run }, shown !== a.label ? a.label : undefined));
  }
  if (input.canComplete && task.state !== "done") out.push(item(COMPLETE, { type: "complete" }));
  if (canSkipOccurrence(task)) out.push(item("Skip this occurrence", { type: "skip" }));
  if (movable) out.push(item("Move to project…", { type: "move-project" }), item("Add a tag…", { type: "tag" }));
  out.push(item("Duplicate", { type: "duplicate" }), item("Copy link", { type: "copy-link" }));
  if (!movable) return out;
  out.push({ kind: "divider" });
  for (const preset of input.presets) if (!led.has(preset.label)) out.push(item(preset.label, { type: "preset", preset }));
  // Someday for every open task not there yet (a Today row's left swipe has its tap path here).
  if (!parked && !led.has("Someday")) out.push(item("Someday", { type: "someday" }));
  out.push(item("Move to…", { type: "move-day" }));
  return out;
}

/** Whose action a swipe's label is: the ring's, the view's lead, the menu's own Tomorrow or Someday, or the row's own. */
export type SwipeRun = { type: "complete" } | { type: "own"; run: () => void } | { type: "tomorrow" } | { type: "someday" };

export interface SwipeItem {
  label: string;
  what: SwipeRun;
}

/**
 * What each side of the row offers, by the web's plan for the task (swipe.ts), keeping only what this row's ⋯ really
 * holds: a label is looked up as the menu lists it, the lead first, then the menu's own Tomorrow and Someday on an
 * open task, then the row's own action (swipe-layer.tsx does the same). So a swipe runs exactly what the ⋯ item runs.
 */
export function swipeSides(input: Pick<MenuInput, "task" | "own" | "lead" | "canComplete" | "onBreakDown">, today: LocalDate): Record<SwipeSide, SwipeItem[]> {
  const { task } = input;
  const own = ownActions(input);
  const open = task.state === "active" || task.state === "inbox";
  const find = (label: string): SwipeRun | null => {
    if (label === COMPLETE) return input.canComplete ? { type: "complete" } : null;
    const led = input.lead?.find((a) => a.label === label);
    if (led) return { type: "own", run: led.run };
    if (open && label === "Tomorrow") return { type: "tomorrow" };
    if (open && label === "Someday") return { type: "someday" };
    const mine = own.find((a) => a.label === label);
    return mine ? { type: "own", run: mine.run } : null;
  };
  const plan = swipePlan(task, today);
  const side = (labels: readonly string[]): SwipeItem[] => labels.flatMap((label) => {
    const what = find(label);
    return what ? [{ label, what }] : [];
  });
  return { right: side(plan.right), left: side(plan.left) };
}
