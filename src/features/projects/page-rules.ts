// The rules and the worked-out words of the project and area pages (SCREENS.md §9): what a project's ⋯ offers in
// each state, the header's line of figures, where "Move to <heading>" puts a task, and what an area's project card
// says. Free of the pages that draw them, so the Android app's project and area screens ask the same questions and
// say the same words (docs/mobile/ANDROID_APP_SPEC.md §4.3); the two pages read them from here.
import { keyBetween } from "@/core/ordering";
import { formatMinutes } from "@/core/time";
import type { ProjectState } from "@/core/types";
import { progressLabel } from "@/data/queries/area";
import type { HeadingGroup, ListSummary } from "./organise";

export interface ProjectAction {
  id: "complete" | "someday" | "archive" | "activate" | "move" | "duplicate";
  label: string;
  /** The state the action writes. Left out for the two that open something instead: the area picker, the copy. */
  state?: ProjectState;
}

/**
 * The project header's ⋯, in its order (SCREENS.md §9): an active project can be completed, parked or archived, any
 * other comes back to active; then "Move to area…" and Duplicate. Every state change is undone from its toast.
 */
export function projectActions(state: ProjectState): ProjectAction[] {
  const states: ProjectAction[] =
    state === "active"
      ? [
          { id: "complete", label: "Mark complete", state: "done" },
          { id: "someday", label: "Move to Someday", state: "someday" },
          { id: "archive", label: "Archive", state: "archived" },
        ]
      : [{ id: "activate", label: "Back to active", state: "active" }];
  return [...states, { id: "move", label: "Move to area…" }, { id: "duplicate", label: "Duplicate" }];
}

/** The header's figures: "12 open · ~14h" (every list shows its time cost). */
export function summaryWords(summary: Pick<ListSummary, "open" | "minutes">): string {
  return `${summary.open} open · ~${formatMinutes(summary.minutes)}`;
}

/** The key that files a task last under `headingId` (null: under no heading), among the page's groups. */
export function keyAtEndOf(groups: readonly HeadingGroup[], headingId: string | null): string {
  const target = groups.find((g) => (g.heading?.id ?? null) === headingId);
  const last = target?.tasks[target.tasks.length - 1];
  return keyBetween(last?.sortKey ?? null, null);
}

/** The area header's count: "1 project", "3 projects". */
export function projectsWord(count: number): string {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

/** A project card's line on the area page: "3 done this week · 9 open · ~4h"; the estimate only while tasks are open. */
export function cardFigures(card: { done_week: number; open_count: number; open_min: number }): string {
  return `${progressLabel(card.done_week, card.open_count)}${card.open_count > 0 ? ` · ~${formatMinutes(card.open_min)}` : ""}`;
}

/** The deadline a project card shows: the nearest among its open tasks, else the project's own. */
export function cardDeadline(card: { next_deadline: string | null; deadline: string | null }): string | null {
  return card.next_deadline ?? card.deadline;
}
