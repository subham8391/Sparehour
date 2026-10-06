// What Today's list area says when it has no rows of its own (SCREENS.md §2.7,
// ONBOARDING.md §4). Pure, so the rule is tested apart from the page.

export interface DayCounts {
  /** The shutdown has closed the day: its summary speaks instead. */
  closed: boolean;
  carried: number;
  today: number;
  evening: number;
  /** Tasks finished today. */
  done: number;
}

/**
 * "all-done": everything planned for today is finished — at least one thing was, and nothing is left on today or
 * this evening ("That's everything you planned."). "empty": nothing planned, nothing carried, nothing finished —
 * the planning prompt. "planned" otherwise (the rows speak for themselves).
 */
export function dayState(c: DayCounts): "all-done" | "empty" | "planned" {
  if (c.closed) return "planned";
  if (c.today === 0 && c.evening === 0 && c.done > 0) return "all-done";
  if (c.today === 0 && c.carried === 0 && c.done === 0) return "empty";
  return "planned";
}
