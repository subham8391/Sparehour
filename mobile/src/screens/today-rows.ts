// Today's list as one run of rows for the phone's list view. Its own file, free of the screen, so it is tested plainly.
import type { Task } from "@/core/types";
import { planDrop } from "@/features/tasks/reorder";

export type RowSection = "carried" | "day" | "evening";

export type Row =
  | { kind: "header"; key: string; section: RowSection; label: string; count: number }
  | { kind: "task"; key: string; section: RowSection; task: Task; carried: boolean; /** The three-carry ask stands in for this row's actions (SCREENS.md §2.3). */ ask: boolean };

/**
 * Carried over, then the day, then this evening; a section with nothing in it is left out. `dayLabel` names the day's
 * own section when Today is stepped to another day ("Tomorrow", "Thu").
 */
export function todayRows(carried: readonly (Task & { ask?: boolean })[], day: readonly Task[], evening: readonly Task[], dayLabel = "Today"): Row[] {
  const rows: Row[] = [];
  const section = (name: RowSection, label: string, tasks: readonly (Task & { ask?: boolean })[]) => {
    if (tasks.length === 0) return;
    rows.push({ kind: "header", key: `h-${label}`, section: name, label, count: tasks.length });
    for (const task of tasks) rows.push({ kind: "task", key: task.id, section: name, task, carried: name === "carried", ask: name === "carried" && Boolean(task.ask) });
  };
  section("carried", "Carried over", carried);
  section("day", dayLabel, day);
  section("evening", "This evening", evening);
  return rows;
}

/** Above this many rows Carried over starts folded to one line (SCREENS.md §2.3; the web's page keeps the same number). */
export const CARRIED_FOLD_AT = 8;

/**
 * The key that moves a row one place up or down its list by hand, by the web's own reorder rule (a drop on the edge
 * of the row it steps past; ../../../src/features/tasks/reorder.ts). Null at the list's end, where there is nowhere to go.
 */
export function moveKey(list: readonly Pick<Task, "id" | "daySortKey">[], id: string, dir: -1 | 1): string | null {
  const i = list.findIndex((x) => x.id === id);
  const target = i < 0 ? undefined : list[i + dir];
  if (!target) return null;
  const drop = planDrop(
    list.map((x) => ({ id: x.id, key: x.daySortKey })),
    id,
    target.id,
    dir === -1 ? "top" : "bottom",
  );
  return drop?.key ?? null;
}
