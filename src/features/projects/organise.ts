// Pure helpers behind the project and area views (SCREENS.md §9): grouping a
// project's tasks under its headings and summing what a list costs.
import { compare } from "@/core/ordering";
import { compareDates, type LocalDate } from "@/core/time";
import type { Heading, Task } from "@/core/types";

export interface HeadingGroup {
  /** null for tasks with no heading, listed first. */
  heading: Heading | null;
  tasks: Task[];
}

/**
 * Tasks with no heading first, then each heading in its order. A task whose
 * heading is gone (deleted elsewhere, not yet moved up) shows under no
 * heading rather than disappearing.
 */
export function groupByHeading(tasks: readonly Task[], headings: readonly Heading[]): HeadingGroup[] {
  const known = new Set(headings.map((h) => h.id));
  const sortedTasks = [...tasks].sort(compare);
  const loose = sortedTasks.filter((t) => !t.headingId || !known.has(t.headingId));
  const groups: HeadingGroup[] = [{ heading: null, tasks: loose }];
  for (const heading of [...headings].sort(compare)) {
    groups.push({ heading, tasks: sortedTasks.filter((t) => t.headingId === heading.id) });
  }
  return groups;
}

export interface ListSummary {
  open: number;
  minutes: number;
  nextDeadline: LocalDate | null;
}

/** Open tasks, their summed estimate (unestimated ones at the default) and the earliest deadline. */
export function summarise(tasks: readonly Task[], defaultEstimateMin: number): ListSummary {
  let minutes = 0;
  let nextDeadline: LocalDate | null = null;
  let open = 0;
  for (const t of tasks) {
    if (t.state !== "inbox" && t.state !== "active") continue;
    open += 1;
    minutes += t.estimateMin ?? defaultEstimateMin;
    if (t.deadline && (!nextDeadline || compareDates(t.deadline, nextDeadline) < 0)) nextDeadline = t.deadline;
  }
  return { open, minutes, nextDeadline };
}
