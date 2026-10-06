// The default miss policy follows the repeat (PRODUCT_SPEC.md §8.2 rule 6, A6;
// DECISIONS.md "Default miss policy", 2026-10-06): a one-off task carries and a
// repeating one skips. Giving a task its first repeat while it is on the
// one-off default turns carry into skip; Stop repeating turns skip back into
// carry. A policy the person chose otherwise is left alone. Quick-add applies
// the same rule at creation (TaskRepo.create). Kept out of the repository so
// the app shells do not carry it: only the detail panel (a lazy island) sets a
// repeat.
import type { MissPolicy, Task } from "@/core/types";

/** The miss-policy part of a patch that sets the repeat to `rule` (null: Stop repeating); empty when it stays. */
export function repeatPolicy(task: Pick<Task, "recurrenceRule" | "missPolicy">, rule: string | null): { missPolicy?: MissPolicy } {
  if (rule && !task.recurrenceRule && task.missPolicy === "carry") return { missPolicy: "skip" };
  if (!rule && task.recurrenceRule && task.missPolicy === "skip") return { missPolicy: "carry" };
  return {};
}
