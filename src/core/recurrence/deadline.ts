// A repeating task's deadline belongs to each occurrence (PRODUCT_SPEC.md §5.3 rule 8;
// DECISIONS.md "Recurring deadlines", 2026-10-06): when the task moves on to its next
// occurrence — completed, skipped overnight or skipped just this once — the deadline
// keeps the offset it had from the occurrence's do-date. The `{…}` token is not stored
// or re-read. Kept apart from the rule engine so callers in the app shell do not pull
// rrule in.
import type { LocalDate } from "../time";

/** The deadline the next occurrence gets: `next` plus the old deadline's offset from `from`. Null stays null. */
export function deadlineForOccurrence(deadline: LocalDate | null, from: LocalDate, next: LocalDate): LocalDate | null {
  if (!deadline) return null;
  return next.add({ days: deadline.since(from).days });
}
